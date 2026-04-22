from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Query, Header
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone
import asyncio
import bcrypt
import jwt
import gpxpy
from shapely.geometry import shape, mapping
import json
import io
from fpdf import FPDF

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'rangeguard-secret-key')
JWT_ALGORITHM = "HS256"

SPECIES_LIST = ["jabali", "zorro", "muflon", "ciervo", "arrui", "gamo"]
WEIGHT_RANGES = ["<25kg", "25-50kg", "50-75kg", "75-100kg", ">100kg"]
PARTICIPANT_ROLES = ["batidor", "perrero", "acompanante", "ojeador", "postor", "secretario", "auxiliar", "controlador_acceso", "no_titular_arma", "lleva_dos"]
AUTH_TYPES = ["ptoc_comunicacion", "extraordinaria"]
ACTIVITY_STATUSES = ["draft", "pending", "approved", "rejected", "in_progress", "completed"]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ==================== PYDANTIC MODELS ====================

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "hiker"
    society_name: Optional[str] = None
    cif: Optional[str] = None
    responsible_name: Optional[str] = None
    responsible_phone: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class ActivityCreate(BaseModel):
    activity_type: str  # "batida" or "gancho"
    coto_matricula: str = ""
    coto_name: str = ""
    responsible_name: str = ""
    responsible_dni: str = ""
    responsible_phone: str = ""
    date: str = ""
    partida_paraje: str = ""
    termino_municipal: str = ""
    start_time: str = ""
    end_time: str = ""
    authorization_type: str = "ptoc_comunicacion"
    authorized_species: List[str] = []
    geometry: Optional[dict] = None
    buffer_meters: int = 200
    participants: List[dict] = []
    status: str = "draft"

class ActivityUpdate(BaseModel):
    coto_matricula: Optional[str] = None
    coto_name: Optional[str] = None
    responsible_name: Optional[str] = None
    responsible_dni: Optional[str] = None
    responsible_phone: Optional[str] = None
    date: Optional[str] = None
    partida_paraje: Optional[str] = None
    termino_municipal: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    authorization_type: Optional[str] = None
    authorized_species: Optional[List[str]] = None
    geometry: Optional[dict] = None
    buffer_meters: Optional[int] = None
    participants: Optional[List[dict]] = None

class ActivityResults(BaseModel):
    species_results: List[dict] = []
    taxonomic_observations: str = ""
    incidents: str = ""

class RegularParticipant(BaseModel):
    name: str
    dni: str = ""
    phone: str = ""
    default_role: str = ""
    dog_count: int = 0

# ==================== AUTH HELPERS ====================

def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())

