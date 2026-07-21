# Stockyard Scan Project Design

Source document: `Stockyard_Scan_SOP (2).docx`  
Source date: 21 July 2026  
Status: Draft project design

## 1. Purpose

Build a scan-based stockyard system that records where a vehicle physically sits when it enters or leaves a yard. The system must work independently of CTDMS billing data because CTDMS may show the billing location while the vehicle is parked at another outlet.

Version 1 focuses on IN and OUT tracking only.

## 2. Goals

- Record each vehicle IN scan with VIN, yard, timestamp, GPS location, and device ID.
- Record each vehicle OUT scan with VIN, yard, timestamp, GPS location, device ID, OUT reason, and damage details.
- Support QR scanning from the windshield sticker.
- Support manual VIN entry when the QR sticker is missing or unreadable.
- Capture GPS at scan time to confirm which stockyard performed the update.
- Queue scans offline and sync them when the device regains network access.
- Give admins a dashboard for current stock, history, yard utilization, dwell time, model split, and flagged items.
- Allow admins to manually correct status or yard when the physical process fails.

## 3. Non-Goals For Version 1

- Native Android or iOS application.
- Push notifications, SMS, WhatsApp, or email alerts.
- Real-time integration with CTDMS.
- Exact parking slot tracking inside a yard.
- Driver assignment or transport route tracking.
- Photo capture for damage records.
- Role-per-user staff accounts.

## 4. Users

### Stockyard Staff

Stockyard staff use a shared yard login. They scan vehicles during arrival and dispatch. They can view only their own yard's vehicles and scan history.

### Admin

Admins can view all yards, analytics, flagged records, and full scan history. They can force-close vehicle status, reassign a yard, and resolve flagged records.

## 5. Core Workflows

### 5.1 Vehicle Arrival: IN

1. Truck arrives and unloads vehicles.
2. Staff scan each windshield QR code once at unloading.
3. The app captures GPS coordinates.
4. The system confirms the scan location against the logged-in stockyard.
5. If the QR code is missing or unreadable, staff enter the VIN manually from the rear tyre or door plate.
6. If the VIN format is invalid, the app accepts the scan and flags it for admin review.
7. If the vehicle is already marked IN, the app shows an error and leaves the current status unchanged.
8. Otherwise, the system logs the vehicle as IN with yard, timestamp, GPS, and device ID.

### 5.2 Vehicle Dispatch: OUT

1. Staff receive a sales order or transfer request.
2. Staff locate and stage the vehicle.
3. Staff scan the QR code or enter the VIN manually.
4. The app captures GPS coordinates.
5. Staff select the OUT remark:
   - Customer Acquisition
   - Stockyard Transfer
6. Staff mark damage status and enter a damage remark when needed.
7. If the vehicle has no prior IN record, the system accepts the OUT scan and flags it as `unverified_in`.
8. Otherwise, the system logs the vehicle OUT with timestamp, yard, GPS, device ID, reason, and damage fields.
9. For a stockyard transfer, the destination yard scans the vehicle IN again when it arrives.

## 6. System Architecture

### Frontend

- React PWA.
- Mobile-first interface for phone usage.
- Browser camera QR scanning with `html5-qrcode`.
- Browser Geolocation API for GPS capture.
- Service worker and local queue for offline scan storage.
- Installable web app shortcut for yard phones.

### Backend

- Node.js with Express.
- REST API for scans, vehicles, yards, dashboard data, flags, and admin corrections.
- Server-side validation for VIN format, duplicate status, yard capacity warnings, and conflict flags.

### Database

- PostgreSQL hosted on Neon or Supabase.
- Full historical scan records retained.
- Current vehicle status derived from scan history and admin overrides.

### Hosting

- Frontend: Vercel free tier.
- Backend: Render free tier.
- Database: Neon or Supabase free tier.

## 7. Data Model

### 7.1 `yards`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `code` | Text | Yard code from SOP |
| `name` | Text | Human-readable location |
| `city` | Text | Optional reporting field |
| `capacity` | Integer | Used for utilization |
| `latitude` | Numeric | Yard GPS center |
| `longitude` | Numeric | Yard GPS center |
| `gps_radius_meters` | Integer | Acceptable scan radius |
| `active` | Boolean | Hides closed yards without deleting history |

The SOP contains repeated yard codes for different physical locations. The app should treat each physical yard as a separate `yard` row, even when the `code` value repeats.

### 7.2 `devices`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `device_fingerprint` | Text | Browser/device identifier |
| `label` | Text | Optional admin label |
| `first_seen_at` | Timestamp | Created on first scan |
| `last_seen_at` | Timestamp | Updated on scan |

### 7.3 `users`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `role` | Text | `stockyard` or `admin` |
| `yard_id` | UUID | Required for stockyard users |
| `login_code_hash` | Text | Shared stockyard code or admin credential |
| `active` | Boolean | Account status |

