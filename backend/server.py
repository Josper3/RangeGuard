from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Query, Header
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import asyncio
import bcrypt
import jwt
from functools import wraps
import gpxpy
from shapely.geometry import shape, LineString, Polygon, mapping
from shapely.ops import unary_union
import json
import io
import dns.resolver
from fpdf import FPDF

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')


# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'rangeguard-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "user"
    organization_name: Optional[str] = None
    cif: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    organization_name: Optional[str] = None
    created_at: str

class ZoneCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    geometry: dict  # GeoJSON polygon
    start_time: str  # ISO datetime string
    end_time: str    # ISO datetime string
    buffer_meters: int = 200

class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    geometry: Optional[dict] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    buffer_meters: Optional[int] = None

class ZoneResponse(BaseModel):
    id: str
    name: str
    description: str
    geometry: dict
    buffered_geometry: Optional[dict] = None
    start_time: str
    end_time: str
    buffer_meters: int
    created_by: str
    association_name: str
    created_at: str

class RouteResponse(BaseModel):
    id: str
    name: str
    geometry: dict
    user_id: str
    file_name: str
    created_at: str

class IntersectionRequest(BaseModel):
    route_id: Optional[str] = None
    route_geometry: Optional[dict] = None
    check_time: Optional[str] = None

class IntersectionResult(BaseModel):
    intersects: bool
    zones: List[dict] = []
    safe_message: str = ""

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc).timestamp() + 86400 * 7
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_optional_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        token = authorization.split(" ")[1]
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
        return user
    except Exception:
        return None

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(data: UserRegister):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": data.email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "role": data.role,
        "organization_name": data.organization_name or "",
        "cif": data.cif or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id, data.role)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": data.email,
            "name": data.name,
            "role": data.role,
            "organization_name": data.organization_name or "",
            "created_at": user_doc["created_at"]
        }
    }

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "organization_name": user.get("organization_name", ""),
            "created_at": user["created_at"]
        }
    }

@api_router.get("/auth/me")
async def get_me(user = Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "organization_name": user.get("organization_name", ""),
        "created_at": user["created_at"]
    }

# ==================== ZONE ROUTES ====================

def compute_buffer(geometry: dict, buffer_meters: int) -> dict:
    """Compute buffer around a polygon in approximate meters."""
    try:
        geom = shape(geometry)
        # Approximate: 1 degree ~ 111320 meters at equator
        buffer_deg = buffer_meters / 111320.0
        buffered = geom.buffer(buffer_deg)
        return mapping(buffered)
    except Exception as e:
        logger.error(f"Buffer computation error: {e}")
        return geometry

