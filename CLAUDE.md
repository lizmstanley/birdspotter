# CLAUDE.md

One npm workspace: three browser-only apps, a shared birding core, and static site pages. No server. Root `package.json` holds only shared dev tooling. One `vite.config.ts`, `tsconfig.json`, and `eslint.config.js` cover everything. README.md is for users. DESIGN.md has the reasons and the module map.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Circle manager at `localhost:5173/cbc/manager/` |
| `npm run dev:cbc-scout` | CBC Scout at `/cbc/scout/`, port 5173 or next free. A different port is a different origin, so no shared eBird key in dev |
| `npm run dev:birdspotter` | Birdspotter at `/app/`, same port rule |
| `npm run build` | Site pages and all three apps into `dist/` |
| `npm run preview` | Serves `dist/` at `localhost:4173`: `/`, `/app/`, `/cbc/`, `/privacy/`, `/cbc/manager/`, `/cbc/scout/` |
| `npm test` | `node --test` over `packages/*/src`, `apps/*/src`, `site`. `*.integration.test.ts` run real SQL in in-memory PGlite |
| `npm run typecheck` | `tsc -b`, then `tsconfig.tests.json` for tests and `scripts` |
| `npm run lint` | ESLint on `packages`, `apps`, `site`, `scripts` |
| `npm run screenshots` | Builds, then retakes install-sheet pictures in headless Chrome (`google-chrome` or `CHROME_PATH`). Needs network |

CI (`ci.yml`) runs lint, typecheck, test, build on every PR. `pr-title.yml` requires a Conventional Commits prefix (`feat:`, `fix(scope):`).

Releases: `release.yml` runs release-please on push to `main` (`release-please-config.json`, `.release-please-manifest.json`). It keeps one open release PR that bumps the root version and writes `CHANGELOG.md` from squash titles on `main`. Merging it tags `v<version>` and publishes the GitHub release. Never edit `CHANGELOG.md` or the version by hand. The release PR runs no CI (opened with `GITHUB_TOKEN`), so it merges with the ruleset bypass. Needs two repo settings: "Allow GitHub Actions to create and approve pull requests" on, and squash merge title set to the PR title (`squash_merge_commit_title: PR_TITLE`), since `pr-title.yml` checks only the PR title.

## The apps

