# CBC Circle Manager

CBC Circle Manager is a browser-only tool for Christmas Bird Count (CBC) compilers. It tracks volunteers, area assignments, and results for one or more count circles.

I've been the compiler for the Bloomington, MN count since 2020, and I wrote this app to run it. You can find our count on [Audubon's circle page](https://cbc.audubon.org/en/join/circles/MNBL) and on [our own website](https://www.bloomingtoncbc.org/).

The roster lives in a PostgreSQL database that runs inside your browser ([PGlite](https://pglite.dev)) and is saved to IndexedDB. There's no server. Your roster never leaves your browser unless you export it.

## What it looks like

This is the Bloomington, MN circle. I drew the 26 count areas in Google My Maps and imported them as a KML file. The hotspots and recent sightings came from eBird with my own API key.

The top of the page shows the circle's count date and compiler, how many areas are counted, how many people are counting, which areas still need a field counter, and, from count day on, which areas haven't sent in results. **Feedback** and **Share** are in the top right:

![The top of the page for the Bloomington, MN circle: count date, compiler, and cards for 24 counted areas, 38 active counters, 4 open areas, and awaiting results.](docs/screenshots/overview.jpg)

Hover over an area to see how many people are assigned to it, and click it to open that area:

![The Bloomington, MN circle with 26 imported count areas, eBird hotspots, and recent sightings. Hovering over Area 12 shows 3 participants assigned.](docs/screenshots/map-area-hover.jpg)

Hover over a hotspot to see its all-time species count and latest checklist date:

![A hotspot tooltip for Normandale Community College campus, showing 131 all-time species.](docs/screenshots/map-hotspot.jpg)

Hover over a recent sighting to see the species, count, place, and date, with a link to the checklist:

![A recent sighting tooltip for a Red-breasted Nuthatch, with a link to the eBird checklist.](docs/screenshots/map-sighting.jpg)

## Before you start

- **It's bring your own key (BYOK).** The map's eBird hotspots and recent sightings need your own eBird API key. Everything else works without one, including scouting a new location. See [Set up your eBird key](#set-up-your-ebird-key).
- **It doesn't draw areas.** The app shows the 15-mile circle, but it can't draw your count areas (sectors) on it. If you want area outlines on the map, make them somewhere else and import them as a KML, KMZ, or GeoJSON file. As far as I know, the Audubon site doesn't export area boundaries. Google My Maps does: draw each area as a shape, name it with its area code (for example `12 - Richfield`), and export the map to KML.

## Features

- **My Circles:** keep several circles, each with its own areas, count years, roster, notes, and map boundaries. Add a circle by Audubon code or place search, by importing a KML, KMZ, or GeoJSON file, or by entering coordinates.
- **Audubon circle details:** adding an Audubon circle, or clicking **Refresh from Audubon**, pulls the count date, the publicly listed compiler, and the circle center from `https://cbc.audubon.org/en/join/circles/<CODE>`.
- **Roster and assignments:** reassign counters between areas, see open areas (areas with no confirmed field counter), and track which areas have sent in results.
- **Reminders and outreach:** a list of people on your current list who haven't answered yet this season, with a Copy BCC button. Until you mark a current list, it shows every active person who hasn't answered. Possible Outreach lists people on the Audubon list who aren't on your current list, and people on your current list who also have another email that may be old. Tick **This file is my current list** when you import your mailing list. Outreach shows only active and inactive people.
- **Map:** a draggable 15-mile-diameter circle on an OpenFreeMap street map built from OpenStreetMap data. There is no satellite view, because Esri's World Imagery terms require Esri software or an ArcGIS subscription. Imported area outlines highlight when you hover over them, and clicking one opens that area. **Export Map as KML** downloads the layers turned on in the legend (the circle and its center, the area outlines, and the eBird hotspots and sightings you loaded) as a KML file for Google Earth or Google My Maps.
- **Parties:** an area's page lists its parties for the current season by start time, one per phone or paper report, with each party's date, start and stop times, participants, hours by vehicle, by foot, and feeder watching, and miles by vehicle and by foot. **Add Party** enters one, and each can be edited or removed. **Add Party From CBC Scout**, on the Awaiting Results page that the Awaiting Results card opens, reads a party from the message CBC Scout shares: paste the whole message, check what it read, and save. The party goes into the season whose count window holds its date and into the area the message names. When the message names no area, or one the circle doesn't have, you choose the area; when the date is in no count window the circle has, you choose the season. Pasting the same party again replaces it, and says so before you save. A message for another circle, from a newer CBC Scout, or with no readable party code is refused, and nothing is saved. The page shows the area's parties, participants, hours, and miles summed over them, the way the count sheet asks. Adding a party does not mark the area's results received. Backups keep the parties.
- **Share an area:** on an area's page, **Share Area** makes a link and a QR code that open the area in CBC Scout. They carry the circle, the area outline, the name, phone, and email of the area's leaders, and the area's **Note for counters**, and nothing else about people. Write the note on the area's page, up to 300 characters: where to meet, which feeders counters may visit, gate codes, places to skip. Anyone with the link can read the note. The data sits after the `#` in the link, so it never reaches a server. See [CBC Scout](#cbc-scout).
- **eBird scouting:** hotspots and recent sightings inside the circle, using your eBird API key. Each hotspot and sighting is listed with the count area it falls in. The web app saves results in your browser. It fetches hotspots from eBird at most once a day and sightings at most every 6 hours for the same circle and day range. CBC Scout checks for new sightings more often. See [Settings](#settings).
- **CBC Scout:** a phone app for your field counters. It shows a counter their area, where they are, and what's been seen nearby, and records the party's hours and miles. See [CBC Scout](#cbc-scout).
- **Birdspotter:** a phone app for any birder, with no count to set up. It shows recent sightings and eBird hotspots around you. See [Birdspotter](#birdspotter).
- **Import and export:** import a participant spreadsheet (`.xlsx` or `.csv`) and match its columns, or import the participant list you export from your Audubon circle page, which needs no setup. You can also export the roster to Excel or CSV, and export or restore a full JSON backup.

## Set up your eBird key

In the web app, you set the key once, on the **Help & API Keys** tab. It isn't on the map page, and it isn't per circle: one key works for every circle and for scouting. CBC Scout and Birdspotter ask for the key on their own screens. See [Add an eBird key](#add-an-ebird-key).

1. Sign in to eBird and request a free key at [ebird.org/api/keygen](https://ebird.org/api/keygen). For the intended use, something like "Christmas Bird Count circle scouting" is fine. The key shows up right away.
2. In the app, open the **Help & API Keys** tab.
3. Paste the key into the box under the steps and click **Save Key**.
4. Go to **Map & eBird Scout**, pick how many days back you want, and click **Load Hotspots & Sightings**.

Until a key is saved, **Load Hotspots & Sightings** and the days dropdown are grayed out. Hover over them and they tell you where to add the key. The key is saved only in this browser's `localStorage` and is sent only to eBird. To forget it, click **Remove Key** on the same tab. The hosted copy and a copy you run yourself each need the key saved once, because each address has its own browser storage.

The web app saves each eBird result in this browser: hotspots for the rest of the day, sightings for up to 6 hours. Asking again for the same circle center and day range shows the saved copy instead of calling eBird. A new day, sightings older than 6 hours, a moved pin, or a different day range fetches fresh data.

## CBC Scout

CBC Scout is a phone app for your field counters. It's at https://lizstanley.com/birdspotter/cbc/scout/. It shows a counter their area on a map, where they are, and what's been seen nearby, and it records the party's hours and miles. There's no account to make.

### Install it

Open the address on the phone.

- **iPhone and iPad:** in Safari, tap **Share**, then **Add to Home Screen**. CBC Scout shows these steps at the top of the page.
- **Android:** in Chrome, tap **Install** on the bar at the top of CBC Scout. The bar shows once Chrome offers to install it.

It also works in a plain browser tab. On iPhone, the home screen app keeps its own storage, apart from Safari. If an area link opens in a Safari tab, CBC Scout says so. Open the installed app and paste the same link with **Paste link**.

### Add an eBird key

CBC Scout shows the area, the map, notes, and the count session without an eBird key. Sightings and hotspots need one: until a key is saved, the **Sightings** and **Hotspots** tabs show **Add eBird key**. Get a key as in [Set up your eBird key](#set-up-your-ebird-key), paste it, and tap **Save key**. The key screen links to the eBird request page too.

To change the key later, open the menu at the top and tap **eBird key**. If eBird rejects the key, or the key has a character an eBird key can't have, such as a curly quote, the lists show a **Fix eBird key** button that opens the same screen. The key forms refuse to save such a key.

The menu also has **Help**, how CBC Scout works in plain words, and **About**, who made it and why.

The web app, CBC Scout, and Birdspotter share one saved key, but only in the same browser on the same device. A counter's phone needs the key entered once.

### Send counters their area

In the web app, open an area and click **Share Area**. It makes a link and a QR code. Send the link with **Share Link** or **Copy Link**, or print the QR code or show it on screen for counters in person. To post a link or code in public, such as on your count's web page, tick **Leave out phone numbers**: the link then carries the leaders' names and emails only.

The link carries the area's **Note for counters**, which you write and save on the area's page. CBC Scout shows it under the area's name and leader. Anyone with the link can read the note, so put in it only what you would text to the whole party. A long note makes a dense QR code; when it may be hard to scan, Share Area says so, and the link itself works the same.

The counter loads the area in CBC Scout one of three ways:

- Open the link. CBC Scout opens with the area on the map.
- Open **Your areas** from the menu, tap **Paste link**, paste the link, and tap **Load**. **Paste from clipboard** does both in one tap, where the phone allows it.
- Open **Your areas** from the menu, tap **Scan QR code**, and point the camera at the QR code.

With no area loaded, CBC Scout opens on **Your areas**. A good load or a pick returns to the map.

CBC Scout keeps every area it loads, with one active at a time. **Your areas** lists each one with its name, leaders, and the compiler's note, the active area first. **Make active** switches to another area. **Remove area** takes that area off the phone.

### What it shows

- **Map:** the 15-mile circle and the area's outline. Tap the location button on the map to show where you are. While it's on, the line above the map says whether you're in your area, outside your area, or outside the circle. If you leave it on, it's on again the next time you open CBC Scout.
- **Sightings:** notable sightings, then recent sightings. The lists show once location is on, nearest first. Pick how many days back, from 1 to 30. With an area loaded, they list only places in your area; with a route line instead of a shape, they cover the whole circle, places in it first. With no area, they cover 7.5 miles around you. Each sighting says how long ago it was reported, such as **40 minutes ago** or **yesterday**, and links to its eBird checklist. Notable sightings include reports still waiting for review; one an eBird reviewer has confirmed is marked **Confirmed**.
- **Hotspots:** **Hotspots to visit**, the hotspots in your area (or every hotspot, with no area loaded) ranked by the species reported there in the days picked on Sightings. Tap a hotspot's species count to see which species, each linked to its eBird checklist, with notable ones marked.
- **Directions:** every place shows its distance from you, its direction once it's more than a tenth of a mile away, and a **Directions** link. It opens Apple Maps on iPhone and iPad, and Google Maps everywhere else.
- **Notes:** the tab under the map shows the active area's name, its leaders, and the compiler's note for the area as plain text.
- **Your areas:** in the menu, every saved area with its name and leaders, with their phone and email as tap-to-call and tap-to-email links, and the compiler's note.
- **Start count:** a counter taps **Start count** in CBC Scout, and while it stays open on screen it keeps the screen on, draws the route, and sorts each stretch by speed into travel by vehicle or by foot. The counter can change any stretch's mode, and enters the number of participants in the party and any feeder watching hours. Time in other apps counts toward hours. A break in recording, such as switching apps, shows as a dashed straight line whose distance counts toward the miles. After **Stop count**, **Share totals** sends the party's line of the count sheet as text: area number, participants, one party, hours by vehicle, by foot, and feeder watching, and miles by vehicle and by foot. The last line, **Party code**, holds the same totals as a code, with a party ID that stays the same each time one count is shared. The compiler pastes the message under **Add Party From CBC Scout** in the web app, which adds up the parties for each area. Recording pauses while location is off. The route stays on the phone.
- **If CBC Scout hits a problem:** it shows a short message with a **Reload** button. A count that was running is still running after the reload, with its hours, miles, and route. The time on the message screen shows as a break in the route.

### Settings

Open the menu and tap **Settings**. **Check eBird for new sightings** sets how often the Sightings and Hotspots lists check eBird: every 15 minutes, every half hour, every hour, or every 2 hours. The default is every half hour. Checking less often uses less data and battery. Hotspots change rarely, so they don't follow this setting. CBC Scout uses a copy it saved in the last 6 hours, and fetches them again only for a new search place or key, after a failed fetch, or once the copy is 6 hours old.

### With no signal

CBC Scout saves its own files on the phone, so it opens with no signal once it has opened with a signal since its last update. Open it online once before heading into the area. With no signal it shows the active area, your location, and the count session, which starts, runs, and stops as usual. The street map is blank with no signal unless you saved it: with a signal, open **Your areas** and tap **Save street map** on the active area. CBC Scout downloads the streets, water, and labels over a rectangle around the area's outline at every zoom, shows its progress, and says when it is done or why it stopped. The area's card then shows the date and size of the saved map, and **Remove street map** takes it off. **Remove area** removes its map too. A saved map stays until you remove it. Each download is within OpenFreeMap's offline limits: at most 3,000 tiles and 50 MB, 4 requests at a time. Well beyond the area the map stays blank with no signal. If your compiler sends the area again with an outline that reaches past that rectangle, its saved map is removed; save it again. On a weak signal that doesn't answer, it opens from the saved copy within about 4 seconds, which may be the previous release; the next open with a signal loads the newest one. If the signal drops, the lists keep the eBird data they last loaded, and say when it was fetched and that there is no signal. Closing and reopening the app with no signal shows the same data for the active area. Once the data is 6 hours old, eBird's terms no longer allow it, so it leaves the screen until a signal returns. With no active area, a reopened app usually finds nothing saved, because the search follows your location.

### What stays on the phone

CBC Scout has no database and no server. It keeps these in the phone's browser storage:

- the eBird key
- the saved areas
- the Settings choice
- whether location tracking is on
- the count session and its route
- the saved street maps
- its own files, so it opens with no signal
- copies of recent eBird results

It sends:

- the key, the place to search, and the days back to eBird. The place is the circle's center when an area is loaded, or your location when none is.
- map views to OpenFreeMap, for the map tiles, and the area's map tiles when you tap **Save street map**.

GitHub Pages, which hosts the site, sends CBC Scout's files. eBird, OpenFreeMap, and GitHub each see the phone's IP address. Nothing goes to any other server. The area data sits after the `#` in the link, so it never reaches a server, and CBC Scout removes it from the address bar once it's read. **Directions** and checklist links open Apple Maps, Google Maps, or eBird only when tapped. **Share totals** goes wherever the counter sends it.

The [privacy page](https://lizstanley.com/birdspotter/privacy/) has the full list for CBC Scout and Birdspotter. Each app's Help links to it.

## Birdspotter

Birdspotter is a phone app for any birder. It's at https://lizstanley.com/birdspotter/app/. It shows a map of where you are and lists recent sightings and eBird hotspots around you. It has no count areas, no count sessions, and no hours or miles. Use eBird for checklists. There's no account to make.

Install it the way you install [CBC Scout](#install-it): **Add to Home Screen** in Safari on iPhone and iPad, or **Install** on the bar at the top in Chrome on Android.

Its first screen asks for an eBird API key. Get one as in [Set up your eBird key](#set-up-your-ebird-key). In a browser, and in installed apps on Android, a key saved in the web app or CBC Scout on the same device works here too. On iPhone, each home screen app keeps its own storage, so an installed Birdspotter asks for the key once. To change the key, open the menu at the top and tap **eBird key**.

- **Map:** tap the location button on the map to show where you are. If you leave it on, it's on again the next time you open the app.
- **Sightings:** notable sightings, then recent sightings, nearest first, as in CBC Scout. Pick how many days back, from 1 to 30.
- **Hotspots:** **Hotspots to visit**, the hotspots around you ranked by the species reported there. Tap the species count to see which.
- **Directions:** every place shows its distance and direction from you, and a **Directions** link.
- **Settings:** open the menu and tap **Settings**. **Check eBird for new sightings** works as in CBC Scout. **Search around you** sets how far the lists look: 2, 5, 7.5, 10, 15, or 25 miles. The default is 7.5 miles. The search moves with you once you're half that distance from where it started.

Like CBC Scout, it saves its own files on the phone, so it opens with no signal once it has opened with a signal since its last update. With no signal it shows the map and your location, and the street map is blank. On a weak signal that doesn't answer, it opens from the saved copy within about 4 seconds, which may be the previous release; the next open with a signal loads the newest one. Like CBC Scout, it keeps the last eBird data for up to 6 hours when the signal drops. A reopened app with no signal usually finds nothing saved, because the search follows your location. It keeps the eBird key, its settings, whether location tracking is on, and copies of recent eBird results in the phone's browser storage. It sends the key, your location, and the days back to eBird, and map views to OpenFreeMap. GitHub Pages sends its files. Each of them sees the phone's IP address. The [privacy page](https://lizstanley.com/birdspotter/privacy/) has the full list. Its settings and tracking are its own, apart from CBC Scout's. Its menu has **Help** and **About** as in CBC Scout, and its first screen links to Help.

## Import your roster

You import people on the **Import / Export Participants** tab.

1. Pick the circle in **My Circles**. The import always goes into the circle that's selected.
2. Under **Import Participant Roster**, choose a `.csv`, `.xlsx`, or `.xls` file. Only the first sheet is read.
3. Match the columns. The app guesses each one from the header names, and you can change any guess.
   - **Email** is the only required column. Rows without a valid email are skipped. If the same email shows up again, the later row updates the same person.
   - **Name**, **Area**, **RSVP**, **Counter Type**, and **Notes** are optional.
4. Check the value tables. For RSVP and counter type, the app lists each value it found in your file, like "Yes" or "Maybe", and what it'll be saved as. You can change any of them.
5. If your file has no RSVP column, choose the RSVP for people who are new this season. People already on this season's list keep theirs.
6. If the file is your mailing list, tick **This file is my current list**. Possible Outreach compares the Audubon list against it.
7. Read the preview. It shows the first 10 rows, and it warns you about rows that'll be skipped, emails that appear more than once, and area codes the circle doesn't have yet.
8. Click **Import**.

A column you skip, or a blank Area, keeps what's already saved for this season.

If you import the participant list you export from your Audubon circle page, the app recognizes it and skips the column matching. It adds new people and marks who's on the Audubon list. It never changes the RSVP, counter type, or area you already have for someone.

Not sure how to lay out your file? Under **What columns can I use?** there's a sample `.csv` and `.xlsx` with made-up people you can start from.

## Use it online

The site's home page is https://lizstanley.com/birdspotter/. It leads with Birdspotter and links to the Christmas Bird Count tools at https://lizstanley.com/birdspotter/cbc/ and to the privacy page for the phone apps at https://lizstanley.com/birdspotter/privacy/. The circle manager is hosted at https://lizstanley.com/birdspotter/cbc/manager/. Your data stays in your browser. It isn't sent to GitHub or any server. Each address has its own browser database, so the hosted copy and a copy you run yourself don't share data. Use **Export Backup** to move data between them.

**Refresh from Audubon** works only when you run the app on your own computer, because the Audubon site blocks requests from other sites. Everything else works in the hosted copy.

Every push to `main` runs the tests and redeploys through `.github/workflows/pages.yml`.

## Run it

```bash
npm install
npm run dev
```

Open `http://localhost:5173/cbc/manager/`. A new browser database starts empty.

CBC Scout runs from its own dev server:

```bash
npm run dev:cbc-scout
```

Open the `/cbc/scout/` address it prints. With the web app's dev server also running, CBC Scout gets the next port, a different address, so in dev the two don't share the saved eBird key. The built site serves all three apps from one address, so `npm run preview` and the hosted copy do.

Birdspotter runs the same way, with `npm run dev:birdspotter`, at `/app/`.

To build a static site:

```bash
npm run build
```

It writes the home page to `dist/index.html`, the CBC page to `dist/cbc/index.html`, and each app to the folder it is served from: `dist/app/`, `dist/cbc/manager/`, and `dist/cbc/scout/`. You can deploy `dist/` to any static host. Each visitor gets their own private database in their own browser.

The Audubon circle page sends no CORS headers (the browser refuses to read it from another site), so the app reaches it through the `/audubon-cbc` proxy in `vite.config.ts`. That proxy runs only under `npm run dev` and `npm run preview`. On a static host, Audubon circle details aren't available, and circle search uses Audubon's ArcGIS layer instead.

Each address (`localhost:5173` for dev, `localhost:4173` for preview) has its own browser database. `npm run preview` serves the home page at `/`, Birdspotter at `/app/`, the CBC page at `/cbc/`, the circle manager at `/cbc/manager/`, and CBC Scout at `/cbc/scout/`.

Run the tests with `npm test`. They include integration tests that run the real schema, migrations, import, and backup code in an in-memory PGlite. `npm run lint` and `npm run typecheck` run in CI on every pull request.

Why the app is built this way: [DESIGN.md](DESIGN.md).

## Back up your data

Browser storage can be cleared, and it doesn't move between computers. Use **Export Backup** after each import or big change. **Restore Backup** replaces the roster of every circle in the backup file, after you confirm.

The app asks the browser for persistent storage, so your data isn't evicted when disk space runs low. That doesn't protect you from clearing site data yourself.

In Chrome and Edge, **Auto-Save** keeps a backup file up to date on disk. Click it once and pick a file. The app rewrites that file after every change. After a browser restart, the button shows **Reconnect**. Click it once to allow writing again. To restore from that file, use **Restore Backup**.

## Questions and ideas

If something's confusing, broken, or missing, or you have an idea that would help your count, tell me on [GitHub Discussions](https://github.com/lizmstanley/birdspotter/discussions). It's public, so please don't post volunteer names, emails, or backup files.

## License

The app is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). You can use, change, and share it for any noncommercial purpose. Anyone you share it with must also get the license terms and the `Required Notice:` line from [LICENSE.md](LICENSE.md).

Bird data comes from [eBird.org](https://ebird.org) and is subject to the [eBird API Terms of Use](https://www.birds.cornell.edu/home/ebird-api-terms-of-use/). The app credits eBird.org, with a link, wherever it shows that data.

## Project structure

```text
birdspotter/
├── apps/
│   ├── cbc-manager/                 # The circle manager: its page, code, schema, and favicon (public/)
│   │   ├── db/
│   │   │   ├── migrations/          # Versioned, applied once each, recorded in schema_version
│   │   │   │   ├── 001_initial_schema.sql   # Tables, enums, and indexes, all scoped by circle_code
│   │   │   │   ├── 002_catch_up_unversioned_databases.sql
│   │   │   │   ├── 003_area_results_by_season.sql
│   │   │   │   ├── 004_area_counter_note.sql
│   │   │   │   └── 005_parties.sql
│   │   │   └── views.sql            # Assignments, open areas, reminders, outreach, party totals (re-applied on every start)
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── migrations.ts    # Migration runner and file parsing
│   │   │   │   ├── cbcDb.ts         # Database class the app uses
│   │   │   │   ├── circles.ts, areas.ts, roster.ts, seasons.ts, parties.ts, readModels.ts, backup.ts   # Queries by concern
│   │   │   │   ├── legacySingleCircle.ts    # One-time move from the first single-circle format
│   │   │   │   ├── pgliteDb.ts      # Browser setup: IndexedDB storage and bundled migrations
│   │   │   │   └── *.integration.test.ts    # Real PGlite, in memory
│   │   │   ├── services/            # eBird, Audubon, KML parsing, import checks
│   │   │   ├── hooks/               # App state and actions
│   │   │   ├── components/          # Tabs, dialogs, the map (components/map/), and roster import (components/import/)
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   └── package.json
│   ├── birdspotter/                 # Birdspotter: its page, its code, and its manifest, icons, and service worker (public/), on the birding core only
│   └── cbc-scout/                   # CBC Scout: its page (index.html), its code (src/), and its public/ files
├── site/                            # The home page and the CBC page: plain HTML, no script
├── packages/
│   └── birding-core/                # eBird, nearby lists, location, map, and install code any birding app can use
├── DESIGN.md
├── LICENSE.md
├── package.json
├── tsconfig.json
└── vite.config.ts
```