### 7.4 `vehicles`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `vin` | Text | Unique vehicle identifier when valid |
| `model` | Text | Auto-detected from VIN pattern |
| `vin_valid` | Boolean | Result of VIN validation |
| `created_at` | Timestamp | First time seen or imported |
| `updated_at` | Timestamp | Last update |

### 7.5 `scans`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `client_scan_id` | Text | Idempotency key from the device queue |
| `vehicle_id` | UUID | Linked vehicle |
| `vin_raw` | Text | Raw scanned or typed value |
| `scan_type` | Text | `in` or `out` |
| `yard_id` | UUID | Logged-in or GPS-confirmed yard |
| `device_id` | UUID | Device that submitted the scan |
| `scanned_at` | Timestamp | Time captured on device |
| `received_at` | Timestamp | Time received by backend |
| `latitude` | Numeric | GPS latitude |
| `longitude` | Numeric | GPS longitude |
| `gps_accuracy_meters` | Numeric | Browser accuracy value |
| `out_remark` | Text | `customer_acquisition` or `stockyard_transfer` |
| `damaged` | Boolean | Required for OUT |
| `damage_remark` | Text | Required when damaged |
| `status` | Text | `accepted`, `rejected`, or `flagged` |

### 7.6 `vehicle_status`

| Field | Type | Notes |
| --- | --- | --- |
| `vehicle_id` | UUID | Primary key |
| `current_status` | Text | `in` or `out` |
| `current_yard_id` | UUID | Current physical yard when IN |
| `last_in_scan_id` | UUID | Last accepted IN scan |
| `last_out_scan_id` | UUID | Last accepted OUT scan |
| `last_changed_at` | Timestamp | Latest accepted scan or admin correction |
| `override_reason` | Text | Admin correction note |

### 7.7 `flags`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `vehicle_id` | UUID | Related vehicle |
| `scan_id` | UUID | Related scan when applicable |
| `flag_type` | Text | See flag types below |
| `message` | Text | Admin-facing explanation |
| `resolved` | Boolean | Flag status |
| `resolved_by` | UUID | Admin user |
| `resolved_at` | Timestamp | Resolution time |

Flag types:

- `invalid_vin`
- `unverified_in`
- `yard_capacity_exceeded`
- `duplicate_yard_status`
- `gps_outside_yard`
- `damage_reported`
- `manual_admin_override`

## 8. Business Rules

| Situation | Rule |
| --- | --- |
| Duplicate IN | If the vehicle is already IN, reject the scan and keep the current status. |
| OUT with no IN | Accept the scan and flag it as `unverified_in`. |
| Invalid VIN | Accept the scan and flag it as `invalid_vin`. |
| Stockyard transfer | OUT at source yard, then IN at destination yard. |
| Yard over capacity | Accept the scan and flag or warn. Do not block the scan. |
| Same VIN IN at two yards | Accept the scan and flag it for admin reconciliation. |
| Vehicle leaves without OUT scan | Admin can force-close the status. |
| Damaged vehicle | Staff record damage status and remark during OUT scan. |
| Offline scan | Queue locally and sync later using `client_scan_id` to avoid duplicates. |
| Shared yard login | Record the device ID on every scan. |

## 9. GPS Rules

- The app requests GPS permission before submitting a scan.
- The app stores latitude, longitude, and accuracy.
- The backend compares scan coordinates with the logged-in yard's configured GPS center and radius.
- If GPS is missing or outside the yard radius, the system can still accept the scan but must flag it.
- Admins can review GPS-related flags from the dashboard.

## 10. Offline Sync

The frontend stores pending scans in IndexedDB when the network is unavailable. Each pending scan includes:

- `client_scan_id`
- VIN or QR payload
- scan type
- selected yard
- captured GPS details
- device ID
- scan timestamp
- OUT remark and damage fields when applicable

When the device comes online, the service worker syncs pending scans to the backend. The backend treats `client_scan_id` as an idempotency key so the same scan cannot create duplicate records.

If queued scans arrive out of order, the backend accepts the scan, updates status when valid, and creates flags where reconciliation is needed.

## 11. API Design

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Scanning

- `POST /api/scans/in`
- `POST /api/scans/out`
- `POST /api/scans/bulk-sync`
- `GET /api/scans/:id`

### Vehicles

- `GET /api/vehicles`
- `GET /api/vehicles/:vin`
- `GET /api/vehicles/:vin/history`

### Yard Data

- `GET /api/yards`
- `GET /api/yards/:id/stock`
- `GET /api/yards/:id/utilization`

### Admin

- `GET /api/admin/dashboard`
- `GET /api/admin/flags`
- `PATCH /api/admin/flags/:id/resolve`
- `PATCH /api/admin/vehicles/:vin/status`
- `PATCH /api/admin/vehicles/:vin/yard`
- `POST /api/admin/import/vehicles`

