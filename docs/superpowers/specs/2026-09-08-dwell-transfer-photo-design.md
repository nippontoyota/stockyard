# Design: Allow stock transfer for dwell-time alerts

## Goal

Allow a vehicle with an active `dwell_exceeded` flag to complete a Stockyard Transfer without uploading a photo, and close the dwell alert when the vehicle leaves the yard or begins a new ordinary IN cycle.

## Current behavior

The scan form treated every active flag as a reason to require a damage photo. This made an informational dwell-time flag block OUT submission even when the vehicle was not damaged. Dwell flags also remained open after a vehicle left the yard, so they could continue inflating flag counts and follow the vehicle to a new location.

## Design

Change the client and server lifecycle handling:

- Remove the generic `isFlagged && !damageImage` rejection.
- Remove the corresponding “active flag requires photo” notice.
- Preserve the existing validation that requires both a damage remark and photo when the operator checks `Car damaged`.
- Resolve an open `dwell_exceeded` flag in the same transaction when an accepted ordinary OUT or ordinary IN starts a new dwell cycle.
- Keep the flag open for Display OUT and display-return IN because the vehicle remains physically IN and continues counting toward dwell.
- Periodically resolve legacy dwell flags whose vehicle is no longer IN.
- Preserve flag display, local state updates, offline queue behavior, and the existing scan payload.

## Performance and data integrity

The client change adds no requests, re-fetches, state fields, or queue writes. Dwell resolution is a targeted conditional update inside the existing scan transaction and only changes matching unresolved dwell flags. The periodic cleanup is one background SQL update before the existing dwell query; it does not run in the scan request path.

## Verification

- Add a focused pure-logic regression test proving an OUT transfer remains accepted when the local state contains a `dwell_exceeded` flag.
- Verify ordinary OUT and fresh ordinary IN resolve the dwell flag locally, while Display OUT preserves it.
- Keep the existing damage validation tests/behavior intact.
- Run frontend/backend tests and production builds.
