# Design: Allow stock transfer for dwell-time alerts

## Goal

Allow a vehicle with an active `dwell_exceeded` flag to complete a Stockyard Transfer without uploading a photo.

## Current behavior

The scan form treats every active flag as a reason to require a damage photo. This makes an informational dwell-time flag block OUT submission even when the vehicle is not damaged. The backend already accepts the transfer payload when the required transfer fields are present.

## Design

Change only the client-side validation in `frontend/src/main.jsx`:

- Remove the generic `isFlagged && !damageImage` rejection.
- Remove the corresponding “active flag requires photo” notice.
- Preserve the existing validation that requires both a damage remark and photo when the operator checks `Car damaged`.
- Preserve flag display, local state updates, offline queue behavior, and the existing scan payload. No server, database, or flag-resolution behavior changes.

## Performance and data integrity

This is a validation-only change. It must not add requests, re-fetches, state fields, persistence writes, or mutation of existing vehicle/flag records. The current scan is submitted once through the existing path, and only the existing immutable next-state calculation is used.

## Verification

- Add a focused pure-logic regression test proving an OUT transfer remains accepted when the local state contains a `dwell_exceeded` flag.
- Keep the existing damage validation tests/behavior intact.
- Run frontend tests and production build; run backend tests if the repository test command includes them.

