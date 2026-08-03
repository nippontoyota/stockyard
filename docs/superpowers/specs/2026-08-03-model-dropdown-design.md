# Design: Model dropdown replaces VIN decode

Date: 2026-08-03  
Status: draft (pending user review)

## Goal

Stop deriving vehicle details from VIN. On scan IN, require the operator to pick a Nippon Toyota model from a fixed dropdown. Remove variant/colour collection and all VIN metadata decoding.

## Decisions

| Topic | Choice |
|-------|--------|
| Model source | Hardcoded shared list matching luckydraw seed (13 models) |
| Where to select | Scan IN only (manual VIN + QR IN) |
| VIN decoder | Remove entirely (offline heuristics + NHTSA) |
| Variant / colour | Stop collecting; remove from FE/BE handling; clear stored values |
| Admin model edit | Keep free-text/admin model edit as today (out of scope for dropdown) |
| OUT scan | No model picker; vehicle already has model |

## Model catalogue

Exact names (from `nippon-luckydraw/prisma/seed.ts`):

1. Fortuner  
2. Innova Crysta  
3. Innova HyCross  
4. Camry  
5. Hilux  
6. Glanza  
7. Urban Cruiser Taisor  
8. Urban Cruiser HyRyder  
9. Urban Cruiser Ebella  
10. Legender  
11. Land Cruiser 300  
12. Vellfire  
13. Land Cruiser Prado  

Shared constant (e.g. `CAR_MODELS`) used by frontend dropdown and backend validation. No DB models table.

## Scan IN flow

1. Operator enters/scans VIN as today.
2. Required **Model** `<select>` appears (same visual language as drive-type / yard selects).
3. Placeholder: “Select model”. Submit blocked until a catalogue value is chosen.
4. `POST /api/scans/in` (and bulk-sync IN) require `model` ∈ catalogue.
5. Server stores `model` as provided. No `resolveVehicleMetadata` / `detectModel`.
6. No decode preview (model/variant/colour/engine/plant chips).

## Removals

### Code / APIs

- Delete `decodeVinDetails`, `detectModel`, NHTSA client, `resolveVehicleMetadata`.
- Remove all call sites (scans create, vehicles list fallbacks, transit import, admin import, yard/export/admin flag helpers, frontend `applyScan` decode).
- Strip `variant` / `colour` from request/response mapping, admin PATCH, UI forms/cards/tables/filters/Excel export overlays.

### Data

- Clear existing `vehicles.variant` and `vehicles.colour` (and stop writing them).
- Prefer leaving columns in place unused if a drop migration is awkward; do not surface them in product UI/API payloads where practical.
- Existing `vehicles.model` strings remain; new IN writes only catalogue names.

### Transit / import

- Do not invent model from VIN.
- Prefer explicit Model column when present; otherwise leave empty / a clear placeholder and allow later admin edit — never decode.

## UI notes

- Model dropdown: required, labelled, matches existing select styling; good spacing next to VIN / drive type; works on mobile scan layout.
- Success / confirm overlays: show chosen model from request/stored vehicle, not decode.
- Vehicle cards / lists: show model only (no variant/colour lines).
- Live Stock model filter: continue building options from stock models present.

## Testing / verification

- Unit: catalogue validation accepts the 13 names; rejects unknown.
- Scan IN without model fails validation (FE + BE).
- Scan IN with model persists that model.
- No remaining imports/references to decode/NHTSA helpers.
- Manual UI check: IN form layout on desktop + narrow mobile; no leftover decode UI.

## Out of scope

- Admin CRUD for models
- Colour catalogue
- Changing OUT / requisition flows beyond removing variant/colour display
- Rewriting historical model strings that are not in the catalogue