@api_router.post("/zones")
async def create_zone(data: ZoneCreate, user = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create zones")
    
    zone_id = str(uuid.uuid4())
    buffered_geom = compute_buffer(data.geometry, data.buffer_meters)
    
    zone_doc = {
        "id": zone_id,
        "name": data.name,
        "description": data.description or "",
        "geometry": data.geometry,
        "buffered_geometry": buffered_geom,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "buffer_meters": data.buffer_meters,
        "created_by": user["id"],
        "association_name": user.get("organization_name", user["name"]),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.zones.insert_one(zone_doc)
    
    zone_doc.pop("_id", None)
    
    # Background: check existing routes against this new zone and notify users
    asyncio.create_task(check_routes_against_new_zone(zone_doc))
    
    return zone_doc

@api_router.get("/zones")
async def get_zones(
    active: Optional[bool] = None,
    date: Optional[str] = None
):
    query = {}
    if active or date:
        check_time = date if date else datetime.now(timezone.utc).isoformat()
        query = {
            "start_time": {"$lte": check_time},
            "end_time": {"$gte": check_time}
        }
    
    zones = await db.zones.find(query, {"_id": 0}).to_list(1000)
    return zones

@api_router.get("/zones/my/list")
async def get_my_zones(user = Depends(get_current_user)):
    zones = await db.zones.find({"created_by": user["id"]}, {"_id": 0}).to_list(1000)
    return zones

@api_router.get("/zones/{zone_id}")
async def get_zone(zone_id: str):
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    return zone

@api_router.put("/zones/{zone_id}")
async def update_zone(zone_id: str, data: ZoneUpdate, user = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update zones")
    
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    if zone["created_by"] != user["id"]:
        raise HTTPException(status_code=403, detail="You can only edit your own zones")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    if "geometry" in update_data:
        buffer_m = update_data.get("buffer_meters", zone["buffer_meters"])
        update_data["buffered_geometry"] = compute_buffer(update_data["geometry"], buffer_m)
    elif "buffer_meters" in update_data:
        update_data["buffered_geometry"] = compute_buffer(zone["geometry"], update_data["buffer_meters"])
    
    if update_data:
        await db.zones.update_one({"id": zone_id}, {"$set": update_data})
    
    updated = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    return updated

@api_router.delete("/zones/{zone_id}")
async def delete_zone(zone_id: str, user = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete zones")
    
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    if zone["created_by"] != user["id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own zones")
    
    await db.zones.delete_one({"id": zone_id})
    return {"message": "Zone deleted"}

# ==================== ROUTE ROUTES ====================

@api_router.post("/routes/upload")
async def upload_route(
    file: UploadFile = File(...),
    name: str = Form(""),
    authorization: Optional[str] = Header(None)
):
    user = await get_optional_user(authorization)
    
    content = await file.read()
    content_str = content.decode('utf-8')
    
    # Parse GPX
    try:
        gpx = gpxpy.parse(content_str)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid GPX file: {str(e)}")
    
    # Extract coordinates
    coordinates = []
    for track in gpx.tracks:
        for segment in track.segments:
            for point in segment.points:
                coordinates.append([point.longitude, point.latitude])
    
    if not coordinates or len(coordinates) < 2:
        # Try waypoints
        for wpt in gpx.waypoints:
            coordinates.append([wpt.longitude, wpt.latitude])
    
    if len(coordinates) < 2:
        raise HTTPException(status_code=400, detail="GPX file has insufficient points")
    
    geometry = {
        "type": "LineString",
        "coordinates": coordinates
    }
    
    route_name = name or gpx.name or file.filename or "Unnamed Route"
    route_id = str(uuid.uuid4())
    user_id = user["id"] if user else "anonymous"
    
    route_doc = {
        "id": route_id,
        "name": route_name,
        "geometry": geometry,
        "user_id": user_id,
        "file_name": file.filename,
        "is_public": True,
        "owner_name": user["name"] if user else "Anonymous",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.routes.insert_one(route_doc)
    route_doc.pop("_id", None)
    
    # Check this route against all active zones and notify user
    if user and user_id != "anonymous":
        asyncio.create_task(check_uploaded_route_against_zones(route_doc, user_id))
    
    return route_doc

@api_router.get("/routes")
async def get_routes(user = Depends(get_current_user)):
    routes = await db.routes.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)
    return routes

@api_router.get("/routes/public")
async def get_public_routes(search: Optional[str] = None):
    """Get all public routes for browsing."""
    query = {"is_public": {"$ne": False}}
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    routes = await db.routes.find(query, {"_id": 0}).to_list(500)
    # Strip geometry coordinates for listing (too much data) - include summary
    result = []
    for r in routes:
        coords = r.get("geometry", {}).get("coordinates", [])
        result.append({
            "id": r["id"],
            "name": r["name"],
            "user_id": r["user_id"],
            "owner_name": r.get("owner_name", "Unknown"),
            "file_name": r.get("file_name", ""),
            "is_public": r.get("is_public", True),
            "point_count": len(coords),
            "created_at": r["created_at"],
            "geometry": r["geometry"]
        })
    return result

@api_router.get("/routes/{route_id}")
async def get_route_detail(route_id: str):
    """Get a single route with full geometry."""
    route = await db.routes.find_one({"id": route_id}, {"_id": 0})
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return route

@api_router.put("/routes/{route_id}/visibility")
async def toggle_route_visibility(route_id: str, user = Depends(get_current_user)):
    """Toggle a route's public/private status."""
    route = await db.routes.find_one({"id": route_id}, {"_id": 0})
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    if route["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your route")
    new_vis = not route.get("is_public", True)
    await db.routes.update_one({"id": route_id}, {"$set": {"is_public": new_vis}})
    return {"is_public": new_vis}

# ==================== FAVORITES ====================

@api_router.post("/favorites/{route_id}")
async def add_favorite(route_id: str, user = Depends(get_current_user)):
    """Add a route to user's favorites."""
    route = await db.routes.find_one({"id": route_id}, {"_id": 0})
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    
    existing = await db.favorites.find_one({"user_id": user["id"], "route_id": route_id})
    if existing:
        raise HTTPException(status_code=400, detail="Already in favorites")
    
    fav_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "route_id": route_id,
        "route_name": route["name"],
        "owner_name": route.get("owner_name", "Unknown"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.favorites.insert_one(fav_doc)
    fav_doc.pop("_id", None)
    return fav_doc

@api_router.delete("/favorites/{route_id}")
async def remove_favorite(route_id: str, user = Depends(get_current_user)):
    """Remove a route from user's favorites."""
    result = await db.favorites.delete_one({"user_id": user["id"], "route_id": route_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not in favorites")
    return {"message": "Removed from favorites"}

@api_router.get("/favorites")
async def get_favorites(user = Depends(get_current_user)):
    """Get user's favorite routes with full route data."""
    favs = await db.favorites.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    route_ids = [f["route_id"] for f in favs]
    routes = await db.routes.find({"id": {"$in": route_ids}}, {"_id": 0}).to_list(500)
    routes_map = {r["id"]: r for r in routes}
    
    result = []
    for fav in favs:
        route = routes_map.get(fav["route_id"])
        if route:
            result.append({
                "favorite_id": fav["id"],
                "route_id": fav["route_id"],
                "route_name": route["name"],
                "owner_name": route.get("owner_name", "Unknown"),
                "geometry": route["geometry"],
                "is_own": route["user_id"] == user["id"],
                "favorited_at": fav["created_at"],
                "route_created_at": route["created_at"]
            })
    return result

@api_router.get("/favorites/ids")
async def get_favorite_ids(user = Depends(get_current_user)):
    """Get just the route IDs the user has favorited (for quick UI checks)."""
    favs = await db.favorites.find({"user_id": user["id"]}, {"_id": 0, "route_id": 1}).to_list(500)
    return [f["route_id"] for f in favs]

@api_router.delete("/routes/{route_id}")
async def delete_route(route_id: str, user = Depends(get_current_user)):
    route = await db.routes.find_one({"id": route_id}, {"_id": 0})
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    if route["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your route")
    await db.routes.delete_one({"id": route_id})
    return {"message": "Route deleted"}

# ==================== INTERSECTION CHECK ====================

def check_route_against_zones(route_shape, active_zones):
    """Check a route against active zones. Returns list of conflicts."""
    conflicts = []
    for zone in active_zones:
        try:
            # Check against both original and buffered geometry
            zone_geom = zone.get("buffered_geometry", zone["geometry"])
            zone_shape = shape(zone_geom)
            original_zone_shape = shape(zone["geometry"])
            
            # Check containment first (route fully inside zone)
            is_contained = original_zone_shape.contains(route_shape) or zone_shape.contains(route_shape)
            is_intersecting = route_shape.intersects(zone_shape)
            is_within_buffer = (not original_zone_shape.intersects(route_shape)) and zone_shape.intersects(route_shape)
            
            if is_contained or is_intersecting:
                if is_contained:
                    overlap_pct = 100.0
                    conflict_type = "contained"  # Route fully inside zone
                elif is_within_buffer:
                    intersection = route_shape.intersection(zone_shape)
                    overlap_length = intersection.length if hasattr(intersection, 'length') else 0
                    route_length = route_shape.length if route_shape.length > 0 else 1
                    overlap_pct = min(round((overlap_length / route_length) * 100, 1), 100)
                    conflict_type = "buffer"  # Route in buffer zone only
                else:
                    intersection = route_shape.intersection(zone_shape)
                    overlap_length = intersection.length if hasattr(intersection, 'length') else 0
                    route_length = route_shape.length if route_shape.length > 0 else 1
                    overlap_pct = min(round((overlap_length / route_length) * 100, 1), 100)
                    conflict_type = "intersects"
                
                conflicts.append({
                    "zone_id": zone["id"],
                    "zone_name": zone["name"],
                    "association": zone.get("association_name", ""),
                    "start_time": zone["start_time"],
                    "end_time": zone["end_time"],
                    "overlap_percentage": overlap_pct,
                    "conflict_type": conflict_type,
                    "buffer_meters": zone.get("buffer_meters", 200),
                    "geometry": zone["geometry"],
                    "buffered_geometry": zone.get("buffered_geometry")
                })
        except Exception as e:
            logger.error(f"Intersection check error for zone {zone.get('id')}: {e}")
            continue
    return conflicts

@api_router.post("/check-intersection")
async def check_intersection(data: IntersectionRequest):
    check_time = data.check_time or datetime.now(timezone.utc).isoformat()
    
    # Get route geometry
    route_geom_data = data.route_geometry
    if data.route_id:
        route = await db.routes.find_one({"id": data.route_id}, {"_id": 0})
        if not route:
            raise HTTPException(status_code=404, detail="Route not found")
        route_geom_data = route["geometry"]
    
    if not route_geom_data:
        raise HTTPException(status_code=400, detail="No route geometry provided")
    
    # Get active zones at the given time
    active_zones = await db.zones.find({
        "start_time": {"$lte": check_time},
        "end_time": {"$gte": check_time}
    }, {"_id": 0}).to_list(1000)
    
    if not active_zones:
        return {
            "intersects": False,
            "zones": [],
            "safe_message": "No active hunting zones at the selected time."
        }
    
    try:
        route_shape = shape(route_geom_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid route geometry: {str(e)}")
    
    conflicts = check_route_against_zones(route_shape, active_zones)
    
    has_contained = any(c["conflict_type"] == "contained" for c in conflicts)
    has_intersect = any(c["conflict_type"] == "intersects" for c in conflicts)
    
    if has_contained:
        msg = "CRITICAL: Your entire route is inside an active hunting zone!"
    elif has_intersect:
        msg = "WARNING: Your route crosses active hunting zones!"
    elif conflicts:
        msg = "CAUTION: Your route enters a buffer/safety zone near hunting areas."
    else:
        msg = "Safe: No conflicts with active hunting zones."
    
    return {
        "intersects": len(conflicts) > 0,
        "zones": conflicts,
        "safe_message": msg
    }

# ==================== NOTIFICATIONS ====================

@api_router.get("/notifications")
async def get_notifications(user = Depends(get_current_user)):
    notifications = await db.notifications.find(
        {"user_id": user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return notifications

@api_router.get("/notifications/unread-count")
async def get_unread_count(user = Depends(get_current_user)):
    count = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"count": count}

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user = Depends(get_current_user)):
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": user["id"]},
        {"$set": {"read": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Marked as read"}

@api_router.put("/notifications/read-all")
async def mark_all_read(user = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": user["id"], "read": False},
        {"$set": {"read": True}}
    )
    return {"message": "All marked as read"}

@api_router.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str, user = Depends(get_current_user)):
    await db.notifications.delete_one({"id": notification_id, "user_id": user["id"]})
    return {"message": "Deleted"}

async def create_notification(user_id: str, notif_type: str, title: str, message: str, data: dict = None):
    """Create a notification for a user."""
    notif_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": notif_type,  # "zone_conflict", "new_zone", "route_warning"
        "title": title,
        "message": message,
        "data": data or {},
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notif_doc)
    return notif_doc

async def check_routes_against_new_zone(zone_doc):
    """When a new zone is created, check all existing routes and notify affected users (owners + favorites)."""
    try:
        zone_shape = shape(zone_doc.get("buffered_geometry", zone_doc["geometry"]))
        original_zone_shape = shape(zone_doc["geometry"])
        
        all_routes = await db.routes.find({}, {"_id": 0}).to_list(5000)
        
        for route in all_routes:
            try:
                route_shape = shape(route["geometry"])
                is_contained = original_zone_shape.contains(route_shape) or zone_shape.contains(route_shape)
                is_intersecting = route_shape.intersects(zone_shape)
                
                if is_contained or is_intersecting:
                    if is_contained:
                        conflict_type = "contained"
                        overlap_pct = 100.0
                    else:
                        conflict_type = "intersects"
                        intersection = route_shape.intersection(zone_shape)
                        overlap_length = intersection.length if hasattr(intersection, 'length') else 0
                        route_length = route_shape.length if route_shape.length > 0 else 1
                        overlap_pct = min(round((overlap_length / route_length) * 100, 1), 100)
                    
                    notif_data = {
                        "route_id": route["id"],
                        "route_name": route["name"],
                        "zone_id": zone_doc["id"],
                        "zone_name": zone_doc["name"],
                        "conflict_type": conflict_type,
                        "zone_start": zone_doc["start_time"],
                        "zone_end": zone_doc["end_time"]
                    }
                    
                    # Collect all users to notify (owner + favoriters)
                    users_to_notify = set()
                    if route["user_id"] != "anonymous":
                        users_to_notify.add(route["user_id"])
                    
                    # Find users who favorited this route
                    favs = await db.favorites.find({"route_id": route["id"]}, {"_id": 0}).to_list(5000)
                    for fav in favs:
                        users_to_notify.add(fav["user_id"])
                    
                    for uid in users_to_notify:
                        is_owner = uid == route["user_id"]
                        if is_contained:
                            title = f"CRITICAL: {'Your' if is_owner else 'Favorite'} route '{route['name']}' inside new zone"
                            message = (
                                f"{'Your' if is_owner else 'Favorite'} route '{route['name']}' is completely inside "
                                f"the new hunting zone '{zone_doc['name']}' ({zone_doc.get('association_name', '')}).\n"
                                f"Active: {zone_doc['start_time'][:16]} - {zone_doc['end_time'][:16]}.\n"
                                f"Do NOT use this route during hunting hours."
                            )
                        else:
                            title = f"WARNING: {'Your' if is_owner else 'Favorite'} route '{route['name']}' crosses new zone"
                            message = (
                                f"{'Your' if is_owner else 'Favorite'} route '{route['name']}' intersects ({overlap_pct}%) "
                                f"with the new hunting zone '{zone_doc['name']}' ({zone_doc.get('association_name', '')}).\n"
                                f"Active: {zone_doc['start_time'][:16]} - {zone_doc['end_time'][:16]}.\n"
                                f"Review this route before heading out."
                            )
                        
                        await create_notification(
                            user_id=uid,
                            notif_type="zone_conflict",
                            title=title,
                            message=message,
                            data=notif_data
                        )
            except Exception as e:
                logger.error(f"Error checking route {route.get('id')} against new zone: {e}")
                continue
    except Exception as e:
        logger.error(f"Error in check_routes_against_new_zone: {e}")

async def check_uploaded_route_against_zones(route_doc, user_id):
    """When a route is uploaded, check against all zones (current and future) and notify."""
    try:
        route_shape = shape(route_doc["geometry"])
        
        # Get all zones (not just active - include future ones)
        all_zones = await db.zones.find(
            {"end_time": {"$gte": datetime.now(timezone.utc).isoformat()}},
            {"_id": 0}
        ).to_list(5000)
        
        for zone in all_zones:
            try:
                zone_shape = shape(zone.get("buffered_geometry", zone["geometry"]))
                original_zone_shape = shape(zone["geometry"])
                
                is_contained = original_zone_shape.contains(route_shape) or zone_shape.contains(route_shape)
                is_intersecting = route_shape.intersects(zone_shape)
                
                if is_contained or is_intersecting:
                    if is_contained:
                        title = f"CRITICAL: '{route_doc['name']}' is inside hunting zone '{zone['name']}'"
                        message = (
                            f"Your newly uploaded route '{route_doc['name']}' is completely inside "
                            f"the hunting zone '{zone['name']}' ({zone.get('association_name', '')}).\n"
                            f"Active period: {zone['start_time'][:16]} - {zone['end_time'][:16]}.\n"
                            f"Do NOT use this route during hunting hours."
                        )
                        conflict_type = "contained"
                    else:
                        intersection = route_shape.intersection(zone_shape)
                        overlap_length = intersection.length if hasattr(intersection, 'length') else 0
                        route_length = route_shape.length if route_shape.length > 0 else 1
                        overlap_pct = min(round((overlap_length / route_length) * 100, 1), 100)
                        title = f"WARNING: '{route_doc['name']}' crosses hunting zone '{zone['name']}'"
                        message = (
                            f"Your route '{route_doc['name']}' intersects ({overlap_pct}%) with "
                            f"the hunting zone '{zone['name']}' ({zone.get('association_name', '')}).\n"
                            f"Active period: {zone['start_time'][:16]} - {zone['end_time'][:16]}.\n"
                            f"Avoid this area during hunting hours."
                        )
                        conflict_type = "intersects"
                    
                    await create_notification(
                        user_id=user_id,
                        notif_type="route_warning",
                        title=title,
                        message=message,
                        data={
                            "route_id": route_doc["id"],
                            "route_name": route_doc["name"],
                            "zone_id": zone["id"],
                            "zone_name": zone["name"],
                            "conflict_type": conflict_type,
                            "zone_start": zone["start_time"],
                            "zone_end": zone["end_time"]
                        }
                    )
            except Exception as e:
                logger.error(f"Error checking zone {zone.get('id')} for uploaded route: {e}")
                continue
    except Exception as e:
        logger.error(f"Error in check_uploaded_route_against_zones: {e}")

# ==================== PDF REPORT ====================

@api_router.post("/reports/pdf")
async def generate_pdf_report(data: IntersectionRequest):
    # First run intersection check
    check_time = data.check_time or datetime.now(timezone.utc).isoformat()
    
    route_geom_data = data.route_geometry
    route_name = "Uploaded Route"
    if data.route_id:
        route = await db.routes.find_one({"id": data.route_id}, {"_id": 0})
        if not route:
            raise HTTPException(status_code=404, detail="Route not found")
        route_geom_data = route["geometry"]
        route_name = route.get("name", "Route")
    
    if not route_geom_data:
        raise HTTPException(status_code=400, detail="No route geometry provided")
    
    active_zones = await db.zones.find({
        "start_time": {"$lte": check_time},
        "end_time": {"$gte": check_time}
    }, {"_id": 0}).to_list(1000)
    
    route_shape = shape(route_geom_data)
    intersecting = []
    for zone in active_zones:
        try:
            zone_geom = zone.get("buffered_geometry", zone["geometry"])
            zone_shape = shape(zone_geom)
            if route_shape.intersects(zone_shape):
                intersection = route_shape.intersection(zone_shape)
                overlap_length = intersection.length if hasattr(intersection, 'length') else 0
                route_length = route_shape.length if route_shape.length > 0 else 1
                overlap_pct = min(round((overlap_length / route_length) * 100, 1), 100)
                intersecting.append({
                    "name": zone["name"],
                    "association": zone.get("association_name", ""),
                    "start": zone["start_time"],
                    "end": zone["end_time"],
                    "overlap": f"{overlap_pct}%"
                })
        except Exception:
            continue
    
    # Generate PDF
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 15, "RangeGuard - Safety Report", ln=True, align="C")
    pdf.ln(5)
    
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(0, 8, f"Route: {route_name}", ln=True)
    pdf.cell(0, 8, f"Check Time: {check_time}", ln=True)
    pdf.cell(0, 8, f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", ln=True)
    pdf.ln(5)
    
    if intersecting:
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(220, 50, 50)
        pdf.cell(0, 10, f"WARNING: {len(intersecting)} intersection(s) found!", ln=True)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(3)
        
        pdf.set_font("Helvetica", "B", 10)
        col_widths = [50, 40, 35, 35, 25]
        headers = ["Zone Name", "Association", "Start", "End", "Overlap"]
        for i, h in enumerate(headers):
            pdf.cell(col_widths[i], 8, h, border=1)
        pdf.ln()
        
        pdf.set_font("Helvetica", "", 9)
        for z in intersecting:
            pdf.cell(col_widths[0], 7, z["name"][:25], border=1)
            pdf.cell(col_widths[1], 7, z["association"][:20], border=1)
            pdf.cell(col_widths[2], 7, z["start"][:16], border=1)
            pdf.cell(col_widths[3], 7, z["end"][:16], border=1)
            pdf.cell(col_widths[4], 7, z["overlap"], border=1)
            pdf.ln()
    else:
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(16, 185, 129)
        pdf.cell(0, 10, "SAFE: No intersections with active hunting zones.", ln=True)
        pdf.set_text_color(0, 0, 0)
    
    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 9)
    pdf.cell(0, 6, "This report is informational. Always verify locally and follow safety guidelines.", ln=True)
    pdf.cell(0, 6, "RangeGuard - Promoting coexistence between hikers and hunters.", ln=True)
    
    buffer = io.BytesIO()
    pdf_output = pdf.output()
    buffer.write(pdf_output)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=rangeguard_report_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.pdf"}
    )

# ==================== PUBLIC STATS ====================

@api_router.get("/stats")
async def get_stats():
    total_zones = await db.zones.count_documents({})
    now = datetime.now(timezone.utc).isoformat()
    active_zones = await db.zones.count_documents({
        "start_time": {"$lte": now},
        "end_time": {"$gte": now}
    })
    total_users = await db.users.count_documents({})
    total_routes = await db.routes.count_documents({})
    return {
        "total_zones": total_zones,
        "active_zones": active_zones,
        "total_users": total_users,
        "total_routes": total_routes
    }

@api_router.get("/")
async def root():
    return {"message": "RangeGuard API running"}

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_db():
    # Create indexes for geospatial queries
    try:
        await db.zones.create_index("id", unique=True)
        await db.users.create_index("id", unique=True)
        await db.users.create_index("email", unique=True)
        await db.routes.create_index("id", unique=True)
        await db.routes.create_index("user_id")
        await db.notifications.create_index("id", unique=True)
        await db.notifications.create_index([("user_id", 1), ("read", 1)])
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        await db.favorites.create_index([("user_id", 1), ("route_id", 1)], unique=True)
        await db.favorites.create_index("route_id")
        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.error(f"Index creation error: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
