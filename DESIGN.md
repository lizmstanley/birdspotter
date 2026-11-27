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

Cost: changing a view's columns needs a drop and recreate. Views are re-applied on every start (`apps/cbc-manager/db/views.sql`).

### Versioned migrations

`apps/cbc-manager/db/migrations/NNN_name.sql` files run once each, in order, each in a transaction with its `schema_version` row. A failure rolls back that step. A database newer than the app is refused (`SchemaTooNewError`) instead of being altered.

Databases from before versioning are detected and adopted: migration 001 is recorded as applied, then the idempotent catch-up migration 002 runs. The first single-circle format is moved into a circle named `LEGACY` in one transaction.

Rejected: checking for columns in application code on every start. Each schema change added another branch and none were tested.

### Bring your own eBird key

The key stays in the browser and goes only to eBird. No key is stored by the app's host, and there is no shared quota to exhaust. Scouting a circle does not need a key.

### eBird hotspots are kept for the day, sightings for 6 hours

Each eBird response is saved in `localStorage` under the local date and the request URL. A hotspot request runs at most once a day. A sighting copy, regular or notable, is used for 6 hours at most, because eBird's API terms allow observations only a short-term cache of 1 to 6 hours. Hotspots are places, not observations, so they keep the day rule in the web app. CBC Scout fetches sightings sooner, once the saved copy is older than its refresh interval, and takes hotspot copies up to 6 hours old, since it shows saved data with no signal under the same 6-hour limit as sightings. When a request fails for lack of signal (a failed connection or the fetch timeout), the fetch falls back to a saved copy up to 6 hours old, from today or the day before, and marks it as a no-signal copy; an eBird error response does not fall back. A key with a character the browser cannot send in a header fails as a key problem before the saved copy is read, since `fetch` would reject it with the same `TypeError` as a dropped signal; `new Headers` decides, so the app keeps no character list. A rejected key drops that request's copies, and CBC Scout drops the rows it holds, so no signal never brings back data fetched under an earlier key. CBC Scout keeps each list's fetch time, shows it with no signal, and drops a list once it is 6 hours old. The URL holds the center, radius, and day range, and never the key. Writing a new copy drops sighting copies past 6 hours, copies from the day before once 6 hours old, and every copy from earlier days. Storage stays bounded to one day of hotspot requests plus up to 6 hours of the day before, and 6 hours of sighting requests, and a save just past midnight keeps the evening copies the no-signal fallback reads. Errors and responses that fail validation are not saved, and a saved copy is validated again on read.

Rejected: a PGlite table. The data is a disposable copy of eBird's, not circle data, so it stays out of backups and migrations.

Every place that shows eBird data credits eBird.org with a link, as the eBird API Terms of Use require.

### Import rules

- Audubon imports never overwrite existing people or season records.
- A file value that is missing keeps the stored value.
- The current list is what the compiler says it is. Reminders follow it once one exists.
- Importing the same file twice changes nothing.

These are product decisions made by the compiler's needs. The integration tests pin them.

### Seasons

Audubon sets the count window every year (Dec 14 to Jan 5), so the app has no "start season" action. A season is named for the year its window opens. The app treats a season as current from September of that year until the next September, because results arrive for months after the count. From September, a circle still on the previous season is offered a move to the new one. The compiler can decline for now.

Data is organized by season where it differs each year:
- Participations (RSVP, area, counter type) and notes with a year.
- Results received: `area_results`, one row per area and season. A new season starts empty and old seasons keep their record.
- Count date: kept on the circle for the current season, saved onto the season when it ends. It must be a real day in the season's window, Dec 14 to Jan 5. A date from Audubon or ArcGIS outside the window is not used.

Data that carries over: people, areas, pinned notes. At rollover the compiler chooses whether last season's assignments carry over. Confirmed and undecided people who had an area keep it, with RSVP reset to no response. Everyone else has no record yet and shows up for a reminder.

Awaiting Results starts tracking on count day. If no count date is set yet, it starts Dec 14.

### Static hosting

The site is static files on GitHub Pages. The home page at the site root leads with Birdspotter at `app/`; the CBC page at `cbc/` links to the circle manager at `cbc/manager/` and CBC Scout at `cbc/scout/`. An installed app's scope covers every path under it, so no app sits at the root or at `cbc/`: Birdspotter installed at the root would cover CBC Scout, and an area link could open in Birdspotter's window on Android. The two pages are plain HTML with no manifest, so neither installs. Each app builds into its own folder with its own base, so `import.meta.env.BASE_URL` is the app's address and each service worker's scope is that folder. Audubon's circle page sends no CORS headers, so circle details need the dev or preview proxy and fall back to ArcGIS search on a static host.

### CBC Scout opens with no signal

Count areas often have no signal, so CBC Scout's service worker saves the app's own files with the Cache API. It answers GET requests under its scope and every OpenFreeMap request (below); eBird passes through. Each request goes to the network first. A good response for the app's own files (status 200, same origin, no redirect) is saved; map responses never are. The page is revalidated, so a saved page never holds back a release when the network answers. If the network fails, or has not answered in 4 seconds, the saved copy is served, page and built files alike. A page served from the save loads its built files from the save at once, so a weak signal costs one 4-second wait, not one per file, and the app opens as the previous release at worst. With no saved copy it waits for the network. The open that installs the worker loads before the worker controls it, so installing fetches and saves the current release.