| App | Path | Served at | Storage |
| --- | --- | --- | --- |
| Circle manager (compiler's web app) | `apps/cbc-manager/` | `cbc/manager/` | PGlite in IndexedDB `idb://cbc-circle-manager-pgdata`; Auto-Save handle in IndexedDB `cbc-circle-manager-autosave` |
| CBC Scout (field counters' phone app) | `apps/cbc-scout/` | `cbc/scout/` | `localStorage`: `cbc_scout_areas`, `cbc_scout_active_area`, `cbc_scout_tracking`, `cbc_scout_settings`, `cbc_scout_session` |
| Birdspotter (any birder's phone app) | `apps/birdspotter/` | `app/` | `localStorage`: `lgb_settings`, `lgb_tracking` |
| Birding core | `packages/birding-core/src/` | imported as `@birdspotter/birding-core/<file>` | keys passed in by each app |
| Site pages | `site/` | `/`, `cbc/`, `privacy/` | none. Plain HTML, relative links, no script, no manifest |

- Phone apps keep manifest, icons, service worker, and screenshots in `apps/<app>/public/`.
- CBC Scout: identity and keys in `scoutIdentity.ts`. Birdspotter: in `appIdentity.ts`.
- Birdspotter has no region, areas, count session, or effort tracking. Its Look here place lives in React state only; the eBird cache still holds it in its request addresses.
- CBC Scout count session (`countSession.ts`): a format change bumps `SESSION_FORMAT_VERSION` and keeps a reader for the old version, so a count in progress survives an update.

## Birding core rules

- Nothing in the core names count circles, count areas, count sessions, the CBC radius, or an app. Only exception: the About text (author bio).
- An app passes in a `BirdingApp` (name, per-app storage keys), a region test, a pinned query, and the search radius around the person when nothing is pinned. eBird fetchers take the radius as a required argument.
- `package.json` exports every file by path (`"./*": "./src/*"`). No index file.
- Help takes app sections as children. `SettingsForm` takes app controls. Privacy page address comes from each app's `BASE_URL`.
- An app may add screens to the menu (`screens.ts`), listed before the core's.
- `CrashBoundary.tsx` wraps every app root in `main.tsx`. It stays inline-styled (the circle manager loads no `birding.css`) and touches no storage.
- Styles live in `birding.css`, classes prefixed `birding-`. Each app sets `--birding-bar-color`.
- A color that differs between light and dark is a custom property on `:root`, with its dark value in the one `@media (prefers-color-scheme: dark)` block per file. Hex values left in rules are the same in both looks. No theme choice.
- Dark map inverts the canvas (`filter: invert(1) hue-rotate(180deg)`), not a dark style. CBC Scout's route swatch takes the same filter.
- A new color needs a WCAG AA pair in `birdingColors.test.ts`, `scoutColors.test.ts`, or `birdspotterColors.test.ts`.

## Import boundaries

- Allowed: CBC Scout imports core and web app. Birdspotter imports core only. Web app imports core. Core imports no app.
- CBC Scout imports web app files by package path, e.g. `@birdspotter/cbc-manager/services/areaLink.ts`. Shared today: `services/areaLink.ts`, `services/cbcCircle.ts`, `services/partyCode.ts`, `components/map/mapLayers.ts`, `components/map/mapText.ts`.
- `apps/cbc-manager/package.json` `exports` lists only those files. A new shared file needs an `exports` entry.
- `eslint.config.js` `no-restricted-imports` enforces:
  - Core: no relative import leaving the package, no other `@birdspotter/` package, no `@electric-sql/pglite` or subpaths.
  - All apps (CBC Scout keeps this block as is): no `@electric-sql/pglite` or subpaths, no path through `src/db`.
  - Birdspotter: its block replaces the apps block. No PGlite, no relative import leaving `apps/birdspotter/`, no `@birdspotter/` package but the core.
  - Circle manager: its block replaces the apps block. May import PGlite and its own `src/db`. No relative path into another app, no `@birdspotter/` package but the core.
- Lint sees only static imports. It misses `import()` and transitive imports. CBC Scout must never pull in `src/db`, PGlite, or a web app component through a service.
- `areaShare.ts`, `importPreview.ts`, `audubonImport.ts`, `rosterSummary.ts` import `src/db` as `import type` only. A runtime import there puts PGlite into CBC Scout's build if Scout ever imports that service.

## Build and deploy

- `npm run build`: `tsc -b`, `vite build --mode site`, `vite build` (manager), `--mode cbc-scout`, `--mode birdspotter`.
- Only the site pass empties `dist/`.
- Each app pass has its own `root` (`apps/<app>/`), `base`, and `outDir` (`dist/cbc/manager/`, `dist/cbc/scout/`, `dist/app/`), copies only its own `public/`, and shares no chunks.
- `pages.yml` on push to `main`: test, build with `GITHUB_PAGES=true` (base `/birdspotter/`), deploy `dist/`. Local dev and preview use `/`.
- `/audubon-cbc` proxy in `vite.config.ts` exists only in dev and preview (no CORS on cbc.audubon.org). On Pages, circle details fall back to ArcGIS data.

## Invariants

- **Base path.**
  - Runtime URLs use `import.meta.env.BASE_URL`. Each app's `BASE_URL` is its own address, not the site's.
  - Hard-coded `/` breaks on Pages.
  - Only exception: the `/audubon-cbc` fetch in `audubonCirclePage.ts`.
- **Share links point at the hosted app.** `CBC_SCOUT_URL`, `BIRDSPOTTER_URL`, and the manager address in `shareApp.ts` are GitHub Pages addresses, even in local dev.
- **Service worker scope.**
  - Each `sw.js` registers with its app's `BASE_URL` as scope. No app sits at the site root or `cbc/`.
  - CBC Scout's worker caches its files network first, and touches only caches prefixed `cbc-scout-`.
  - Activation keeps saved street maps `cbc-scout-map-v1:<area key>`. `offlineMap.ts` writes them, the worker reads them. Both hold the prefix and the vector tile key; change both together.
  - Birdspotter's worker caches its files network first, except `assets/` cache first, and touches only caches prefixed `birdspotter-`.
  - Never remove a fetch handler. Chrome offers install only when one exists.
- **Area link format** (`areaLink.ts`).
  - Payload goes after `#`, never to a server.
  - Shape change bumps `AREA_LINK_FORMAT_VERSION`. Scout rejects unknown versions with `UnsupportedAreaLinkVersionError`.
  - Saved areas are stored as payloads and decoded on start (`savedAreas.ts`). A bump without a reader for the old version wipes every counter's saved areas. Version 1 reader stays.
  - `buildAreaLink` simplifies the outline to fit `QR_MAX_BYTES_MEDIUM`, else throws `AreaLinkTooLargeError`. It never cuts the area note (max `AREA_NOTE_MAX_LENGTH`).
  - Carries only leader name, phone, email, and the area note (`areas.counter_note`, free text anyone with the link can read). Nothing else about people.
  - Scout shows the note as plain text, never a link. `leaderContact.ts` makes `tel:`/`mailto:` only from a plain phone or email.
- **Party code format** (`partyCode.ts`).
  - Carries effort and route positions only. No species counts, point times, or links.
  - `partyCodeLine` simplifies the route to fit `PARTY_CODE_MAX_LENGTH`, and drops it if the coarsest step still does not fit.
  - Route lines pack with `packedLine.ts`, like the area outline.
  - Shape change bumps `PARTY_CODE_FORMAT_VERSION`. Decoder rejects unknown versions with `UnsupportedPartyCodeVersionError`. Version 1 reader stays.
  - Party ID stays the same each time one count is shared.
- **Storage names never change.** `idb://cbc-circle-manager-pgdata`, `cbc-circle-manager-autosave`, every `cbc_` and `lgb_` key, and the backup and Auto-Save file names. A renamed store starts empty.
- **Shared `localStorage`.** All apps share one origin.
  - eBird key is `cbc_ebird_api_key` in every app.
  - eBird cache (`ebirdCache.ts`) uses prefix `cbc_ebird_cache:`. Hotspots keep for the local day, sightings 6 hours max or the caller's max age. On write it drops yesterday's entries once 6 hours old and all older ones.
  - Per-app state goes under keys from the app's `BirdingApp`, never shared.
- **Migrations.**
  - Add a new numbered file in `apps/cbc-manager/db/migrations/`. Never edit a shipped one. `parseMigrationFiles` throws on a numbering gap.
  - `views.sql` runs on every start. Every statement must be safe to rerun.
  - Rows are scoped by `circle_code` with composite foreign keys.
- **Database access.** The UI calls only `CbcDb` (`src/db/cbcDb.ts`). Only `pgliteDb.ts` opens PGlite on IndexedDB.
- **Node type stripping.** `npm test` runs `.ts` directly in Node. In any module a test reaches:
  - Relative and core runtime imports need the `.ts` extension.
  - Type-only imports need `import type`.
  - No TypeScript-only runtime syntax (`enum`, constructor parameter properties).
- **PGlite stays out of pre-bundling.** Keep it in `optimizeDeps.exclude` in `vite.config.ts`. Pre-bundling breaks its WASM.
- **SheetJS comes from its CDN.** `xlsx` is a `cdn.sheetjs.com` tarball URL, because SheetJS no longer publishes to npm and the npm copy has open advisories. npm audit and Dependabot do not track it. Update with `npm install --save <url> -w apps/cbc-manager` after checking the SheetJS changelog.
- **Privacy page** (`site/privacy/index.html`).
  - A change to what Birdspotter or CBC Scout sends off the phone or keeps updates, in the same PR: the page, its "Last changed" date, and the core Help's "What stays on the phone".
  - `site/privacyPage.test.ts` catches only literal outside hosts in phone app folders, the core, and the manager's exported files. It misses transitive imports, MapLibre and OpenFreeMap links, and new data sent to a known host. Check those by hand.
- **Install screenshots.** Retake with `npm run screenshots` when a change visibly alters a screen they show. 1080x1920 PNG, no alpha, `form_factor: "narrow"`. Sample data lives in `scripts/screenshots/sampleData.ts`.
- **No real data in git.** `.gitignore` top block excludes roster spreadsheets and backup JSON. Use made-up people in tests and samples.
