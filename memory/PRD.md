# RangeGuard - PRD (Product Requirements Document)

## Original Problem Statement
Collaborative web app for hunting safety. Hunting associations mark temporary activity zones (cotos) on interactive maps, hikers verify if their planned routes intersect with those zones. Preventive purpose to avoid accidents.

## Architecture
- **Frontend**: React + Leaflet/OpenStreetMap + Shadcn UI + Tailwind CSS
- **Backend**: FastAPI (Python) + MongoDB
- **Auth**: JWT with bcrypt
- **Maps**: Leaflet + react-leaflet + leaflet-draw
- **Geospatial**: Shapely (Python) for intersection calculations
- **PDF**: fpdf2 for report generation
- **GPX Parsing**: gpxpy
- **i18n**: Custom React context (ES/EN)

## User Personas
1. **Admin (Hunting Association)**: Registers with CIF/org name, creates/manages hunting zones with polygons, dates/times, buffer zones
2. **Hiker/Trail Runner**: Registers simply, uploads GPX routes, checks intersections with hunting zones
3. **Visitor**: Public access to map view without account

## Core Requirements
- Interactive map with hunting zone overlays (red polygons with buffer zones)
- Polygon drawing tool for admins to define zone boundaries
- GPX file upload and route visualization
- Route-zone intersection checker with visual alerts
- Date/time filtering for active zones
- PDF report generation for intersection results
- JWT authentication with role-based access
- Bilingual interface (Spanish/English)
- Light/dark theme toggle
- Mobile responsive design

## What's Been Implemented (Feb 16, 2026)
- Full backend API: auth, zones CRUD, route upload, intersection check, PDF reports, stats
- Landing page with hero, stats, features section
- Interactive map page with Leaflet, zone overlays, legend, sidebar
- Auth pages (login/register) with role selection
- Admin zone management with polygon drawing tool (leaflet-draw)
- Routes page with GPX upload, intersection checking, PDF download
- **Routes map shows active hunting zones** with buffer zones (red polygons)
- **Visual intersection alert banner** (green=safe, orange=crosses, red=CRITICAL inside) with conflict type badges
- **Containment detection fixed**: route fully inside zone now detected as CRITICAL (100% overlap)
- **In-app notification inbox** (/notifications) with unread count, tabs, mark-read, delete
- **Auto-notifications on route upload**: system checks against all zones and notifies user
- **Auto-notifications on zone creation**: system checks all existing routes and notifies affected users
- **Notification bell** in navbar with real-time unread count badge (polls every 30s)
- Toggle button to show/hide hunting zones on routes map
- Intersection API returns full zone geometry + conflict_type (contained/intersects/buffer)
- Language toggle (ES/EN) working
- Dark/light theme toggle working
- Navbar with responsive mobile menu
- Footer with safety notice
- Buffer zone computation (Shapely)
- MongoDB indexes for performance

## Prioritized Backlog
### P0 (Critical)
- All core features implemented

### P1 (Important)
- Push notifications for route-zone conflicts
- Offline mode with Service Workers
- Historical zone patterns view
- TCX file support (in addition to GPX)

### P2 (Nice to have)
- Email notifications for saved routes entering zones
- Incident reporting system
- User profile/settings page
- Zone calendar view
- Real-time zone updates (WebSockets)
- WCAG accessibility audit
- Admin analytics dashboard

## Next Tasks
1. Add push/email notifications when saved routes enter new zones
2. TCX file parsing support
3. Offline map caching with Service Workers
4. Historical zone analysis view
5. Enhanced admin analytics