def create_token(user_id: str, role: str) -> str:
    return jwt.encode({"user_id": user_id, "role": role, "exp": datetime.now(timezone.utc).timestamp() + 86400 * 7}, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(authorization.split(" ")[1], JWT_SECRET, algorithms=[JWT_ALGORITHM])
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
        payload = jwt.decode(authorization.split(" ")[1], JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    except Exception:
        return None

def require_role(*roles):
    async def checker(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(data: UserRegister):
    if data.role not in ("hiker", "society"):
        raise HTTPException(status_code=400, detail="Invalid role")
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id, "email": data.email, "password_hash": hash_password(data.password),
        "name": data.name, "role": data.role,
        "society_name": data.society_name or "", "cif": data.cif or "",
        "responsible_name": data.responsible_name or "", "responsible_phone": data.responsible_phone or "",
        "approved": data.role == "hiker",
        "registration_status": "approved" if data.role == "hiker" else "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id, data.role)
    user_doc.pop("_id", None)
    user_doc.pop("password_hash", None)
    return {"token": token, "user": user_doc}

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"], user["role"])
    u = {k: v for k, v in user.items() if k != "password_hash"}
    return {"token": token, "user": u}

@api_router.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    return {k: v for k, v in user.items() if k != "password_hash"}

# ==================== FEDERATION: SOCIETY MANAGEMENT ====================

@api_router.get("/federation/societies")
async def list_societies(user=Depends(require_role("federation"))):
    societies = await db.users.find({"role": "society"}, {"_id": 0, "password_hash": 0}).to_list(500)
    return societies

@api_router.put("/federation/societies/{society_id}/approve")
async def approve_society(society_id: str, user=Depends(require_role("federation"))):
    result = await db.users.update_one({"id": society_id, "role": "society"}, {"$set": {"approved": True, "registration_status": "approved"}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Society not found")
    # Notify society
    await create_notification(society_id, "society_approved", "Sociedad aprobada", "Tu sociedad ha sido aprobada por la federacion. Ya puedes registrar actividades.", {})
    return {"message": "Society approved"}

@api_router.put("/federation/societies/{society_id}/reject")
async def reject_society(society_id: str, user=Depends(require_role("federation"))):
    result = await db.users.update_one({"id": society_id, "role": "society"}, {"$set": {"approved": False, "registration_status": "rejected"}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Society not found")
    return {"message": "Society rejected"}

# ==================== ACTIVITIES (BATIDAS/GANCHOS) ====================

def compute_buffer(geometry, buffer_meters):
    try:
        geom = shape(geometry)
        buffered = geom.buffer(buffer_meters / 111320.0)
        return mapping(buffered)
    except Exception:
        return geometry

@api_router.post("/activities")
async def create_activity(data: ActivityCreate, user=Depends(require_role("society"))):
    if not user.get("approved"):
        raise HTTPException(status_code=403, detail="Society not approved yet")
    if data.activity_type not in ("batida", "gancho"):
        raise HTTPException(status_code=400, detail="Invalid activity type")

    # Gancho limits
    if data.activity_type == "gancho":
        hunters = sum(1 for p in data.participants if p.get("role") not in ("perrero",))
        dogs = sum(p.get("dog_count", 0) for p in data.participants)
        if hunters > 15:
            raise HTTPException(status_code=400, detail="Gancho: max 15 hunters")
        if dogs > 30:
            raise HTTPException(status_code=400, detail="Gancho: max 30 dogs")

    activity_id = str(uuid.uuid4())
    buffered = compute_buffer(data.geometry, data.buffer_meters) if data.geometry else None

    doc = {
        "id": activity_id,
        "activity_type": data.activity_type,
        "status": data.status if data.status in ("draft", "pending") else "draft",
        "society_id": user["id"],
        "society_name": user.get("society_name", user["name"]),
        "coto_matricula": data.coto_matricula,
        "coto_name": data.coto_name,
        "responsible_name": data.responsible_name,
        "responsible_dni": data.responsible_dni,
        "responsible_phone": data.responsible_phone,
        "date": data.date,
        "partida_paraje": data.partida_paraje,
        "termino_municipal": data.termino_municipal,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "authorization_type": data.authorization_type,
        "authorized_species": data.authorized_species,
        "geometry": data.geometry,
        "buffered_geometry": buffered,
        "buffer_meters": data.buffer_meters,
        "participants": data.participants,
        "results": None,
        "federation_notes": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.activities.insert_one(doc)
    doc.pop("_id", None)

    if doc["status"] == "pending":
        await notify_federation_new_activity(doc)

    return doc

@api_router.get("/activities")
async def list_activities(
    status: Optional[str] = None,
    society_id: Optional[str] = None,
    user=Depends(get_current_user)
):
    query = {}
    if user["role"] == "society":
        query["society_id"] = user["id"]
    if status:
        query["status"] = status
    if society_id and user["role"] == "federation":
        query["society_id"] = society_id
    activities = await db.activities.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return activities

@api_router.get("/activities/{activity_id}")
async def get_activity(activity_id: str, user=Depends(get_current_user)):
    activity = await db.activities.find_one({"id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if user["role"] == "society" and activity["society_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your activity")
    return activity

@api_router.put("/activities/{activity_id}")
async def update_activity(activity_id: str, data: ActivityUpdate, user=Depends(require_role("society"))):
    activity = await db.activities.find_one({"id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity["society_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your activity")
    if activity["status"] not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="Can only edit draft or rejected activities")

    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if "geometry" in update_data and update_data["geometry"]:
        bm = update_data.get("buffer_meters", activity["buffer_meters"])
        update_data["buffered_geometry"] = compute_buffer(update_data["geometry"], bm)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Gancho limits check
    if activity["activity_type"] == "gancho" and "participants" in update_data:
        hunters = sum(1 for p in update_data["participants"] if p.get("role") != "perrero")
        dogs = sum(p.get("dog_count", 0) for p in update_data["participants"])
        if hunters > 15:
            raise HTTPException(status_code=400, detail="Gancho: max 15 hunters")
        if dogs > 30:
            raise HTTPException(status_code=400, detail="Gancho: max 30 dogs")

    await db.activities.update_one({"id": activity_id}, {"$set": update_data})
    updated = await db.activities.find_one({"id": activity_id}, {"_id": 0})
    return updated

@api_router.put("/activities/{activity_id}/submit")
async def submit_activity(activity_id: str, user=Depends(require_role("society"))):
    activity = await db.activities.find_one({"id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity["society_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your activity")
    if activity["status"] not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="Can only submit draft or rejected activities")

    # Validate required fields
    required = ["responsible_name", "responsible_dni", "responsible_phone", "coto_name", "start_time", "end_time"]
    missing = [f for f in required if not activity.get(f)]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(missing)}")

    await db.activities.update_one({"id": activity_id}, {"$set": {"status": "pending", "updated_at": datetime.now(timezone.utc).isoformat()}})
    await notify_federation_new_activity(activity)
    return {"message": "Activity submitted for approval"}

@api_router.delete("/activities/{activity_id}")
async def delete_activity(activity_id: str, user=Depends(require_role("society"))):
    activity = await db.activities.find_one({"id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity["society_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your activity")
    if activity["status"] not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="Can only delete draft or rejected activities")
    await db.activities.delete_one({"id": activity_id})
    return {"message": "Deleted"}

# ==================== FEDERATION: ACTIVITY APPROVAL ====================

@api_router.get("/federation/activities")
async def federation_list_activities(status: Optional[str] = None, user=Depends(require_role("federation"))):
    query = {}
    if status:
        query["status"] = status
    return await db.activities.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

@api_router.put("/federation/activities/{activity_id}/approve")
async def approve_activity(activity_id: str, notes: str = "", user=Depends(require_role("federation"))):
    activity = await db.activities.find_one({"id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity["status"] != "pending":
        raise HTTPException(status_code=400, detail="Activity not pending")

    await db.activities.update_one({"id": activity_id}, {"$set": {
        "status": "approved", "federation_notes": notes,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }})

    await create_notification(activity["society_id"], "activity_approved",
        f"Actividad aprobada: {activity['coto_name']}",
        f"Tu {activity['activity_type']} en {activity['coto_name']} ha sido aprobada por la federacion.",
        {"activity_id": activity_id, "activity_type": activity["activity_type"]})

    # Check hiker routes against this new approved activity
    if activity.get("geometry"):
        asyncio.create_task(check_routes_against_approved_activity(activity))

    return {"message": "Activity approved"}

@api_router.put("/federation/activities/{activity_id}/reject")
async def reject_activity(activity_id: str, notes: str = "", user=Depends(require_role("federation"))):
    activity = await db.activities.find_one({"id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity["status"] != "pending":
        raise HTTPException(status_code=400, detail="Activity not pending")

    await db.activities.update_one({"id": activity_id}, {"$set": {
        "status": "rejected", "federation_notes": notes,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }})

    await create_notification(activity["society_id"], "activity_rejected",
        f"Actividad rechazada: {activity['coto_name']}",
        f"Tu {activity['activity_type']} en {activity['coto_name']} ha sido rechazada. Motivo: {notes or 'Sin especificar'}",
        {"activity_id": activity_id})

    return {"message": "Activity rejected"}

# ==================== ACTIVITY RESULTS ====================

@api_router.put("/activities/{activity_id}/results")
async def submit_results(activity_id: str, data: ActivityResults, user=Depends(require_role("society"))):
    activity = await db.activities.find_one({"id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity["society_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your activity")
    if activity["status"] not in ("approved", "in_progress"):
        raise HTTPException(status_code=400, detail="Activity must be approved first")

    results = {
        "species_results": data.species_results,
        "taxonomic_observations": data.taxonomic_observations,
        "incidents": data.incidents,
        "submitted_at": datetime.now(timezone.utc).isoformat()
    }
    await db.activities.update_one({"id": activity_id}, {"$set": {
        "results": results, "status": "completed",
        "updated_at": datetime.now(timezone.utc).isoformat()
    }})
    return {"message": "Results submitted", "results": results}

# ==================== REGULAR PARTICIPANTS ====================

@api_router.get("/regular-participants")
async def get_regular_participants(user=Depends(require_role("society"))):
    return await db.regular_participants.find({"society_id": user["id"]}, {"_id": 0}).to_list(500)

@api_router.post("/regular-participants")
async def add_regular_participant(data: RegularParticipant, user=Depends(require_role("society"))):
    doc = {
        "id": str(uuid.uuid4()), "society_id": user["id"],
        "name": data.name, "dni": data.dni, "phone": data.phone,
        "default_role": data.default_role, "dog_count": data.dog_count,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.regular_participants.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/regular-participants/{participant_id}")
async def update_regular_participant(participant_id: str, data: RegularParticipant, user=Depends(require_role("society"))):
    update = {k: v for k, v in data.model_dump().items()}
    result = await db.regular_participants.update_one(
        {"id": participant_id, "society_id": user["id"]}, {"$set": update})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return await db.regular_participants.find_one({"id": participant_id}, {"_id": 0})

@api_router.delete("/regular-participants/{participant_id}")
async def delete_regular_participant(participant_id: str, user=Depends(require_role("society"))):
    result = await db.regular_participants.delete_one({"id": participant_id, "society_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Deleted"}

# ==================== HIKER ROUTES ====================

@api_router.post("/routes/upload")
async def upload_route(file: UploadFile = File(...), name: str = Form(""), authorization: Optional[str] = Header(None)):
    user = await get_optional_user(authorization)
    content = await file.read()
    try:
        gpx = gpxpy.parse(content.decode('utf-8'))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid GPX: {str(e)}")

    coordinates = []
    for track in gpx.tracks:
        for seg in track.segments:
            for pt in seg.points:
                coordinates.append([pt.longitude, pt.latitude])
    if len(coordinates) < 2:
        for wpt in gpx.waypoints:
            coordinates.append([wpt.longitude, wpt.latitude])
    if len(coordinates) < 2:
        raise HTTPException(status_code=400, detail="Insufficient points")

    geometry = {"type": "LineString", "coordinates": coordinates}
    route_id = str(uuid.uuid4())
    user_id = user["id"] if user else "anonymous"
    doc = {
        "id": route_id, "name": name or gpx.name or file.filename or "Unnamed",
        "geometry": geometry, "user_id": user_id, "file_name": file.filename,
        "owner_name": user["name"] if user else "Anonymous", "is_public": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.routes.insert_one(doc)
    doc.pop("_id", None)

    if user and user_id != "anonymous":
        asyncio.create_task(check_uploaded_route_against_activities(doc, user_id))
    return doc

@api_router.get("/routes")
async def get_routes(user=Depends(get_current_user)):
    return await db.routes.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)

@api_router.get("/routes/public")
async def get_public_routes(search: Optional[str] = None):
    query = {"is_public": {"$ne": False}}
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    routes = await db.routes.find(query, {"_id": 0}).to_list(500)
    return [{
        "id": r["id"], "name": r["name"], "user_id": r["user_id"],
        "owner_name": r.get("owner_name", "Unknown"), "file_name": r.get("file_name", ""),
        "is_public": r.get("is_public", True), "point_count": len(r.get("geometry", {}).get("coordinates", [])),
        "created_at": r["created_at"], "geometry": r["geometry"]
    } for r in routes]

@api_router.get("/routes/{route_id}")
async def get_route_detail(route_id: str):
    route = await db.routes.find_one({"id": route_id}, {"_id": 0})
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return route

@api_router.delete("/routes/{route_id}")
async def delete_route(route_id: str, user=Depends(get_current_user)):
    route = await db.routes.find_one({"id": route_id}, {"_id": 0})
    if not route:
        raise HTTPException(status_code=404, detail="Not found")
    if route["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your route")
    await db.routes.delete_one({"id": route_id})
    return {"message": "Deleted"}

# ==================== FAVORITES ====================

@api_router.post("/favorites/{route_id}")
async def add_favorite(route_id: str, user=Depends(get_current_user)):
    route = await db.routes.find_one({"id": route_id}, {"_id": 0})
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    existing = await db.favorites.find_one({"user_id": user["id"], "route_id": route_id})
    if existing:
        raise HTTPException(status_code=400, detail="Already favorited")
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], "route_id": route_id,
           "route_name": route["name"], "owner_name": route.get("owner_name", "Unknown"),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.favorites.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/favorites/{route_id}")
async def remove_favorite(route_id: str, user=Depends(get_current_user)):
    r = await db.favorites.delete_one({"user_id": user["id"], "route_id": route_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not in favorites")
    return {"message": "Removed"}

@api_router.get("/favorites")
async def get_favorites(user=Depends(get_current_user)):
    favs = await db.favorites.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    route_ids = [f["route_id"] for f in favs]
    routes = await db.routes.find({"id": {"$in": route_ids}}, {"_id": 0}).to_list(500)
    rm = {r["id"]: r for r in routes}
    return [{"favorite_id": f["id"], "route_id": f["route_id"], "route_name": rm.get(f["route_id"], {}).get("name", ""),
             "owner_name": rm.get(f["route_id"], {}).get("owner_name", ""), "geometry": rm.get(f["route_id"], {}).get("geometry"),
             "is_own": rm.get(f["route_id"], {}).get("user_id") == user["id"], "favorited_at": f["created_at"],
             "route_created_at": rm.get(f["route_id"], {}).get("created_at", "")} for f in favs if f["route_id"] in rm]

@api_router.get("/favorites/ids")
async def get_favorite_ids(user=Depends(get_current_user)):
    favs = await db.favorites.find({"user_id": user["id"]}, {"_id": 0, "route_id": 1}).to_list(500)
    return [f["route_id"] for f in favs]

# ==================== MAP DATA (for hikers) ====================

@api_router.get("/zones")
async def get_active_zones(active: Optional[bool] = None, date: Optional[str] = None):
    """Returns approved activities as zones for the map."""
    query = {"status": {"$in": ["approved", "in_progress"]}, "geometry": {"$ne": None}}
    if active or date:
        check_time = date if date else datetime.now(timezone.utc).isoformat()
        query["start_time"] = {"$lte": check_time}
        query["end_time"] = {"$gte": check_time}

    activities = await db.activities.find(query, {"_id": 0}).to_list(1000)
    # Also include legacy zones
    legacy = await db.zones.find({}, {"_id": 0}).to_list(1000)

    zones = []
    for a in activities:
        zones.append({
            "id": a["id"], "name": f"{a['activity_type'].upper()}: {a['coto_name']}",
            "description": f"{a['society_name']} - {a['partida_paraje']} ({a['termino_municipal']})",
            "geometry": a["geometry"], "buffered_geometry": a.get("buffered_geometry"),
            "start_time": a["start_time"], "end_time": a["end_time"],
            "buffer_meters": a.get("buffer_meters", 200),
            "association_name": a["society_name"], "activity_type": a["activity_type"],
            "created_by": a["society_id"]
        })
    for z in legacy:
        zones.append(z)
    return zones

# ==================== INTERSECTION CHECK ====================

def check_route_vs_zones(route_shape, zones_data):
    conflicts = []
    for zone in zones_data:
        try:
            zone_geom = zone.get("buffered_geometry", zone.get("geometry"))
            if not zone_geom:
                continue
            zone_shape = shape(zone_geom)
            orig = shape(zone["geometry"]) if zone.get("geometry") else zone_shape
            contained = orig.contains(route_shape) or zone_shape.contains(route_shape)
            intersecting = route_shape.intersects(zone_shape)
            if contained or intersecting:
                if contained:
                    pct, ctype = 100.0, "contained"
                else:
                    inter = route_shape.intersection(zone_shape)
                    rl = route_shape.length if route_shape.length > 0 else 1
                    pct = min(round((inter.length / rl) * 100, 1), 100)
                    ctype = "intersects"
                conflicts.append({
                    "zone_id": zone.get("id", ""), "zone_name": zone.get("name", ""),
                    "association": zone.get("association_name", zone.get("society_name", "")),
                    "start_time": zone.get("start_time", ""), "end_time": zone.get("end_time", ""),
                    "overlap_percentage": pct, "conflict_type": ctype,
                    "buffer_meters": zone.get("buffer_meters", 200),
                    "geometry": zone.get("geometry"), "buffered_geometry": zone.get("buffered_geometry"),
                    "activity_type": zone.get("activity_type", "")
                })
        except Exception as e:
            logger.error(f"Intersection error: {e}")
    return conflicts

@api_router.post("/check-intersection")
async def check_intersection(data: dict):
    check_time = data.get("check_time") or datetime.now(timezone.utc).isoformat()
    route_geom = data.get("route_geometry")
    if data.get("route_id"):
        route = await db.routes.find_one({"id": data["route_id"]}, {"_id": 0})
        if not route:
            raise HTTPException(status_code=404, detail="Route not found")
        route_geom = route["geometry"]
    if not route_geom:
        raise HTTPException(status_code=400, detail="No route geometry")

    # Get approved activities as zones
    zones = await db.activities.find({
        "status": {"$in": ["approved", "in_progress"]}, "geometry": {"$ne": None},
        "start_time": {"$lte": check_time}, "end_time": {"$gte": check_time}
    }, {"_id": 0}).to_list(1000)
    # Also legacy zones
    legacy = await db.zones.find({"start_time": {"$lte": check_time}, "end_time": {"$gte": check_time}}, {"_id": 0}).to_list(1000)
    all_zones = zones + legacy

    if not all_zones:
        return {"intersects": False, "zones": [], "safe_message": "No active hunting zones."}

    route_shape = shape(route_geom)
    conflicts = check_route_vs_zones(route_shape, all_zones)

    if any(c["conflict_type"] == "contained" for c in conflicts):
        msg = "CRITICAL: Your route is entirely inside an active hunting zone!"
    elif conflicts:
        msg = "WARNING: Your route crosses active hunting zones!"
    else:
        msg = "Safe: No conflicts."
    return {"intersects": len(conflicts) > 0, "zones": conflicts, "safe_message": msg}

# ==================== NOTIFICATIONS ====================

async def create_notification(user_id, ntype, title, message, data=None):
    doc = {"id": str(uuid.uuid4()), "user_id": user_id, "type": ntype,
           "title": title, "message": message, "data": data or {},
           "read": False, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.notifications.insert_one(doc)

async def notify_federation_new_activity(activity):
    feds = await db.users.find({"role": "federation"}, {"_id": 0}).to_list(10)
    for f in feds:
        await create_notification(f["id"], "new_activity",
            f"Nueva solicitud: {activity['activity_type'].upper()} - {activity.get('coto_name', '')}",
            f"La sociedad {activity.get('society_name', '')} solicita aprobar una {activity['activity_type']} en {activity.get('coto_name', '')}.",
            {"activity_id": activity["id"], "activity_type": activity["activity_type"], "society_name": activity.get("society_name", "")})

async def check_routes_against_approved_activity(activity):
    try:
        zone_data = {"id": activity["id"], "name": activity.get("coto_name", ""),
                     "geometry": activity["geometry"], "buffered_geometry": activity.get("buffered_geometry"),
                     "association_name": activity.get("society_name", ""), "society_name": activity.get("society_name", ""),
                     "start_time": activity.get("start_time", ""), "end_time": activity.get("end_time", ""),
                     "buffer_meters": activity.get("buffer_meters", 200), "activity_type": activity.get("activity_type", "")}
        all_routes = await db.routes.find({}, {"_id": 0}).to_list(5000)
        for route in all_routes:
            try:
                rs = shape(route["geometry"])
                conflicts = check_route_vs_zones(rs, [zone_data])
                if conflicts:
                    users_to_notify = set()
                    if route["user_id"] != "anonymous":
                        users_to_notify.add(route["user_id"])
                    favs = await db.favorites.find({"route_id": route["id"]}, {"_id": 0}).to_list(5000)
                    for fav in favs:
                        users_to_notify.add(fav["user_id"])
                    c = conflicts[0]
                    for uid in users_to_notify:
                        own = uid == route["user_id"]
                        prefix = "Tu" if own else "Ruta favorita"
                        await create_notification(uid, "zone_conflict",
                            f"{'CRITICAL' if c['conflict_type']=='contained' else 'WARNING'}: {prefix} ruta '{route['name']}' afectada",
                            f"{prefix} ruta '{route['name']}' {'esta dentro de' if c['conflict_type']=='contained' else 'cruza'} "
                            f"la nueva {activity['activity_type']} en {activity.get('coto_name', '')} ({activity.get('society_name', '')}).\n"
                            f"Periodo: {activity.get('start_time', '')[:16]} - {activity.get('end_time', '')[:16]}.",
                            {"route_id": route["id"], "route_name": route["name"], "zone_id": activity["id"],
                             "zone_name": activity.get("coto_name", ""), "conflict_type": c["conflict_type"],
                             "zone_start": activity.get("start_time"), "zone_end": activity.get("end_time")})
            except Exception as e:
                logger.error(f"Route check error: {e}")
    except Exception as e:
        logger.error(f"check_routes_against_approved_activity error: {e}")

async def check_uploaded_route_against_activities(route_doc, user_id):
    try:
        rs = shape(route_doc["geometry"])
        activities = await db.activities.find({"status": {"$in": ["approved", "in_progress"]}, "geometry": {"$ne": None},
                                               "end_time": {"$gte": datetime.now(timezone.utc).isoformat()}}, {"_id": 0}).to_list(5000)
        for a in activities:
            try:
                zone_data = {"id": a["id"], "name": a.get("coto_name", ""), "geometry": a["geometry"],
                             "buffered_geometry": a.get("buffered_geometry"), "association_name": a.get("society_name", ""),
                             "start_time": a.get("start_time", ""), "end_time": a.get("end_time", ""),
                             "buffer_meters": a.get("buffer_meters", 200), "activity_type": a.get("activity_type", "")}
                conflicts = check_route_vs_zones(rs, [zone_data])
                if conflicts:
                    c = conflicts[0]
                    await create_notification(user_id, "route_warning",
                        f"{'CRITICAL' if c['conflict_type']=='contained' else 'WARNING'}: '{route_doc['name']}' afectada por {a['activity_type']}",
                        f"Tu ruta '{route_doc['name']}' {'esta dentro de' if c['conflict_type']=='contained' else 'cruza'} "
                        f"la {a['activity_type']} en {a.get('coto_name', '')} ({a.get('society_name', '')}).\n"
                        f"Periodo: {a.get('start_time', '')[:16]} - {a.get('end_time', '')[:16]}.",
                        {"route_id": route_doc["id"], "route_name": route_doc["name"], "zone_id": a["id"],
                         "zone_name": a.get("coto_name", ""), "conflict_type": c["conflict_type"],
                         "zone_start": a.get("start_time"), "zone_end": a.get("end_time")})
            except Exception as e:
                logger.error(f"Activity check error: {e}")
    except Exception as e:
        logger.error(f"check_uploaded_route error: {e}")

@api_router.get("/notifications")
async def get_notifications(user=Depends(get_current_user)):
    return await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api_router.get("/notifications/unread-count")
async def get_unread_count(user=Depends(get_current_user)):
    return {"count": await db.notifications.count_documents({"user_id": user["id"], "read": False})}

@api_router.put("/notifications/{nid}/read")
async def mark_read(nid: str, user=Depends(get_current_user)):
    await db.notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"message": "OK"}

@api_router.put("/notifications/read-all")
async def mark_all_read(user=Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"message": "OK"}

@api_router.delete("/notifications/{nid}")
async def delete_notification(nid: str, user=Depends(get_current_user)):
    await db.notifications.delete_one({"id": nid, "user_id": user["id"]})
    return {"message": "OK"}

# ==================== PDF REPORT ====================

@api_router.post("/reports/pdf")
async def generate_pdf(data: dict):
    check_time = data.get("check_time") or datetime.now(timezone.utc).isoformat()
    route_geom = data.get("route_geometry")
    route_name = "Route"
    if data.get("route_id"):
        route = await db.routes.find_one({"id": data["route_id"]}, {"_id": 0})
        if route:
            route_geom = route["geometry"]
            route_name = route.get("name", "Route")
    if not route_geom:
        raise HTTPException(status_code=400, detail="No route geometry")

    zones = await db.activities.find({"status": {"$in": ["approved", "in_progress"]}, "geometry": {"$ne": None},
                                      "start_time": {"$lte": check_time}, "end_time": {"$gte": check_time}}, {"_id": 0}).to_list(1000)
    rs = shape(route_geom)
    conflicts = check_route_vs_zones(rs, zones)

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 15, "RangeGuard - Safety Report", ln=True, align="C")
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, f"Route: {route_name} | Time: {check_time[:16]}", ln=True)
    pdf.ln(5)
    if conflicts:
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(220, 50, 50)
        pdf.cell(0, 10, f"WARNING: {len(conflicts)} conflict(s)!", ln=True)
        pdf.set_text_color(0, 0, 0)
        pdf.set_font("Helvetica", "", 9)
        for c in conflicts:
            pdf.cell(0, 7, f"- {c['zone_name']} ({c['conflict_type']}, {c['overlap_percentage']}%) | {c.get('activity_type','')} | {c['start_time'][:16]}-{c['end_time'][:16]}", ln=True)
    else:
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(16, 185, 129)
        pdf.cell(0, 10, "SAFE: No conflicts.", ln=True)

    buf = io.BytesIO()
    buf.write(pdf.output())
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=rangeguard_report.pdf"})

# ==================== STATS ====================

@api_router.get("/stats")
async def get_stats():
    now = datetime.now(timezone.utc).isoformat()
    active = await db.activities.count_documents({"status": {"$in": ["approved", "in_progress"]}, "start_time": {"$lte": now}, "end_time": {"$gte": now}})
    legacy_active = await db.zones.count_documents({"start_time": {"$lte": now}, "end_time": {"$gte": now}})
    return {
        "total_zones": await db.activities.count_documents({"status": {"$in": ["approved", "in_progress"]}}) + await db.zones.count_documents({}),
        "active_zones": active + legacy_active,
        "total_users": await db.users.count_documents({}),
        "total_routes": await db.routes.count_documents({})
    }

@api_router.get("/constants")
async def get_constants():
    return {"species": SPECIES_LIST, "weight_ranges": WEIGHT_RANGES,
            "participant_roles": PARTICIPANT_ROLES, "auth_types": AUTH_TYPES}

@api_router.get("/")
async def root():
    return {"message": "RangeGuard API running"}

# ==================== APP SETUP ====================

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("id", unique=True)
        await db.users.create_index("email", unique=True)
        await db.activities.create_index("id", unique=True)
        await db.activities.create_index([("society_id", 1), ("status", 1)])
        await db.activities.create_index("status")
        await db.routes.create_index("id", unique=True)
        await db.routes.create_index("user_id")
        await db.notifications.create_index("id", unique=True)
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        await db.favorites.create_index([("user_id", 1), ("route_id", 1)], unique=True)
        await db.regular_participants.create_index([("society_id", 1)])

        # Seed federation account
        fed = await db.users.find_one({"role": "federation"})
        if not fed:
            await db.users.insert_one({
                "id": str(uuid.uuid4()), "email": "federacion@rangeguard.com",
                "password_hash": hash_password("federacion2024"),
                "name": "Federacion de Caza", "role": "federation",
                "society_name": "", "cif": "", "responsible_name": "", "responsible_phone": "",
                "approved": True, "created_at": datetime.now(timezone.utc).isoformat()
            })
            logger.info("Federation account seeded: federacion@rangeguard.com / federacion2024")
        logger.info("DB indexes created")
    except Exception as e:
        logger.error(f"Startup error: {e}")

@app.on_event("shutdown")
async def shutdown():
    client.close()
