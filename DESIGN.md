# Design

Draft from the code. Edit the reasons into your own words.

## Problem

A Christmas Bird Count compiler runs a count for one or more circles. They track volunteers, season records, area assignments, notes, and results. The data is personal: names and emails of volunteers. Compilers work in spreadsheets and email, and the tools they have do not know about seasons or areas.

## Constraints

- Volunteer data must stay on the compiler's computer.
- No budget for a server, hosting, or API keys.
- Each compiler uses it a few weeks a year, so it must be easy to open again after months.
- Circles differ. One person may compile several.

## Decisions

### Postgres in the browser (PGlite, IndexedDB)

No server means no volunteer data to host, secure, or leak, and no running cost. The data is relational with business rules, so a real SQL engine fits better than JSON in local storage.

Rejected:
- localStorage or a JSON blob: no constraints, no views, rules end up scattered in UI code.
- SQLite WASM: also works. PGlite gives the same Postgres features used in server work (partial unique indexes, composite foreign keys, enums, citext), so the schema moves to a server unchanged.
- A hosted backend: needs auth, hosting, and a privacy policy for volunteer data.

Trade-off: data lives in one browser. Export Backup and Auto-Save cover that. Clearing site data loses the roster unless a backup exists.

### Rules live in the database

- One active circle: partial unique index.
- One current season per circle: partial unique index.
- Everything is scoped by `circle_code`, with composite foreign keys so a row cannot point at another circle's area.
- Business views hold the rules: `v_open_areas`, `v_needs_reminder`, `v_possible_outreach`, `v_current_assignments`.

Why: one definition of "open area" or "needs a reminder", tested once, used by every screen. The integration tests assert these rules against real Postgres.

Cost: changing a view's columns needs a drop and recreate. Views are re-applied on every start (`db/views.sql`).

### Versioned migrations

`db/migrations/NNN_name.sql` files run once each, in order, each in a transaction with its `schema_version` row. A failure rolls back that step. A database newer than the app is refused (`SchemaTooNewError`) instead of being altered.

Databases from before versioning are detected and adopted: migration 001 is recorded as applied, then the idempotent catch-up migration 002 runs. The first single-circle format is moved into a circle named `LEGACY` in one transaction.

Rejected: checking for columns in application code on every start. Each schema change added another branch and none were tested.

### Bring your own eBird key

The key stays in the browser and goes only to eBird. No key is stored by the app's host, and there is no shared quota to exhaust. Scouting a circle does not need a key.

### Import rules

- Audubon imports never overwrite existing people or season records.
- A file value that is missing keeps the stored value.
- The current list is what the compiler says it is. Reminders follow it once one exists.
- Importing the same file twice changes nothing.

These are product decisions made by the compiler's needs. The integration tests pin them.

### Static hosting

The app is static files on GitHub Pages. Audubon's circle page sends no CORS headers, so circle details need the dev or preview proxy and fall back to ArcGIS search on a static host.

## Code layout

- `src/db`: migrations, one module per concern, `CbcDb` as the single class the UI uses. `pgliteDb.ts` is the only file that knows about IndexedDB and Vite. Tests give `CbcDb` an in-memory PGlite and read the same SQL files from disk.
- `src/services`: pure functions and network clients.
- `src/hooks` and `src/components`: state and UI, one component per tab.

## What would change with a server

- Replace the browser client with a Postgres connection. The migrations and views carry over.
- Add auth and per-compiler row ownership, and encrypt volunteer contact data.
- Move the Audubon proxy server side.
- Replace file backup with database backup.

## Known gaps

- Seasons do not roll over to the next year in the app.
- `results_received` is stored per area, not per season.
- Two browser tabs on the same data are not coordinated.
