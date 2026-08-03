# Design: Inbound transit receive for branch transfers

Date: 2026-08-03  
Status: implemented

## Goal

When a vehicle is scanned OUT at yard A as a stockyard (branch) transfer to yard B, it becomes **in transit** toward B. Delivery incharge and stockyard users at B see an **Incoming** list and can mark the car received (IN at B) by selecting it — without needing to treat it as a brand-new scan IN (scan IN remains a fallback).

## Decisions

| Topic | Choice |
|-------|--------|
| Status after transfer OUT | Set `vehicle_status.current_status = 'transit'` |
| Destination storage | Set `current_yard_id` to `transfer_destination_yard_id` |
| Who can receive | Yard B **stockyard** and branch B **delivery_incharge** |
| Receive lands as | `in` at the destination yard chosen on the transfer OUT |
| List vs scan | Incoming list is primary; normal scan IN at B still allowed |
| TKM admin transit upload | Same `transit` pool — same Incoming tab |

## Current gaps (why this exists)

Today transfer OUT leaves the vehicle `out` at source yard A. Dest yard is only on the scan row. Yard B cannot see inbound transfers in stock filters. Receive is scan-IN only. Status `transit` is only used for admin TKM upload.

## Flow

```text
DI@B requests vehicle at A
  → Source approves
  → Stockyard@A OUT (stockyard_transfer → yard B)
  → Vehicle: status=transit, current_yard_id=B
  → Requisition fulfilled (existing)
  → Notify DI@B + stockyard users whose yard is B (new/extra)
  → Incoming tab at B shows the vehicle
  → Receive (or scan IN fallback) → status=in at yard B
```

## Backend

### Transfer OUT (`processScanOut` when `out_remark === 'stockyard_transfer'`)

1. Require `transfer_destination_yard_id` (already required).
2. After accepting the OUT scan, set vehicle status to:
   - `current_status: 'transit'`
   - `current_yard_id: transfer_destination_yard_id`
   - keep last_out_scan_id / timestamps as today
3. Keep requisition fulfill + notify DI@B.
4. Also notify `stockyard` role users for destination yard B (via yard→branch or yard-scoped push if available; otherwise branch-level stockyard notifications filtered client-side is acceptable fallback — prefer yard-scoped).

Non-transfer OUT stays `out` at the scanning yard (unchanged).

### Incoming list API

`GET /api/vehicles/incoming` (authenticated):

| Role | Filter |
|------|--------|
| `stockyard` | `current_status = 'transit'` AND `current_yard_id = session.yard_id` |
| `delivery_incharge` | `current_status = 'transit'` AND `current_yard_id` in yards mapped to `session.branch_id` |
| `admin` | optional: all transit, or omit from nav |

Return VIN, model, drive_type, destination yard, last_changed_at, last OUT scan fields if useful (source yard, requested_by, remark).

### Receive API

`POST /api/vehicles/:vin/receive` (or `/api/scans/receive`):

- Auth: stockyard whose yard is the vehicle’s current dest, OR delivery_incharge whose branch owns that dest yard.
- Vehicle must be `transit`.
- Idempotent if already `in` at that yard.
- Effect:
  - Create an accepted IN scan (server-generated `client_scan_id`, device fingerprint from caller or `"receive-list"`).
  - Set `current_status = 'in'`, `current_yard_id` unchanged (dest yard).
  - Optional empty key_no / drive_type unless client sends them.
- Scan IN fallback: existing `processScanIn` already moves transit→in when scanned at B; ensure it does not reject transit vehicles.

### Stock list / filters

- Stockyard yard inventory: still primarily `in` at their yard; do **not** mix transit into Live Stock counts as parked capacity (transit is inbound, not yet occupying).
- Incoming is a separate query/tab.
- Admin “IN-TRANSIT” / TKM upload continues to write the same `transit` status → appears in Incoming for the chosen yard.

## Frontend

### Nav

| Role | New tab |
|------|---------|
| `stockyard` | **Incoming** (alongside Scan / Stock / Dash / Requests) |
| `delivery_incharge` | **Incoming** (alongside Stock / Dash / Requests) |

Badge = count of incoming transit vehicles for their scope.

### Incoming tab UI

- List cards: model, VIN, dest yard code/name, “From transfer” / time since OUT if available.
- Primary action: **Receive**.
- Confirm sheet (short): VIN + model + yard → Confirm receive.
- Empty state: “No vehicles on the way to this yard.”
- Both roles use the same component; DI cannot open Scan.

### Scan fallback

- No special block: scanning IN a transit VIN at dest yard works as today (becomes `in`).
- Do not auto-open Incoming from Scan; list is the discoverable primary path.

### Local state

- Map `transit` in `mapServerResponse` / vehicle cards.
- After receive or refresh, drop item from Incoming; stock at B shows it as IN.

## Edge cases

| Case | Behavior |
|------|----------|
| Branch B has multiple yards | Dest is the yard chosen on OUT; only that yard’s stockyard + whole-branch DI see it |
| Transfer OUT without requisition | Still allowed (today); still enters transit for dest |
| Wrong dest yard picked | Operator error; admin edit can fix yard/status (existing admin tools) |
| Receive when not transit | 400 |
| Stockyard user at yard A | Does not see cars transferred away (left A) |
| Capacity / dwell | Capacity uses `in` only; dwell alerts for `in` only (unchanged) |

## Out of scope

- Changing requisition create/approve UX
- Forcing requisition before transfer OUT
- GPS / driver tracking
- Push redesign beyond notifying dest stockyard on transfer OUT
- Merging Incoming into Requisitions tab (kept separate for scan-less receive clarity)

## Testing / verification

- Transfer OUT → vehicle `transit` at dest yard_id.
- Incoming API returns it for dest stockyard + requesting DI; not for source stockyard.
- Receive → `in` at dest; disappears from Incoming; appears in Live Stock at B.
- Scan IN at B while transit → same end state.
- TKM transit upload still shows in Incoming for mapped yard.
- Frontend + backend tests/build pass.

## UI notes

- Match existing list/card patterns (requisitions / stock), not new card-heavy chrome.
- Receive is one clear primary button; confirmation before mutate.
- Mobile: Incoming in bottom nav with badge.
