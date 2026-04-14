# RangeGuard - PRD (Product Requirements Document)

## Original Problem Statement
Aplicacion web colaborativa usando mapas interactivos para seguridad en la caza. Senderistas verifican si sus rutas intersectan con zonas de caza. Reestructuracion a 3 roles: Senderista, Sociedad de Caza, Federacion.

## Architecture
- **Frontend**: React + Leaflet/OpenStreetMap + Shadcn UI + Tailwind CSS
- **Backend**: FastAPI (Python) + MongoDB (Motor)
- **Auth**: JWT with bcrypt, 3 roles (hiker, society, federation)
- **Maps**: Leaflet + react-leaflet + leaflet-draw
- **Geospatial**: Shapely (Python) for intersection/containment calculations
- **PDF**: fpdf2 for safety report generation
- **GPX Parsing**: gpxpy
- **i18n**: Custom React context (ES/EN)

## User Personas
1. **Senderista (Hiker)**: Explores routes, checks intersections with hunting zones, manages favorites, receives notifications
2. **Sociedad de Caza (Hunting Society)**: Registers Batidas/Ganchos activities with participants, draws hunting zones on map, submits for federation approval, records results
3. **Federacion (Federation/Admin)**: Approves society registrations, approves/rejects activity requests, views dashboard

## Core Requirements

### Senderista
- Interactive map with hunting zone overlays
- GPX file upload and route visualization
- Route-zone intersection checker with visual alerts (CRITICAL/WARNING)
- Date/time filtering for active zones
- PDF safety report generation
- Explore public routes and favorites system
- Notifications for route conflicts

### Sociedad de Caza
- Register with CIF, society name, responsible person details
- Requires federation approval before creating activities
- Create Batidas and Ganchos (Gancho: max 15 hunters, 30 dogs)
- Activity data: responsible, coto matricula, date, location, authorization, species
- Participant management (name, DNI, role, dog count)
- Activity lifecycle: draft -> pending -> approved/rejected -> in_progress -> completed
- Record results: species (sex, weight ranges, trophies), observations, incidents
- Regular participants list for quick selection

### Federacion
- Approve/reject society registrations
- Approve/reject activity requests with optional notes
- Dashboard with summary statistics

## Key DB Schema
- `users`: {id, email, password_hash, role, name, cif, society_name, approved, ...}
- `activities`: {id, activity_type, status, society_id, geometry, participants, results, ...}
- `routes`: {id, name, geometry, user_id, is_public}
- `favorites`: {id, user_id, route_id}
- `notifications`: {id, user_id, type, title, message, read}
- `regular_participants`: {id, society_id, name, dni, default_role, dog_count}

## What's Been Implemented (Apr 14, 2026)
- Full 3-role backend API (auth, activities CRUD, routes, intersections, notifications, PDF, regular participants)
- Federation seeded account (federacion@rangeguard.com / federacion2024)
- Landing page with stats
- Auth pages (login/register) with role selection (hiker vs society)
- Role-based routing and navbar navigation
- Federation Dashboard (approve societies, approve/reject activities with notes)
- Society Dashboard (list activities with status filters)
- Activity Form (create/edit with map drawing, participants, species)
- Activity Detail (view details, submit results)
- Regular Participants page (CRUD for frequent participants)
- Map page (view active hunting zones on map)
- Routes page (upload GPX, check intersections, download PDF)
- Explore page (browse public routes, favorites)
- Notifications page with unread count
- Bilingual ES/EN interface
- Dark/light theme

## Prioritized Backlog
### P1 (Important)
- Activity start/complete flow (change status to in_progress, then complete with results)
- PDF generation updated for activities vs old zones
- Push notifications
- TCX file support

### P2 (Nice to have)
- Email notifications
- Incident reporting
- User profile/settings
- Zone calendar view
- Real-time updates (WebSockets)
- Admin analytics dashboard
