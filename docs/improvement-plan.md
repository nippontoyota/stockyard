# Stockyard Scan — Improvement & Feature Plan

> Analysis based on codebase audit (July 2026). Covers latency, usability, UX, architecture, and new features.

---

## Contents

1. [Latency & Performance](#1-latency--performance)
2. [Offline & Resilience](#2-offline--resilience)
3. [Frontend Usability & UX](#3-frontend-usability--ux)
4. [Admin UX](#4-admin-ux)
5. [New Features](#5-new-features)
6. [Architecture & Code Quality](#6-architecture--code-quality)
7. [Priority Matrix](#7-priority-matrix)

---

## 1. Latency & Performance

### 1.1 Replace 5s Polling with WebSocket + SSE

**Problem:** `setInterval(fetchServerData, 5000)` runs unconditionally — even when tab is backgrounded, phone is idle, or no data has changed. On the dashboard, this fetches `/api/admin/dashboard`, `/api/vehicles?limit=1000`, `/api/vehicles?limit=1000&current_yard_id=...`, `/api/yards`, `/api/admin/flags`, `/api/notifications`, `/api/requisitions` every 5 seconds. That's 6–8 HTTP round-trips per cycle.

**Solution:**

- Install `socket.io` on both backend and frontend.
- Backend: emit events on data mutation (`scan:new`, `flag:created`, `status:changed`). Only push deltas.
- Frontend: subscribe to relevant events per view. Dashboard subscribes to all; ScanView only needs its own yard events.
- Fallback: SSE (`EventSource`) for environments where WebSocket is blocked. Polling drops to a 30s heartbeat.
- Remove the `setInterval` entirely. Keep a single `visibilitychange` listener that reconnects WebSocket on tab focus (in case connection dropped during sleep).

**Impact:** ~95% reduction in network requests. Real-time updates instead of lagged snapshots.

**Files affected:**
- `frontend/src/main.jsx` — remove `setInterval`, add socket hook
- `backend/src/index.ts` — add socket.io server
- `backend/src/routes/scans.ts` — emit events after scan insert
- `backend/src/routes/vehicles.ts` — emit events on status change

### 1.2 Add Response Compression

**Problem:** Express sends uncompressed JSON. A typical dashboard response is ~50–150 KB uncompressed.

**Solution:** Add `compression` middleware.

```
npm i compression
```

```ts
import compression from 'compression';
app.use(compression());
```

**Impact:** 60–80% smaller payloads. Near-zero effort.

### 1.3 Paginate Dashboard & Vehicle Endpoints

**Problem:** `GET /api/vehicles?limit=1000` returns every vehicle in the system. With ~2000 vehicles, that's >1 MB of JSON every 5 seconds. Same for yard stock queries that return all vehicles for a yard.

**Solution:**

- Server-side pagination on all list endpoints: `?page=1&pageSize=50`. Return `{ data, total, page, pageSize }`.
- Dashboard aggregate endpoints (total stock, yard utilization, model split, dwell distribution) use SQL aggregate queries returning only the computed numbers — not the full vehicle list.
- Frontend dashboard views consume aggregate endpoints instead of deriving from raw vehicle data.

**Backend changes:**
- `backend/src/routes/vehicles.ts` — add `OFFSET`/`LIMIT` + `COUNT(*) OVER()` for total
- `backend/src/routes/yards.ts` — add aggregate endpoint `GET /api/yards/:id/stats` returning `{ inCount, capacity, utilization, models: [...] }`
- `backend/src/routes/admin.ts` — `GET /api/admin/dashboard` should return pre-computed metrics, not raw data

**Frontend changes:**
- `frontend/src/main.jsx` — `fetchServerData` should call aggregate endpoints per view
- `frontend/src/api.js` — add pagination params to vehicle list calls

**Impact:** Dashboard payload drops from ~1 MB to ~2 KB.

### 1.4 Tune Database Connection Pool

**Problem:** The `postgres` driver uses default pool settings. Render free tier has limited RAM and CPU; default pool may exhaust connections under concurrent requests.

**Solution:**

```ts
// backend/src/db/client.ts
import postgres from 'postgres';

export const sql = postgres(process.env.DATABASE_URL!, {
  max: 10,        // max connections in pool
  idle_timeout: 5, // close idle connections after 5s
  max_lifetime: 60 * 30, // reconnect every 30 min to avoid stale connections
  connection: {
    application_name: 'stockyard-api',
  },
});
```

**Impact:** More predictable DB behavior under load. Eliminates "too many clients" errors.

### 1.5 Batch SQL Insert for Bulk Sync

**Problem:** `POST /api/scans/bulk-sync` processes scans one-by-one in a loop. Each iteration runs individual `INSERT` and `UPDATE` queries. With 50 queued scans, that's 100+ sequential queries.

**Solution:** Use Drizzle's batch insert / upsert:

```ts
// Single query batch
await db.insert(scans).values(scanRows).onConflictDoNothing();
```

For vehicle status updates, use a CTE (Common Table Expression) or a single `INSERT ... ON CONFLICT DO UPDATE`.

**Impact:** Bulk sync time drops from ~10s to <1s for 50 scans.

### 1.6 Cache Headers for Aggregate Endpoints

**Problem:** All endpoints set `Cache-Control: no-store`. While this is correct for mutable scan data, aggregate/stats endpoints (yard utilization, model split) can tolerate short-lived caching.

**Solution:** For stats endpoints, set:

```ts
res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
```

Frontend respects cache and only revalidates after 30s. Users still see fresh data, but with fewer backend hits.

### 1.7 Eliminate Render Cold Starts

**Problem:** Render free tier spins down after 15 min of inactivity. First request after spin-down takes 30–60s (cold boot). This happens frequently for a yard app used intermittently throughout the day.

**Solution:**

- **Short-term:** Set up a cron-job service (cron-job.org, UptimeRobot, or GitHub Actions scheduled workflow) that pings `GET /api/health` every 5 minutes.
- **Medium-term:** Upgrade to Render's $7/mo plan → no spin-down. Cheaper than the productivity lost to 30s waits.
- **Long-term:** If self-hosting, use a low-cost VPS (Hetzner ~€4/mo) with PM2 to keep Node alive.

### 1.8 Code Splitting (Bundle Size)

**Problem:** The entire app is a single Vite bundle (~1300 lines `main.jsx` + 1651 lines `styles.css` + charts + XLSX parser). First load pays the full cost.

**Solution:**

- `React.lazy()` for each view: `ScanView`, `DashboardView`, `StockView`, `AdminView`, `RequisitionsView`.
- Vite automatically code-splits at dynamic import boundaries.
- XLSX library loaded only on the DeliveredUpload tab (admin-only, rarely used).

```jsx
const AdminView = React.lazy(() => import('./views/AdminView.jsx'));
const ScanView = React.lazy(() => import('./views/ScanView.jsx'));
```

- Extract `styles.css` into per-component CSS modules. Critical CSS inlined in `<head>`.

**Impact:** Initial bundle shrinks from ~180 KB to ~40 KB. Admin-only code loads on demand.

---

## 2. Offline & Resilience

### 2.1 Implement IndexedDB Scan Queue

**Problem:** `if (!online) return` in `ScanView` silently rejects scans when offline. The design document specifies offline queueing (§10), but it was never implemented.

**Solution:**

- Create `frontend/src/offlineQueue.js`:
  - On scan submit: save `{ client_scan_id, vin, scanType, yardId, gps, deviceId, timestamp, outRemark, damage }` to IndexedDB via `idb` library or raw IndexedDB.
  - Show pending count badge on scan icon.
  - On online event + app focus: drain queue via `POST /api/scans/bulk-sync`.
  - Remove synced items from IndexedDB. Show success/failure for each.
  - On failure: retry with exponential backoff (3 attempts), then mark as failed and notify user.

```js
// offlineQueue.js
import { openDB } from 'idb';

const DB_NAME = 'stockyard-offline';
const STORE = 'pending-scans';

export async function enqueueScan(scan) {
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) { db.createObjectStore(STORE, { keyPath: 'client_scan_id' }); }
  });
  await db.add(STORE, scan);
}

export async function drainQueue(bulkSyncFn) {
  const db = await openDB(DB_NAME, 1);
  const all = await db.getAll(STORE);
  if (!all.length) return;
  try {
    await bulkSyncFn(all);
    await db.clear(STORE);
  } catch (e) {
    // keep in queue, retry next time
  }
}
```

- Register `sync` event in Service Worker (`sw.js`) for Background Sync API where supported.
- Add visual indicator: "3 scans pending sync" with sync status.

### 2.2 Add Retry with Exponential Backoff

**Problem:** API calls fail silently. Network blips cause dropped scans with no recovery.

**Solution:** Wrap all API calls in `frontend/src/api.js`:

```js
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}
```

### 2.3 PWA Install Prompt

**Problem:** `manifest.webmanifest` exists but the app doesn't prompt users to install. Yard phones need the app installed as a standalone PWA for full-screen, camera access, and offline support.

**Solution:**

```jsx
// In App component
const [deferredPrompt, setDeferredPrompt] = useState(null);

useEffect(() => {
  const handler = (e) => {
    e.preventDefault();  // don't auto-prompt
    setDeferredPrompt(e);
  };
  window.addEventListener('beforeinstallprompt', handler);
  return () => window.removeEventListener('beforeinstallprompt', handler);
}, []);

// Show install button when available
{deferredPrompt && (
  <button onClick={async () => {
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') setDeferredPrompt(null);
  }}>
    Install App
  </button>
)}
```

---

## 3. Frontend Usability & UX

### 3.1 Route Splitting & View Components

**Problem:** `main.jsx` is 1501 lines with all views (`ScanView`, `AdminDashboard`, `StockView`, etc.) defined in a single file. No router library — uses manual `pushState` / `popstate`.

**Solution:**

- Create `frontend/src/views/` directory with one file per view:
  - `ScanView.jsx`
  - `DashboardView.jsx`
  - `StockView.jsx`
  - `AdminView.jsx`
  - `RequisitionsView.jsx`
  - `DeliveredUploadView.jsx`
  - `BranchesView.jsx`
- Extract each view function from `main.jsx` into its own file.
- Use `React.lazy` + `Suspense` for code splitting.
- Keep a minimal `App.jsx` that handles routing, session, bottom nav, and top bar.

**Benefits:** Each file <200 lines. Independent testing. Lazy loading.

### 3.2 Scan Feedback Overlay

**Problem:** After scanning, the user sees a brief toast or status text. In noisy/bright yard conditions, this is easy to miss.

**Solution:**

- Full-screen result overlay:
  - **Success:** Green background, white checkmark icon, vehicle VIN + model displayed prominently, `duration 3s` auto-dismiss with countdown. Haptic: `navigator.vibrate([100, 50, 100])`.
  - **Error (duplicate, invalid):** Red background, X icon, reason text. Manual dismiss. Haptic: `navigator.vibrate(300)`.
  - **Flagged (unverified IN, GPS out):** Yellow/amber overlay. Shows flag reason. "Scan accepted but flagged" message.
- Set `meta[name="theme-color"]` to match overlay color during display.
- Play a short sound on success (optional, user preference).

### 3.3 Manual VIN Entry UX

**Problem:** The "type VIN" fallback is a small text input below the camera viewfinder. Hard to find when QR is unreadable.

**Solution:**

- Prominent "Enter VIN Manually" button below camera view.
- Tapping it switches to a large single-input form with:
  - Auto-uppercase input (no need to press shift)
  - Character count (17/17) with visual progress
  - Keyboard type set to `text` (no autocorrect)
  - Paste support for barcode scanner keyboards
- "Switch to Camera" button to go back.
- On submit: same validation + feedback flow as QR scan.

### 3.4 Haptic Feedback

```js
function scanHaptic(type) {
  if (!navigator.vibrate) return;
  if (type === 'success') navigator.vibrate([50, 30, 50]);
  else if (type === 'error') navigator.vibrate([200, 100, 200]);
  else if (type === 'scan') navigator.vibrate(30);
}
```

Call on: QR code detected (30ms), scan accepted (success pattern), scan rejected (error pattern).

### 3.5 GPS Status Indicator

**Problem:** The app silently requests GPS. Users don't know if GPS has locked, is pending, or failed. Scans submitted without valid GPS get flagged.

**Solution:**

- Show GPS status badge in scan view header:
  - 🟡 "Acquiring GPS..." (spinner) — GPS not ready
  - 🟢 "GPS locked (±X m)" — accuracy in meters
  - 🔴 "GPS unavailable" — fallback mode
- Block scan submission until GPS is ready, with a 15s timeout that allows override:
  ```js
  // If GPS not ready after 15s, show "Proceed without GPS?" button
  // Scan is accepted but flagged with gps_outside_yard
  ```
- Store GPS accuracy in scan record (already in schema as `gps_accuracy_meters`).

### 3.6 Improved Bottom Navigation

**Problem:** Bottom nav is generic (Dashboard, Stock, Scan, Requisitions). Scan view is a tab among equals, but scanning is the primary action.

**Solution:**

- Dedicated **large FAB (floating action button)** in center of bottom nav with camera icon. Always visible.
- Pressing FAB opens scan view (or switches to camera if already in scan view).
- Simplify nav to 4 tabs max per role (admin gets Admin tab instead of Scan).
- Active tab uses red indicator dot instead of full background fill (current design hides icons on active state).

### 3.7 Card-Based Stock View

**Problem:** Stock view renders a table. Tables are hard to read on 360px-wide phone screens in sunlight.

**Solution:** Card layout:

```
┌──────────────────────────────┐
│  VIN: MCAK20AR000123456      │
│  Model: Hyryder S Hybrid     │
│  IN: 2026-07-24 14:32        │
│  [🟢 IN] [📍 CO01A]           │
│  ─────────────────────────── │
│  Dwell: 2d 4h                │
└──────────────────────────────┘
```

- Color-coded status pill: green `IN`, red `OUT`, amber `Flagged`.
- Swipe left on card to reveal quick actions (view history, flag).
- Pull-to-refresh for manual refresh.
- Virtualized list (`react-window` or Intersection Observer) for 100+ vehicles — only render visible cards.

### 3.8 Dynamic Login Flow

**Problem:** Yards and branches are hardcoded in `stockyardLogic.js`. Login uses mock tokens.

**Solution:**

- On login screen mount, fetch `GET /api/yards` and `GET /api/branches` for dropdowns.
- Cache in `localStorage` with 1hr TTL to avoid delay on repeat logins.
- Remember last selected yard per device.
- Proper password field with show/hide toggle.
- Remove mock token logic entirely. All auth goes through Supabase.

### 3.9 Loading Skeletons

**Problem:** Dashboard shows nothing while data loads (1–3s on cold start). Users see a white flash.

**Solution:** Add skeleton placeholder components:

```jsx
function SkeletonKpi() {
  return <div class="skeleton" style={{ height: 80, borderRadius: 8 }} />;
}
```

- KPIs: 4 gray rectangles pulsing.
- Table: rows of gray bars matching column widths.
- Cards: gray rectangle with smaller bars for text.
- Use CSS animation: `@keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }`

### 3.10 Inline Form Validation

**Problem:** Forms validate on submit. Errors appear as a block at the top. User must scroll to find the offending field.

**Solution:**

- Validate on blur (when field loses focus).
- Show inline error below field in red: "VIN must be 17 characters".
- Disable submit button until all fields valid.
- Show disabled button reason on hover: "Fill all required fields to continue".
- Valid fields show green checkmark.

### 3.11 Memoize Chart Re-renders

**Problem:** SVG chart components re-render entirely every 5s poll cycle, even when data hasn't changed. Causes jank on low-end phones.

**Solution:**

```jsx
const chartData = useMemo(() => computeChartData(rawData), [
  rawData.totalIn, rawData.byYard, rawData.byModel
]);
```

- Shallow compare previous vs current aggregate values.
- Only recompute chart data when aggregates change.
- Use `React.memo` on chart components.

---

## 4. Admin UX

### 4.1 Bulk Flag Resolution

**Current:** Flags listed in a table. Each has a "Resolve" button. Admin must click one-by-one.

**Improvement:**

- Checkbox column on flag table.
- "Select All" checkbox in header.
- "Resolve Selected (N)" button in toolbar (appears when ≥1 selected).
- Filter dropdown: All | Unresolved | By Type (damage, GPS, VIN, etc.).
- Bulk resolve calls `PATCH /api/admin/flags/bulk-resolve` with array of flag IDs.

### 4.2 Vehicle Timeline View

**Current:** Vehicle history is a flat table of scan records.

**Improvement:** Vertical timeline:

```
[IN] 2026-07-24 14:32 — CO01A (Nettur)
  ↓  (dwell: 2d 4h)
[OUT] 2026-07-26 18:45 — Customer Acquisition
  ↓
[IN] 2026-07-26 19:30 — KY01A (Ramapuram, after transfer)
```

- Color-coded markers: green dot = IN, red dot = OUT, amber = flagged.
- Expandable: click to see full scan details (GPS, device, remarks).
- "Force Close" button at the bottom for vehicles stuck IN.
- Print-friendly view for physical records.

### 4.3 Bulk Import Preview

**Current:** Uploading a CSV/XLSX immediately imports. No preview of what will be imported.

**Improvement:**

- On file select, parse and show a preview table: first 10 rows with VIN, model, yard assignment.
- Highlight invalid VINs in red. Show error message per row.
- Dedup against existing vehicles in DB — show "X of Y already exist" with option to skip.
- "Confirm Import" button after review.
- Import result summary: "150 imported, 3 skipped (invalid VIN), 12 duplicates."

### 4.4 Data Export

**Current:** No way to export data. Yard staff manually copy from screen.

**Improvement:**

- CSV/Excel export buttons on:
  - Vehicle stock (filtered by yard)
  - Flag list
  - Vehicle history
  - Dashboard metrics snapshot
- Export uses backend endpoint: `GET /api/export/stock?yardId=...&format=csv`
- Backend streams CSV using `csv-stringify` or similar — no memory spike for large exports.
- Date range filter for history exports.

### 4.5 Notification Center Polish

**Current:** Basic notification list with bell icon.

**Improvement:**

- Notification types with icons: 🚩 flag, 📦 transfer, ✅ resolved
- Group by date: "Today", "Yesterday", "Earlier"
- Click notification → navigate to relevant view/record
- Clear all button with confirmation
- Unread count badge with animation

---

## 5. New Features

### F1 — Real-Time Dashboard (WebSocket)

**Description:** Live feed of all scans across all yards. Admin sees vehicles entering/leaving in real time.

**Implementation:**

- WebSocket event `scan:new` emitted from backend on every accepted scan.
- Payload: `{ type: 'in'|'out', vin, model, yardName, timestamp, flagType? }`.
- Dashboard has a "Live Feed" panel showing the last 20 events with fade-in animation.
- KPI cards update in-place (animated counter tick-up).
- Sound effect on new scan (optional toggle).

**Value:** Admin knows what's happening at all yards without refreshing.

### F2 — Zone / Slot Tracking

**Description:** Divide yards into named zones (A1, A2, B1...). Staff selects zone on IN scan. Admin sees occupancy heatmap.

**Schema additions:**

```ts
// zones table
zones: {
  id: uuid,
  yard_id: uuid (FK),
  code: text, // "A1", "B2"
  max_capacity: integer,
  label: text, // optional description
}

// vehicle_status gets zone_id FK
zone_id: uuid (nullable)
```

**Frontend:**

- Zone picker appears after scan success: "Assign to zone" with grid of zone buttons.
- Admin dashboard: yard utilization drill-down shows zone occupancy as heatmap (green → yellow → red).
- Staff can reassign zone on OUT scan.

**Value:** Find any vehicle within seconds. Optimize yard space usage.

### F3 — Transport / Driver Module

**Description:** End-to-end movement tracking. Admin creates a transport request → driver receives it → scans pickup → scans delivery.

**Tables:**

```ts
transports: {
  id: uuid,
  vehicle_id: uuid,
  from_yard_id: uuid,
  to_yard_id: uuid,
  driver_name: text,
  driver_phone: text,
  status: 'assigned'|'picked_up'|'in_transit'|'delivered'|'cancelled',
  created_at, updated_at, etc.
}
```

**Frontend (driver app):**

- Minimal view: shows assigned transports for the day.
- Tap to update status. GPS captured at pickup and delivery.
- Works offline (queued).
- QR scan vehicle to confirm pickup.

**Value:** Complete chain of custody. Reduce "lost" vehicles during transfer.

### F4 — Push Notifications (Web Push)

**Description:** Notify yard staff and admins without requiring the app to be open. Uses Web Push API.

**Use cases:**

- Admin: new flag created → push notification with flag details.
- Yard: incoming transfer vehicle has arrived → notify destination yard.
- Admin: bulk alert (e.g., "Yard CO01B will be closed tomorrow").

**Implementation:**

- Subscribe on login: `Notification.requestPermission()` → send subscription to backend.
- Backend stores subscriptions in `push_subscriptions` table.
- Backend uses `web-push` library (Node.js) to send notifications.
- VAPID keys generated once, stored in env.

### F5 — Damage Photo Capture

**Current:** `damage_image` column exists in schema but capture is not implemented.

**Implementation:**

- On OUT scan with `damaged = true`, show camera capture UI.
- Use `<input type="file" accept="image/*" capture="environment">` for native camera.
- Resize to max 1920px width (PNG/WebP) client-side.
- Upload to Supabase Storage (`damage-photos/{scan_id}.webp`).
- Store URL in `scans.damage_image`.
- Admin can view photos in scan detail / flag detail.
- Gallery view per vehicle: all damage photos chronologically.

### F6 — Dwell Time Alerts

**Description:** Auto-flag vehicles that have been IN longer than a configurable threshold. Helps prevent forgotten stock.

**Implementation:**

- Backend cron (or on-dashboard-request check): `SELECT vehicle_id FROM vehicle_status WHERE current_status = 'in' AND last_changed_at < NOW() - INTERVAL '30 days'`
- Create flag with type `dwell_exceeded`.
- Admin can set per-yard threshold in yard settings.
- Dashboard shows "Dwell Alerts" section with vehicle count and list.

### F7 — Analytics v2

**Description:** Deeper analytics with trends and exportable reports.

**Metrics:**

- Stock trend: IN/OUT volume per day/week/month (line chart).
- Throughput: vehicles processed per yard per day.
- Damage rate: % of OUT scans with damage, by yard.
- Model popularity: which models move fastest, which sit longest.
- Yard efficiency: throughput vs capacity.

**Frontend:**

- Date range picker (presets: 7d, 30d, 90d, custom).
- Trend charts (Recharts or Chart.js).
- Export each chart as PNG/CSV.
- Schedule automated report email (future).

### F8 — QR Sticker Reprint

**Description:** Generate printable QR labels for vehicles whose windshield stickers are damaged.

**Implementation:**

- Admin searches VIN → "Generate QR" button.
- Backend generates QR code image via `qrcode` npm package (or returns data URL).
- Opens print dialog with label sized 2"×1" (sticker size).
- Printable page has VIN + model text below QR.
- Bulk generate for multiple vehicles.

### F9 — Audit Log

**Description:** Immutable record of all user actions. Compliance and accountability.

**Schema:**

```ts
audit_logs: {
  id: uuid PK,
  user_id: uuid,
  action: text, // 'scan_in', 'scan_out', 'flag_resolve', 'status_override', 'login', etc.
  resource_type: text, // 'scan', 'vehicle', 'flag', etc.
  resource_id: uuid,
  details: jsonb, // before/after snapshots or relevant payload
  ip_address: text,
  created_at: timestamp,
}
```

- All mutating endpoints write to `audit_logs` via a helper function.
- Admin can view audit log filtered by user, action, date range.
- Read-only after write (no update/delete).

### F10 — Multi-Language Support (i18n)

**Description:** Support Malayalam (മലയാളം) and English. Yard staff comfortable in Malayalam will make fewer input errors.

**Implementation:**

- Use `react-i18next` or a simple custom hook with JSON translation files.
- Detect browser language on login, allow manual override.
- Translate all UI text, labels, buttons, error messages.
- Backend: no changes needed. Frontend-only.

### F11 — Progressive Scan Mode (Batch)

**Description:** In high-throughput scenarios (truck unloading 8 vehicles), staff can scan multiple vehicles in quick succession without leaving scan view.

**Flow:**

1. Staff enters "Batch Mode" toggle on scan view.
2. Each scan: camera captures → result shown as a brief overlay (1s) → camera reactivates automatically.
3. Scans queued locally (not submitted individually).
4. "Submit All (N)" button submits batch to `POST /api/scans/bulk-sync`.
5. Result summary: "8 accepted, 1 duplicate, 0 errors."

### F12 — Indoor GPS Fallback

**Problem:** GPS is inaccurate inside metal-roofed yards. Scans get flagged.

**Solution:**

- If GPS accuracy >50m or GPS unavailable after 15s timeout, show manual yard zone selector.
- User picks yard from list (pre-selected to their logged-in yard).
- Record both `user_selected_yard_id` and `gps_coordinates` (if any) in scan.
- Flag only if GPS was wildly different from user selection (e.g., GPS says Cochin but user picked Kollam).

---

## 6. Architecture & Code Quality

### A1 — Secrets in `.env` Committed to Repo

**Severity:** Critical (security)

**Action:**
1. Add `.env` to `.gitignore` at root, `frontend/.gitignore`, `backend/.gitignore`.
2. Rotate all exposed secrets (Supabase service role key, database URL, anon key).
3. Create `.env.example` files with placeholder values.
4. Verify no secrets in git history: `git filter-repo` if needed (or rotate keys now and note the exposure).

### A2 — Mock Auth Tokens

**Severity:** Critical (security)

**Action:**
1. Remove mock token generation in `backend/src/middleware/auth.ts`.
2. Replace with proper Supabase JWT verification using `jose` (already imported) for all environments.
3. Create a login flow: username/password → Supabase Auth → receive JWT → pass as `Bearer` token.
4. Yard users authenticate with shared credentials stored in Supabase Auth (not DB credentials table only).
5. `mock-admin` and `mock-yard-*` tokens removed.

### A3 — Hardcoded Yards/Branches

**Severity:** High (maintainability)

**Action:**
1. Remove hardcoded `yards[]` and `fallbackBranches[]` from `stockyardLogic.js`.
2. On login, fetch yards + branches from API: `GET /api/yards` and `GET /api/branches`.
3. Cache in localStorage with 1hr expiry.
4. Add loading skeleton for yard/branch dropdowns.

### A4 — Duplicated VIN Logic

**Severity:** Medium (maintenance burden)

**Action:**
1. Extract VIN decoding to a shared package (e.g., `packages/vin-decoder/` with its own `package.json`).
2. Both frontend and backend import from this package.
3. Or simplify: VIN decoding only on backend. Frontend calls `GET /api/vehicles/:vin/decode` when needed.
4. **Recommended:** Since VIN decoding is simple pattern matching, keep it only on the backend and call via API. Frontend doesn't need to decode independently.

### A5 — Zero Backend Tests

**Severity:** High (quality)

**Action:**
1. Set up testing framework: Vitest for backend (fast, TypeScript-native).
2. Test:
   - Scan IN/OUT business logic (accept, reject, flag conditions).
   - Auth middleware (valid JWT, invalid JWT, missing, expired).
   - Route handlers (status codes, response shape, error handling).
   - Database queries (use test DB or in-memory SQLite via Drizzle).
3. CI gate: tests must pass before merge.

### A6 — No TypeScript on Frontend

**Severity:** Medium (developer experience)

**Action:**
1. Rename `main.jsx` → `main.tsx`, `stockyardLogic.js` → `stockyardLogic.ts`, etc.
2. Add TypeScript config: `tsconfig.json` with `"jsx": "react-jsx"`.
3. Define and share types with backend via `packages/types/`.
4. Start with `stockyardLogic.ts` (pure functions, easy to type).
5. Incremental migration: new components written in TS, old ones converted file by file.

### A7 — Snake_case / camelCase Mismatch

**Severity:** Low (annoyance)

**Action:**
1. Configure Drizzle `camelCase` mapping: `db.query.scans.findMany({ ... })` returns `{ clientScanId, scanType }`.
2. Or, keep `snake_case` in DB and use `snake_case` consistently in API responses — frontend adapts.
3. Remove manual mapping in frontend code (search for `snake_case` access patterns in `main.jsx`).

### A8 — `any` Types in Backend

**Severity:** Low (quality)

**Action:**
1. Configure `tsconfig.json` with `"strict": true, "noImplicitAny": true`.
2. Infer types from Zod schemas:
   ```ts
   const ScanInSchema = z.object({ vin: z.string(), yard_id: z.string(), ... });
   type ScanInInput = z.infer<typeof ScanInSchema>;
   ```
3. Replace `catch (err: any)` with `catch (err: unknown)` and proper type narrowing.

### A9 — Single CSS File

**Severity:** Low (maintainability)

**Action:**
1. Split into CSS modules:
   - `login.module.css`, `scan.module.css`, `dashboard.module.css`, `stock.module.css`, `admin.module.css`, `nav.module.css`
2. Extract design tokens into `tokens.css`:
   ```css
   :root {
     --color-primary: #EB0A1E;
     --color-bg: #f8f9ff;
     --color-text: #0b1c30;
     --radius-sm: 6px;
     --radius-md: 8px;
     --radius-lg: 12px;
   }
   ```
3. Import per-component CSS in each view file.

### A10 — No CI/CD

**Severity:** Medium (process)

**Action:**
Create `.github/workflows/ci.yml`:

```yaml
name: CI
on: [pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: cd frontend && npm ci && npm run lint
      - run: cd backend && npm ci && npm run lint
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd backend && npm ci && npm test
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd frontend && npm ci && npm run build
      - run: cd backend && npm ci && npm run build
```

Deploy automatically after merge on main branch.

---

## 7. Priority Matrix

| Tier | Items | Rationale |
|------|-------|-----------|
| **T0 — Must Fix** | A1 (secrets), A2 (mock auth), A3 (hardcoded data), §1.7 (cold start) | Security and basic reliability. Ship-stoppers. |
| **T1 — High Impact, Low Effort** | §1.1 (WebSocket), §1.2 (compression), §1.3 (pagination), §3.2 (scan feedback), §3.4 (haptics), §3.5 (GPS indicator), §3.10 (inline validation) | Measurable improvement with <1 day each. |
| **T2 — Core UX** | §3.1 (route splitting), §3.7 (card stock), §3.9 (skeletons), §2.1 (offline queue), §3.8 (dynamic login) | Fills gaps between current state and a polished app. |
| **T3 — Admin Power** | §4.1 (bulk resolve), §4.2 (timeline), §4.3 (import preview), §4.4 (export), §4.5 (notification center) | Makes admin daily work faster. |
| **T4 — New Features** | F1 (real-time), F2 (zones), F4 (push), F5 (photos), F6 (dwell alerts), F7 (analytics v2), F9 (audit log), F10 (i18n), F11 (batch scan), F12 (GPS fallback) | Product expansion. Order by stakeholder value. |
| **T5 — Code Health** | A4 (VIN dedup), A5 (tests), A6 (frontend TS), A7 (case consistency), A8 (strict types), A9 (CSS modules), A10 (CI/CD) | Pay down tech debt. Do incrementally alongside feature work. |
