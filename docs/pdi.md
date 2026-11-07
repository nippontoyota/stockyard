# Branch PDI

PDI records pre-delivery inspections against existing vehicles. Each inspector has an individual account assigned to one branch. Its existing `branch_yards` mapping determines which vehicles that inspector can access. Only vehicles currently IN in a linked yard can receive an inspection.

An inspection requires a completed-checking confirmation and either **OK for sale** or **Repair required**. Repair results require remarks. The latest inspection supplies the vehicle tag; previous inspections remain available. Repair tags never block delivery, transfers, IN/OUT, or resolve existing flags.

## Enablement

The code defaults to PDI disabled (`PDI_ENABLED` must be exactly `true`). Existing vehicle endpoints do not query the new table while disabled. Do not use `db:push`, seed scripts, or replay the historical Drizzle migrations for this feature.

1. Take and verify a backup/snapshot of the target database. First rehearse on a restored copy, comparing existing records before and after.
2. From `backend`, with `DATABASE_URL` pointing to the intended database, run:

   ```sh
   npm run db:migrate-pdi
   ```

   This runs only `migrations/pdi.sql` in a transaction. It creates `pdi_inspections`, its sequence/indexes/constraints, and enables RLS on the new table. It does not insert, update, or delete existing data. Re-running it is safe. The API database role must own the new table or have appropriate privileges and an explicit RLS policy; public Supabase REST roles have no inspection access by default.

3. Set `PDI_ENABLED=true` in the backend environment and deploy/restart the updated backend and frontend. Keep the change that removes the old startup variant/colour-clearing UPDATE; deploying an older backend would restore that destructive startup behaviour.
4. In **Admin → Setup → Passwords → PDI branch teams**, create inspector accounts with a username, branch, and password of at least 8 characters. New PDI passwords are hashed, case-sensitive, and never returned by the credentials API. Admin can reset them. Existing credentials retain their current format and behaviour.
5. Pilot one branch: log in as PDI, inspect an IN vehicle, verify the result in Admin/Stockyard/Delivery stock, and attempt an outside-branch VIN. Then create accounts for the other teams.

No live database migration, backup, or production rollout is performed merely by building or testing the repository.

## Inspection behaviour

- Manual lookup accepts a complete 17-character VIN. Camera scanning uses the installed QR reader and accepts a single VIN, including one wrapped in a label or URL. Unknown VINs do not create vehicles.
- Staff can search branch vehicles and filter by Not recorded / OK / Repair Required, or browse branch inspection history. Lists and history are paginated (30 rows).
- Detailed history is available to Admin globally, Stockyard for its yard, and Delivery/PDI for their currently permitted branch vehicles. A receiving branch can view earlier-branch inspections on its vehicles. The branch history tab lists inspections performed by its team on vehicles it can still access; Admin retains access after transfers.
- The server derives the inspector, branch, location, and timestamp. A submission writes only one inspection row. Existing vehicle details, stock status, scans, flags, requisitions, and notifications are untouched.
- Vehicle and status rows are locked while validating/inserting. The request includes the yard and latest-inspection ID seen by the inspector. A changed location/status or newer inspection returns a conflict; reload, review the history, and confirm checking again. Result and remarks survive this reload.
- An inspection's unique submission ID makes lost-response retries safe. The form keeps the same payload until the server confirms it. There is no offline save queue; forms remain in memory while the page stays open, and refreshing/closing it discards unsaved input.
- A reinspection creates a new row. There are no edit/delete inspection endpoints. Vehicle/account foreign keys prevent deletion of referenced history; the existing vehicle delete transaction rolls back and returns a clear error for inspected vehicles.
- Transfers retain the previous PDI tag and history. There is no automatic expiry or mandatory reinspection after transfer.
- PDI accounts are denied the legacy authenticated API surface, including generic vehicle/scan reads and all stock mutations. Their session's branch/account is checked against the database on each request. Inactive branches cannot use PDI.
- The socket event `pdi:changed` contains no vehicle or inspection data. Clients refresh through authorized HTTP endpoints. PDI details appear separately from the movement timeline, leaving dwell calculations intact.

## Validation

```sh
npm test --prefix backend
npm run build --prefix backend
npm test --prefix frontend
npm run build --prefix frontend
```

Backend integration tests run actual PostgreSQL SQL in a disposable in-memory PGlite database and exercise Express through a loopback server. They never connect to `DATABASE_URL`. They cover additive migration reruns, record preservation, branch boundaries, required fields, retries, stale/concurrent submissions, transfers, pagination, account creation/password resets, deletion rollback, and delivery with Repair Required. The database test engine is a development-only dependency. A production PostgreSQL rehearsal is still needed for deployment privileges, pooler settings, and real multi-connection lock behaviour.

Frontend checks cover VIN/QR handling, result labels, and submission rules. Browser verification should also exercise camera permission denial, actual vehicle QR codes on staff phones, offline retry, inspection history, mobile layout, and account management.

## Disable / rollback

Set `PDI_ENABLED=false` and restart the current backend. PDI login/routes are disabled and shared tags are hidden; stock workflows continue. Retain the inspection table, account rows, and the startup data-preservation fix. Do not drop history or restore an older application version that clears variant/colour values.