## 12. Frontend Screens

### Stockyard App

- Login screen with yard code.
- Scan screen with QR camera.
- Manual VIN entry fallback.
- IN confirmation result.
- OUT form with reason and damage fields.
- Offline queue status.
- Yard stock list.
- Vehicle lookup by VIN.

### Admin Dashboard

- Total vehicles currently IN.
- Current stock by yard.
- Model-wise split.
- Yard utilization count vs. capacity.
- Average dwell time by model and yard.
- Flagged records list.
- Vehicle history lookup.
- Admin correction form.
- Bulk import screen for existing vehicles at launch.

## 13. Dashboard Metrics

| Metric | Definition |
| --- | --- |
| Current stock | Vehicles with current status `in`. |
| Yard utilization | Current IN count divided by configured yard capacity. |
| Model split | Current IN vehicles grouped by detected model. |
| Dwell time | Time from latest IN scan to OUT scan, or current time when still IN. |
| Damage count | OUT scans where `damaged = true`. |
| Flag count | Open flags grouped by type and yard. |

## 14. Yard Seed Data

| Code | Location | Capacity |
| --- | --- | ---: |
| CO01A | Nettur Showroom, Cochin | 125 |
| CO01B | Kalamasery, Cochin | 200 |
| CO01B | Nippon Tower - 7th floor, Cochin | 80 |
| KY01A | Showroom, Kayamkulam | 60 |
| KY01A | Ramapuram East, Kayamkulam | 210 |
| KY01A | Ramapuram West, Kayamkulam | 80 |
| KY01A | Evoor Yard, Kayamkulam | 110 |
| IR01A | Showroom, Irinjalakuda | 30 |
| KL01A | Showroom, Kollam | 55 |
| KL01B | Thazhuthala, Kollam | 225 |
| TI01A | Peramangalam, Trissur | 175 |
| MV01A | Muvattupuzha | 105 |
| PH01A | Pathanamthitta | 70 |
| TL01A | Thiruvalla | 45 |
| TR01C | Vallakkadavu, Trivandrum | 45 |
| TR01C | Enchakkal, Trivandrum | 20 |
| TR01A | Showroom, Kazhakuttam, Trivandrum | 40 |
| TR01A | Yard-1, Kazhakuttam, Trivandrum | 130 |
| TR01A | Yard-2, Kazhakuttam, Trivandrum | 65 |
| TR01A | Yard-3, Kazhakuttam, Trivandrum | 130 |
| KT01A | Kottayam, behind the showroom | 300 |

## 15. Implementation Phases

### Phase 1: Foundation

- Set up React PWA, Express API, and PostgreSQL.
- Create schema migrations for yards, users, devices, vehicles, scans, status, and flags.
- Seed yard reference data.
- Build shared yard login and admin login.

### Phase 2: Scanning

- Add QR scanner.
- Add manual VIN entry.
- Capture GPS at scan time.
- Implement IN and OUT endpoints.
- Implement duplicate IN, invalid VIN, unverified IN, capacity, and GPS flags.

### Phase 3: Offline Support

- Add IndexedDB queue.
- Add service worker sync.
- Add `client_scan_id` idempotency.
- Add visible sync status for stockyard staff.

### Phase 4: Admin Dashboard

- Build current stock, yard utilization, model split, dwell time, and flags.
- Add vehicle history lookup.
- Add manual force-close and yard reassignment.
- Add bulk import for vehicles already in yards before launch.

### Phase 5: Testing And Rollout

- Test scan flows on yard phones.
- Test poor-network and offline sync behavior.
- Confirm GPS radius per yard.
- Import starting vehicle stock.
- Train stockyard staff on IN, OUT, transfer, damage, and manual VIN flows.

## 16. Key Risks

- Browser GPS may be inaccurate inside buildings or under poor signal.
- Shared yard logins reduce staff-level accountability; device logging partially covers this.
- Repeated yard codes can confuse reporting unless each physical yard has its own internal ID.
- Offline scans may sync late and create status conflicts that admins must resolve.
- VIN-to-model detection depends on reliable VIN patterns. Admins need a way to update model mapping rules.

## 17. Acceptance Criteria

- Staff can scan or manually enter a VIN for IN and OUT.
- The app records GPS and device ID for every scan.
- Duplicate IN scans do not change vehicle status.
- OUT scans without prior IN are accepted and flagged.
- Invalid VINs are accepted and flagged.
- Stockyard transfers work through OUT at source and IN at destination.
- Offline scans sync after network recovery without duplicate records.
- Admins can view current stock, history, yard utilization, model split, dwell time, and flags.
- Admins can force-close or reassign vehicle status and yard.
