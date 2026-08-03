# Design: Requisition deliver-to yard

Date: 2026-08-03  
Status: implemented

## Goal

Delivery incharge picks which yard under their branch should receive a requested vehicle. Stockyard OUT for that requisition uses that yard as `transfer_destination_yard_id` (not the first yard under the requesting branch).

## Why Outgoing is correct (not a bug)

Tab split is from **this branch’s point of view**:

| Tab | Meaning |
|-----|---------|
| **Outgoing** | Requests *you* created (`requesting_branch_id` = your branch) |
| **Incoming** | Requests *other* branches made against *your* stock (`source_branch_id` = your branch) |

Chavakkad DI create request → always **Outgoing** for Chavakkad. Source branch sees it under **Incoming**. Unrelated to nav **Incoming** (transit receive).

## Decisions

| Topic | Choice |
|-------|--------|
| Storage | `requisitions.destination_yard_id` → `yards.id` |
| Required on create | Yes — must be a yard mapped to `requesting_branch_id` via `branch_yards` |
| Single-yard branch | Auto-select that yard in UI; still persisted |
| Legacy rows (`NULL`) | FE/BE fallback: first yard of requesting branch (today’s behavior) |
| Approver visibility | Show deliver-to on **Incoming** and **Outgoing** rows |
| Stockyard override | No — OUT prefill uses stored `destination_yard_id` |
| Rename Outgoing | Out of scope |

## Flow

```text
DI@Chavakkad opens Request vehicle
  → Pick source region/yard + vehicle (existing)
  → Pick Deliver to: one of Chavakkad’s mapped yards (new, required)
  → POST { source_branch_id, vehicle_id, destination_yard_id }
  → Source branch sees Incoming with Deliver to: CODE · Name
  → After approve, stockyard OUT auto-sets transfer dest = destination_yard_id
  → Transit receive at that yard (existing inbound transit flow)
```

## Backend

### Schema

- Add nullable `destination_yard_id text` FK → `yards.id` on `requisitions` (nullable for legacy).
- Apply with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on boot (same pattern as yard capacity), plus Drizzle schema update.

### `POST /api/requisitions`

- Body: `source_branch_id`, `vehicle_id`, `destination_yard_id` (required).
- Validate `destination_yard_id` is in `branch_yards` for `requesting_branch_id`.
- Persist on insert.

### `GET /api/requisitions`

- Include `destination_yard_id` and nested `destination_yard: { id, code, name }` (join `yards`).
- Keep building `requesting_branch.yards` for Incoming (fallback / display helpers).

### Stockyard OUT prefill (client)

- Prefer `req.destination_yard_id`.
- Else `req.requesting_branch.yards[0]?.id` (legacy).

## Frontend

### Create Request modal

- Load yards for DI’s branch (existing branch/yard list API or small helper from session + already-loaded yards).
- Label **Deliver to** select; auto-select when one yard; required always.
- Label source picker clearly (e.g. **From yard**) so deliver-to is not confused with source.

### Rows

- Incoming + Outgoing: show `Deliver to: {code} · {name}` when present; if missing, omit or show branch name only.

### API helper

- `createRequisition(sourceBranchId, vehicleId, destinationYardId)`.

## Out of scope

- Renaming Outgoing → My requests
- Letting stockyard change destination at OUT
- Per-yard DI login scoping for list visibility (lists stay branch-scoped)

## Success criteria

1. Multi-yard DI cannot submit without choosing deliver-to.
2. Approved transfer OUT lands transit at the chosen yard.
3. Source Incoming row shows which yard will receive the car.
4. Existing NULL destination rows still OUT to first requesting-branch yard.
