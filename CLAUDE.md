# CLAUDE.md

Three browser-only apps and a shared birding core live in one npm workspace. The root `package.json` is the web app and the workspace root; `packages/birding-core`, `apps/cbc-scout`, and `apps/lets-go-birding` are its workspaces. One `vite.config.ts`, `tsconfig.json`, and `eslint.config.js` cover them all. There is no server. README.md covers features for users; DESIGN.md covers why the app is built this way.

## The apps and the core

- **Web app** (`index.html`, `src/`): the tool for a count's compiler (the person who runs a Christmas Bird Count circle). React, with a PGlite (Postgres in WASM) database stored in IndexedDB at `idb://cbc-circle-manager-pgdata`.
- **CBC Scout** (`apps/cbc-scout/index.html`, `apps/cbc-scout/src/`): an installable phone app for field counters. It loads areas from links or QR codes made in the web app's Share Area panel and keeps them, one active at a time, and records a party's hours and miles in a count session. No database: saved areas live in `localStorage` (`cbc_scout_areas`, `cbc_scout_active_area`), the tracking flag in `cbc_scout_tracking`, the menu's Settings screen in `cbc_scout_settings`, and the count session in `cbc_scout_session` (`countSession.ts`; once it ships, a format change bumps `SESSION_FORMAT_VERSION` and keeps a reader for the older version, so a count in progress survives an update). Its manifest, icons, and service worker are in `public/cbc-scout/`. `scoutIdentity.ts` gives the core its name and its tracking and settings keys.
- **Let's Go Birding** (`apps/lets-go-birding/index.html`, `apps/lets-go-birding/src/`): an installable phone app for any birder. It uses the core alone, with no region and no pinned query, so the lists follow the person. No areas, no count session, no effort tracking. Its settings live in `lgb_settings`, including the search radius only this app shows, and its tracking flag in `lgb_tracking` (`appIdentity.ts`). Its manifest, icons, and service worker are in `public/lets-go-birding/`; theme color `#4d7c0f`.
- **Birding core** (`packages/birding-core/src/`, imported as `@birdspotter/birding-core/<file>`): the birding features with no Christmas Bird Count in them. The eBird client and its cache, the saved eBird key, nearby lists with their refresh timing, suggestions, directions, live location, screen wake lock, install prompts, the base map (`BirdingMap.tsx`), and the screens built on them (`NearbyPanel`, `SuggestionsPanel`, `SettingsForm`, `EbirdKeyForm`, `InstallBanner`). Styles are in `birding.css`, classes prefixed `birding-`. Nothing in it names count circles, count areas, count sessions, the CBC radius, or an app. An app passes in its name and per-app storage keys as a `BirdingApp`, a region test for "is this place in my region", and a pinned query for a fixed search, and the search radius around the person when nothing is pinned; the eBird fetchers take the radius as a required argument. The package exports every file under `src/` by path (`"./*": "./src/*"`), with no index.

`npm run build` runs `tsc -b`, then `vite build` for the web app, then `vite build --mode cbc-scout`, then `vite build --mode lets-go-birding`. Each phone app pass is rooted at `apps/`, so `apps/<mode>/index.html` builds to `dist/<mode>/index.html`. It sets `emptyOutDir: false`, puts its own hashed chunks in `dist/assets/` beside the web app's, and copies no `public/` files, since the first pass does. No two apps share a chunk.

## Where things live

