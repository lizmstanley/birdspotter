# CLAUDE.md

Two browser-only apps share one `package.json`, `vite.config.ts`, and `tsconfig.json`. There is no server. README.md covers features for users; DESIGN.md covers why the app is built this way.

## The two apps

- **Web app** (`index.html`, `src/`): the tool for a count's compiler (the person who runs a Christmas Bird Count circle). React, with a PGlite (Postgres in WASM) database stored in IndexedDB at `idb://cbc-circle-manager-pgdata`.
- **Circle Scout** (`circle-scout/index.html`, `circle-scout/src/`): an installable phone app for field counters. It loads areas from links or QR codes made in the web app's Share Area panel and keeps them, one active at a time. No database: saved areas live in `localStorage` (`cbc_scout_areas`, `cbc_scout_active_area`). Its manifest, icons, and service worker are in `public/circle-scout/`.

`npm run build` runs `tsc -b`, then `vite build` for the web app, then `vite build --mode circle-scout`. The second pass sets `emptyOutDir: false`, writes `dist/circle-scout/index.html`, and puts its own hashed chunks in `dist/assets/` beside the web app's. The two share no chunks.

## Where things live

- `db/migrations/NNN_name.sql`: schema. Each circle's rows are scoped by `circle_code`, with composite foreign keys so a row cannot point at another circle's area.
- `db/views.sql`: business rules as views (`v_open_areas`, `v_needs_reminder`, `v_possible_outreach`, `v_current_assignments`). Re-applied on every start.
- `src/db/cbcDb.ts`: `CbcDb`, the only database class the UI calls (as `LocalCbcDb` in the browser). Queries are split by concern into `circles.ts`, `areas.ts`, `roster.ts`, `seasons.ts`, `readModels.ts`, `backup.ts`.
- `src/db/pgliteDb.ts`: `LocalCbcDb`, the only file that opens PGlite on IndexedDB. `src/services/autoSave.ts` keeps the Auto-Save file handle in a separate IndexedDB database, `cbc-circle-manager-autosave`. `browserMigrations.ts` bundles the SQL files with `import.meta.glob`; `testing/testDb.ts` reads the same files from disk for tests.
- `src/db/migrations.ts`: runner. All pending migrations, their `schema_version` rows, and `views.sql` run in one transaction. A database newer than the app throws `SchemaTooNewError`.
- `src/db/legacySingleCircle.ts`: moves the pre-multi-circle format into a circle coded `LEGACY`.
- `src/services/`: logic, network clients, and browser storage helpers. eBird (`ebird.ts`, with a `localStorage` cache in `ebirdCache.ts` kept for the local day, or less when the caller passes a maximum age, as Circle Scout does), Audubon circle search (`audubonCircles.ts`, ArcGIS) and circle page scraping (`audubonCirclePage.ts`), KML/KMZ/GeoJSON parsing, roster import checks, seasons and count dates, and the area link format (`areaLink.ts`).
- `src/hooks/`: web app state and actions. `src/components/`: `TabContent.tsx` maps each `Tab` in `src/tabs.ts` to its component; the map is `CircleMap.tsx` with its parts in `components/map/`, and roster import is `SpreadsheetImporter.tsx` with its parts in `components/import/`.
- `circle-scout/src/areaStartup.ts`: reads an area link from the address before React renders, then strips it from the address bar.
- `circle-scout/src/areaLinkText.ts`: finds the payload in pasted text or a scanned QR code.
- `circle-scout/src/leaderContact.ts`: link text is untrusted, so only a plain phone number or email becomes a `tel:` or `mailto:` link.
- `circle-scout/src/installPrompt.ts`, `installOffer.ts`: Chrome's install prompt and the iOS share-sheet steps.

## Sharing code

Circle Scout imports from the web app, never the reverse. Today it imports:

- `src/services/areaLink.ts`, `autoSave.ts`, `cbcCircle.ts`, `describeError.ts`, `ebird.ts`, `errors.ts`
- `src/components/map/basemap.ts`, `mapLayers.ts` (MapLibre only, no React), `mapText.ts`
- `src/hooks/useEbirdKey.ts`, `useLatest.ts` (depend only on `react`)

