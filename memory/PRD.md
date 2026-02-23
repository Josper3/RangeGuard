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
- Routes map shows active hunting zones with buffer zones
- Visual intersection alert with conflict types (CRITICAL/WARNING/CAUTION)
- Containment detection: route fully inside zone = CRITICAL (100%)
- In-app notification inbox with unread count, tabs, mark-read, delete
- Auto-notifications on route upload against all zones
- Auto-notifications on zone creation against all routes + favorites
- Notification bell in navbar with real-time unread count (polls 30s)
- **Explore Routes page** (/explore): Browse all public routes shared by hikers
- **Favorites system**: Add/remove routes to favorites with heart toggle
- **Favorites tab**: View favorited routes with route details and map
- **Route search**: Filter public routes by name
- **Auto-alerts for favorites**: When new zone created, users who favorited affected routes get notified
- Language toggle (ES/EN) working
- Dark/light theme toggle working
- Responsive mobile-first design

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