- `db/migrations/NNN_name.sql`: schema. Each circle's rows are scoped by `circle_code`, with composite foreign keys so a row cannot point at another circle's area.
- `db/views.sql`: business rules as views (`v_open_areas`, `v_needs_reminder`, `v_possible_outreach`, `v_current_assignments`). Re-applied on every start.
- `src/db/cbcDb.ts`: `CbcDb`, the only database class the UI calls (as `LocalCbcDb` in the browser). Queries are split by concern into `circles.ts`, `areas.ts`, `roster.ts`, `seasons.ts`, `readModels.ts`, `backup.ts`.
- `src/db/pgliteDb.ts`: `LocalCbcDb`, the only file that opens PGlite on IndexedDB. `src/services/autoSave.ts` keeps the Auto-Save file handle in a separate IndexedDB database, `cbc-circle-manager-autosave`. `browserMigrations.ts` bundles the SQL files with `import.meta.glob`; `testing/testDb.ts` reads the same files from disk for tests.
- `src/db/migrations.ts`: runner. All pending migrations, their `schema_version` rows, and `views.sql` run in one transaction. A database newer than the app throws `SchemaTooNewError`.
- `src/db/legacySingleCircle.ts`: moves the pre-multi-circle format into a circle coded `LEGACY`.
- `packages/birding-core/src/ebird.ts`: the eBird client, with a `localStorage` cache in `ebirdCache.ts` that keeps hotspots for the local day and sightings for 6 hours at most, or less when the caller passes a maximum age, as CBC Scout does.
- `src/services/`: logic, network clients, and browser storage helpers. Audubon circle search (`audubonCircles.ts`, ArcGIS) and circle page scraping (`audubonCirclePage.ts`), KML/KMZ/GeoJSON parsing, roster import checks, seasons and count dates, and the area link format (`areaLink.ts`).
- `src/hooks/`: web app state and actions. `src/components/`: `TabContent.tsx` maps each `Tab` in `src/tabs.ts` to its component; the map is `CircleMap.tsx` with its parts in `components/map/`, and roster import is `SpreadsheetImporter.tsx` with its parts in `components/import/`.
- `apps/cbc-scout/src/areaStartup.ts`: reads an area link from the address before React renders, then strips it from the address bar.
- `apps/cbc-scout/src/areaLinkText.ts`: finds the payload in pasted text or a scanned QR code.
- `apps/cbc-scout/src/areaRegion.ts`: the count circle as the pinned query, and the area test that puts places in the area first.
- `apps/cbc-scout/src/leaderContact.ts`: link text is untrusted, so only a plain phone number or email becomes a `tel:` or `mailto:` link.
- `packages/birding-core/src/installPrompt.ts`, `installOffer.ts`: Chrome's install prompt and the iOS share-sheet steps.

## Sharing code

CBC Scout imports from the core and from the web app; Let's Go Birding imports only from the core; the web app imports from the core; the core imports from no app. CBC Scout imports these CBC files from the web app:

- `src/services/areaLink.ts`, `cbcCircle.ts`
- `src/components/map/mapLayers.ts` (MapLibre only, no React), `mapText.ts`

ESLint's `no-restricted-imports` in `eslint.config.js` enforces the direction. The core fails lint on a relative import that leaves the package, on another `@birdspotter/` package, and on `@electric-sql/pglite` or any of its subpaths. An app fails on `@electric-sql/pglite` and its subpaths and on any path through `src/db`. Let's Go Birding also fails on a relative import that leaves `apps/lets-go-birding/` and on any `@birdspotter/` package but the core. The web app fails on an import from `apps/`.

Lint sees only static imports, not `import()` and not what an imported file imports in turn. CBC Scout must never pull in `src/db`, `@electric-sql/pglite`, or a web app component through a service either. `areaShare.ts`, `importPreview.ts`, `audubonImport.ts`, and `rosterSummary.ts` import from `src/db`. Those imports are `import type` today, so they add nothing to a bundle. A runtime import there would put PGlite into CBC Scout's build if CBC Scout ever imports that service.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Web app dev server at `localhost:5173` |
| `npm run dev:cbc-scout` | CBC Scout dev server at `/cbc-scout/`, on port 5173 or the next free one. With the web app's dev server running it gets another port, a different origin, so the two do not share the eBird key in dev |
| `npm run dev:lets-go-birding` | Let's Go Birding dev server at `/lets-go-birding/`, on port 5173 or the next free one, as with CBC Scout |
| `npm run build` | All three apps into `dist/` |
| `npm run preview` | Serves `dist/` at `localhost:4173`, CBC Scout at `/cbc-scout/`, Let's Go Birding at `/lets-go-birding/` |
| `npm test` | `node --test` over `src`, `packages/*/src`, and `apps/*/src`; `*.integration.test.ts` run real SQL in in-memory PGlite |
| `npm run typecheck` | `tsc -b` for app code, then `tsconfig.tests.json` for tests |
| `npm run lint` | ESLint on `src`, `packages`, and `apps` |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, and build on every pull request. `pr-title.yml` rejects a PR title without a Conventional Commits prefix such as `feat:` or `fix(scope):`.