It must never pull in `src/db`, `@electric-sql/pglite`, or a web app component, directly or through a service. `areaShare.ts`, `importPreview.ts`, `audubonImport.ts`, and `rosterSummary.ts` import from `src/db`. Those imports are `import type` today, so they add nothing to a bundle. A runtime import there would put PGlite into Circle Scout's build if Circle Scout ever imports that service. No lint rule checks this.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server at `localhost:5173`; Circle Scout at `/circle-scout/` |
| `npm run build` | Both apps into `dist/` |
| `npm run preview` | Serves `dist/` at `localhost:4173` |
| `npm test` | `node --test` over `src/**/*.test.ts` and `circle-scout/src/**/*.test.ts`; `*.integration.test.ts` run real SQL in in-memory PGlite |
| `npm run typecheck` | `tsc -b` for app code, then `tsconfig.tests.json` for tests |
| `npm run lint` | ESLint on `src` and `circle-scout` |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, and build on every pull request. `pr-title.yml` rejects a PR title without a Conventional Commits prefix such as `feat:` or `fix(scope):`.

## Deploy

`.github/workflows/pages.yml` runs on push to `main`: test, then build with `GITHUB_PAGES=true`, then deploy `dist/` to GitHub Pages. That variable sets Vite's `base` to `/cbc-circle-manager/`; local dev and preview use `/`.

The `/audubon-cbc` proxy in `vite.config.ts` exists only under `dev` and `preview`, because cbc.audubon.org sends no CORS headers. On Pages, circle details fall back to the ArcGIS search data.

## Invariants

- **Base path.** URLs built at runtime use `import.meta.env.BASE_URL`, as in `AppHeader.tsx` and `circle-scout/src/main.tsx`. A hard-coded `/` works locally and breaks on Pages. The one exception is the `/audubon-cbc` fetch in `audubonCirclePage.ts`, which targets the dev and preview proxy.
- **Share links point at the hosted app.** `CIRCLE_SCOUT_URL` in `src/services/shareApp.ts` is the GitHub Pages address, even when the web app runs locally, so a link sent to a counter's phone always opens.
- **Service worker scope.** `sw.js` is registered with scope `<base>circle-scout/`, so it never controls the web app. It does no caching. Its fetch handler exists because Chrome offers install only when one does; do not remove it.
- **Area link format.** The payload goes after `#` so it never reaches a server. Changing its shape means bumping `AREA_LINK_FORMAT_VERSION` in `areaLink.ts`; Circle Scout rejects other versions with `UnsupportedAreaLinkVersionError`. Saved areas are stored as payloads and decoded again on start (`savedAreas.ts`), so a bump without a reader for the old version removes every counter's saved areas. `buildAreaLink` simplifies the outline until the link fits `QR_MAX_BYTES_MEDIUM`, else throws `AreaLinkTooLargeError`. The link carries leader name, phone, and email, and nothing else about people.
- **Shared `localStorage`.** Both apps run on one origin. The eBird key is `cbc_ebird_api_key` in both, so saving it in one sets it for the other. The eBird cache uses prefix `cbc_ebird_cache:` and drops earlier days' entries on write.
- **Migrations.** Add a new numbered file; never edit one that has shipped. `parseMigrationFiles` throws on a gap in numbering. `views.sql` runs on every start, so each statement must be safe to rerun.
- **Node type stripping.** `npm test` runs `.ts` files directly in Node, with no build. In any module a test reaches, relative runtime imports need the `.ts` extension, type-only imports need `import type`, and TypeScript-only runtime syntax (`enum`, constructor parameter properties) fails.
- **PGlite stays out of pre-bundling.** `optimizeDeps.exclude` in `vite.config.ts` keeps it out; pre-bundling breaks its WASM loading.
- **No real data in git.** The top block of `.gitignore` excludes roster spreadsheets and backup JSON. Use made-up people in tests and samples.