The saved page is replaced only once every built file it loads is saved, and the previous release's built files are removed only after that, so a signal lost mid-update leaves the previous release able to open. The worker reads the asset list from the new page itself, so the app code takes no part. The cache has one name with a `cbc-scout-` prefix; a change to what it stores renames it, and activation removes the other `cbc-scout-` caches except saved street maps. It never touches other names, since the apps share the origin's caches.

Rejected: `vite-plugin-pwa` or Workbox precaching, a dependency and build plugin for a few lines of worker code; a build step that writes a precache list, since network first saves the same files on the first online open; cache first for built files, safe with hashed names but a second rule where one works; dropping the whole cache when a new page arrives, simpler, but a signal drop mid-update leaves nothing to open. Birdspotter's worker saves nothing, since nothing asks for it offline yet.

### CBC Scout saves an area's street map

A counter saves the active area's street map from **Your areas**, with a signal, before going out. The page, not the worker, runs the download (`offlineMap.ts`): it fetches OpenFreeMap's style, each source's TileJSON, the sprite at 1x and 2x, three glyph ranges (Latin, Latin Extended-A, punctuation) for each font the style's labels use, the shaded relief tiles to zoom 6, and every vector tile from zoom 0 to 14 that touches the bounding box of the area's outline. Vector tiles stop at 14 because the source has none above it; MapLibre overzooms. It reads the style rather than fixed URLs, since OpenFreeMap moves sources between its `planet` and `backup_planet` builds.

OpenFreeMap's terms allow offline downloads of at most 3,000 tiles and 50 MB each, at most 4 requests at a time, each started by the user, from an app it can identify. The download counts tiles before it fetches one and stops over 3,000. It counts bytes as stored, after the browser decompresses them, which is never less than the wire size, and stops before storing past 50 MB. It runs 4 requests at a time. Browsers do not let a page set `User-Agent`; OpenFreeMap confirmed that the `Referer` the browser sends identifies a web app, and asked for plain tile URLs with no added query parameter. One area is a few hundred tiles.

Each area's map is its own cache, `cbc-scout-map-v1:<circle>/<area>`, so removing an area drops only its map. The download deletes that cache first and writes a details entry (date, tile count, bytes) last; on failure it deletes the cache, so an area has a whole map or none, and the details entry is what tells the page a map is saved. The entry holds the box the map covers; when the compiler sends the area again with an outline in another box, the page removes the map, so a saved map never claims to cover ground it lacks. Otherwise a saved map stays until the counter removes it. On start, CBC Scout deletes each map whose area is no longer saved, such as one whose link it can no longer read, unless the browser blocked reading the saved areas.

The worker answers OpenFreeMap requests from the network and, once the network fails or has not answered in 4 seconds, from any saved map. It saves nothing itself, so coverage never depends on where the counter panned. Tile URLs carry a dated planet build, and the style and TileJSON URLs are the same for every area, so offline the worker serves whichever saved TileJSON it finds first. Vector tiles are therefore stored under a key without the build (`cbc-scout-saved/vector/{z}/{x}/{y}.pbf`), and the worker maps a request to that key the same way, so any saved TileJSON reaches every saved area's tiles. `offlineMap.ts` and `sw.js` each hold the key rule and the cache prefix, since the worker is a plain file outside the build. Attribution comes from the saved TileJSON, so it shows offline.

Rejected: saving tiles as the counter pans, which leaves parts of the area blank; a PMTiles extract per circle, which needs a build step and hosting; IndexedDB with a MapLibre custom protocol, which needs the style's URLs rewritten; the page telling the worker the active area, a message channel the build-free key makes unnecessary; downloading the whole circle, which can pass 50 MB in a dense city.

## Code layout

- `apps/cbc-manager`: the circle manager, laid out like the phone apps.
  - `src/db`: migrations, one module per concern, `CbcDb` as the single class the UI uses. `pgliteDb.ts` is the only file that knows about IndexedDB and Vite. Tests give `CbcDb` an in-memory PGlite and read the same SQL files from disk.
  - `src/services`: pure functions and network clients.
  - `src/hooks` and `src/components`: state and UI, one component per tab.
- `packages/birding-core`: the birding features with no Christmas Bird Count in them: the eBird client and its cache, nearby lists and suggestions, live location, the base map, install prompts, and the screens built on them, including the menu bar, Help, and About, so they read the same in every app. Each app passes in its name and its own storage keys, because apps on one origin share `localStorage`. The About text is the one exception to the no-CBC rule: it is the author's bio, and the count she compiles is why the apps exist.
- `apps/cbc-scout`: CBC Scout. It adds count areas, the count circle, and the count session to the core. It also imports the circle manager's area link, circle, and map text code through the `@birdspotter/cbc-manager` package, whose `exports` lists only those files, so the database code cannot be imported by package path.
- `apps/birdspotter`: Birdspotter, for any birder. It uses the core alone, with no region and no pinned search: the lists follow the person, with a search radius from its settings. It has no effort tracking, because birders record checklists and effort in eBird. It is a separate app rather than a mode of CBC Scout, so neither carries the other's screens. It is served from the same origin as the others, so the saved eBird key and eBird cache carry over; a separate domain would lose them and need its own DNS and Pages site.

The repo is one npm workspace, so the core changes with its apps in one pull request and needs no release. Lint stops the core from importing an app, stops a phone app from importing the web app's database, and stops Birdspotter from importing anything but the core.

## What would change with a server

- Replace the browser client with a Postgres connection. The migrations and views carry over.
- Add auth and per-compiler row ownership, and encrypt volunteer contact data.
- Move the Audubon proxy server side.
- Replace file backup with database backup.

## Known gaps

- Two browser tabs on the same data are not coordinated.
