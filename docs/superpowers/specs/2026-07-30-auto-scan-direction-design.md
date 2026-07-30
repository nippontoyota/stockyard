# Auto scan direction (remove IN/OUT toggle)

**Date:** 2026-07-30  
**Status:** Approved

## Problem

Scan screen forces staff to pick IN or OUT via two toggle buttons. Direction is already inferable from whether the vehicle is currently in the yard.

## Solution

Always derive scan direction from vehicle status. Remove manual override UI and state.

### Rules

- Vehicle **not** marked IN at the current yard → scan **IN**
- Vehicle **already** IN at the current yard → scan **OUT**
- Keep existing OUT reason select + confirm dialog

### Changes

1. **`frontend/src/main.jsx` (`ScanView`)**
   - Remove `manualScanType` state and the IN/OUT toggle buttons
   - Set `scanType = autoScanType` only (`isCarInCurrentYard ? "out" : "in"`)
   - Live status pre-submit check: drop `manualScanType` preference; always use live IN-at-yard → OUT else IN
   - Keep yard badge and `Submit IN` / `Submit OUT` labels driven by auto `scanType`

### Out of scope

- OUT reason options or confirm dialog behavior
- QR / camera / damage / key fields
- Backend scan API

## Success criteria

- No IN/OUT toggle on scan screen
- Manual entry and QR submit buttons show IN or OUT from vehicle status
- OUT still requires reason + confirm
