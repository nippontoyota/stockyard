# Design: OUT transfer autofill (dest yard, DI username, drive type)

Date: 2026-08-03  
Status: implemented

## Goal

When a stockyard (or admin) marks a vehicle **OUT** and that VIN has an **approved incoming** requisition, OUT details autofill so the yard does not re-enter what the delivery incharge already chose:

| Field | Source |
|-------|--------|
| OUT reason | `stockyard_transfer` |
| Destination yard | `requisitions.destination_yard_id` (legacy fallback: first yard of requesting branch) |
| Requested by | DI **username/account** (editable) |
| Drive type | Existing `vehicles.drive_type` when known (editable) |

Same behavior in **ScanView** (camera + type-out) and **AdminOutForm**.

## Why it feels broken today

1. Prefill already sets dest yard + reason from the approved req, but **Requested by** is stuffed with raw `requested_by` (credentials UUID), so it does not look like the DI account.
2. **ScanView never prefills drive type** from the vehicle; only AdminOutForm does.
3. Dest can appear empty if no matching approved incoming req is found (VIN match), or if `destination_yard_id` is null and fallback yards are missing — UI shows blank select.

## Decisions

| Topic | Choice |
|-------|--------|
| Approach | A — fix FE prefill + return username on GET requisitions |
| Backend auto-resolve on OUT | Out of scope (client still sends fields) |
| Requested by display | DI `credentials.username`; field stays editable |
| Drive type | Prefill from `vehicle.driveType`; leave editable; empty if unknown |
| Scope | ScanView (scan + manual) + AdminOutForm |
| Lock / read-only fields | No |

## Flow

```text
Yard scans/types VIN that is IN at this yard
  → Find approved incoming requisition for that VIN
  → If found:
      outRemark = stockyard_transfer
      transferDestinationYardId = requisitionDestinationYardId(req)
      transferRequestedBy = req.requested_by_username || ""
  → Independently (any OUT):
      driveType = vehicle.driveType || "" (prefill once when VIN resolves)
  → Yard can still edit, then confirm OUT
```

## Backend

### `GET /api/requisitions`

- Left-join `credentials` on `credentials.id::text = requisitions.requested_by` (or equivalent cast).
- Include `requested_by_username: credentials.username | null` on each requisition row (incoming and outgoing).
- Keep existing `requested_by` id for auth checks (cancel ownership, etc.).
- No schema migration.

## Frontend

### Prefill helpers (`stockyardLogic.js`)

- Keep `requisitionDestinationYardId(req)`.
- Update `findApprovedTransferReq` to compare **normalized** VINs (`normalizeVin(r.vehicle?.vin) === normalizeVin(vin)`).
- Optional small helper: `requisitionRequesterLabel(req)` → `req.requested_by_username || ""` (do not fall back to UUID).

### `ScanView` (`main.jsx`)

- Existing transfer prefill effect: set reason, dest via helper, requester via username field (not raw id).
- Also set `driveType` from `state.vehicles[pendingVin]?.driveType` when VIN is present and field is empty or when VIN changes (same pattern as admin: initial from vehicle; user can change).
- Manual type-out and camera overlay both read the same state — one prefill path covers both.
- Prefill when effective OUT: trigger when `scanType === "out"` **or** `manualScanType === "out"` with a matching approved req (so typed OUT with known vehicle still autofills).

### `AdminOutForm`

- Prefer `requested_by_username` for `transferRequestedBy`.
- Keep drive type init from `vehicle?.driveType` (already correct).
- Use `requisitionDestinationYardId` helper instead of inlined ternary.

### Placeholders / labels

- Requested-by placeholder: e.g. "DI account / person who requested" (not "person name" only).

## Tests

- Unit: `findApprovedTransferReq` matches normalized VIN; `requisitionDestinationYardId` preference order; requester label prefers username and does not use UUID.

## Out of scope

- Backend synthesizing missing transfer fields on `POST /scans/out`
- Locking dest / requester / drive when prefilled
- Renaming Outgoing / Requests UI
- Changing what is persisted on the scan row (`transfer_requested_by` remains free text — now typically the username)

## Success criteria

1. Approved transfer VIN OUT → reason + deliver-to yard + DI username filled without typing.
2. If vehicle already has drive type → drive select shows that value on ScanView and Admin OUT.
3. Requested-by never shows a UUID when username is available.
4. Yard/admin can still override any autofilled field before submit.
5. Legacy requisitions with null `destination_yard_id` still fall back to first requesting-branch yard.