## Deploy

`.github/workflows/pages.yml` runs on push to `main`: test, then build with `GITHUB_PAGES=true`, then deploy `dist/` to GitHub Pages. That variable sets Vite's `base` to `/birdspotter/`, the repo name; local dev and preview use `/`.

The `/audubon-cbc` proxy in `vite.config.ts` exists only under `dev` and `preview`, because cbc.audubon.org sends no CORS headers. On Pages, circle details fall back to the ArcGIS search data.

## Invariants

- **Base path.** URLs built at runtime use `import.meta.env.BASE_URL`, as in `AppHeader.tsx` and `apps/cbc-scout/src/main.tsx`. A hard-coded `/` works locally and breaks on Pages. The one exception is the `/audubon-cbc` fetch in `audubonCirclePage.ts`, which targets the dev and preview proxy.
- **Share links point at the hosted app.** `CBC_SCOUT_URL` in `src/services/shareApp.ts` is the GitHub Pages address, even when the web app runs locally, so a link sent to a counter's phone always opens.
- **Service worker scope.** Each phone app's `sw.js` is registered with its own folder as scope, `<base>cbc-scout/` or `<base>lets-go-birding/`, so it never controls another app. It does no caching. Its fetch handler exists because Chrome offers install only when one does; do not remove it.
- **Area link format.** The payload goes after `#` so it never reaches a server. Changing its shape means bumping `AREA_LINK_FORMAT_VERSION` in `areaLink.ts`; CBC Scout rejects other versions with `UnsupportedAreaLinkVersionError`. Saved areas are stored as payloads and decoded again on start (`savedAreas.ts`), so a bump without a reader for the old version removes every counter's saved areas. `buildAreaLink` simplifies the outline until the link fits `QR_MAX_BYTES_MEDIUM`, else throws `AreaLinkTooLargeError`. The link carries leader name, phone, and email, and nothing else about people.
- **Storage names keep the old repo name.** `idb://cbc-circle-manager-pgdata`, `cbc-circle-manager-autosave`, every `cbc_` `localStorage` key, and the backup and Auto-Save download file names stay as they are. Browser storage belongs to the origin, so the saved data survives a path change, but a renamed store starts empty.
- **Shared `localStorage`.** All apps run on one origin. The eBird key is `cbc_ebird_api_key` in all of them, so saving it in one sets it for the others. The eBird cache uses prefix `cbc_ebird_cache:` and drops earlier days' entries on write. Per-app state, such as the tracking flag and settings, goes under keys the app passes in its `BirdingApp`, so two apps never share it.
- **Migrations.** Add a new numbered file; never edit one that has shipped. `parseMigrationFiles` throws on a gap in numbering. `views.sql` runs on every start, so each statement must be safe to rerun.
- **Node type stripping.** `npm test` runs `.ts` files directly in Node, with no build. Node strips types only outside `node_modules`; a core import resolves through the workspace symlink to `packages/birding-core/src/`, so it works. In any module a test reaches, relative and core runtime imports need the `.ts` extension, type-only imports need `import type`, and TypeScript-only runtime syntax (`enum`, constructor parameter properties) fails.
- **PGlite stays out of pre-bundling.** `optimizeDeps.exclude` in `vite.config.ts` keeps it out; pre-bundling breaks its WASM loading.
- **No real data in git.** The top block of `.gitignore` excludes roster spreadsheets and backup JSON. Use made-up people in tests and samples.
