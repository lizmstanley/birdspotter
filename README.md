# CBC Circle Manager

A browser-only tool for Christmas Bird Count (CBC) compilers. It tracks volunteers, area assignments, and results for one or more count circles.

I have been the compiler for the Bloomington, MN count since 2020 and wrote this app to run it.

The roster lives in a PostgreSQL database that runs inside the browser ([PGlite](https://pglite.dev)) and is saved to IndexedDB. There is no server. Roster data never leaves the compiler's browser unless the compiler exports it.

## Features

- **My Circles:** keep several circles, each with its own areas, count years, roster, notes, and map boundaries. Add a circle by Audubon code or place search, by importing a KML, KMZ, or GeoJSON file, or by entering coordinates.
- **Audubon circle details:** adding an Audubon circle, or clicking **Refresh from Audubon**, pulls the count date, the publicly listed compiler, and the circle center from `https://cbc.audubon.org/en/join/circles/<CODE>`.
- **Roster and assignments:** reassign counters between areas, see open areas (no confirmed field counter), and track which areas have sent results.
- **Outreach:** reminder and outreach lists with a Copy BCC button. Outreach skips people marked removed, no-show, moved away, deceased, or external contact. It also skips anyone already in the Google Group and any email marked bouncing.
- **Map:** a draggable 15-mile-diameter circle on MapLibre GL, with OpenStreetMap street tiles or Esri satellite tiles. Imported area polygons are shown with hover and click-through to each area.
- **eBird scouting:** hotspots and recent sightings within the circle's radius, using your own eBird API key. The key is stored only in your browser's `localStorage`.
- **Import and export:** import a participant spreadsheet (`.xlsx` or `.csv`) with column mapping, or the participant list exported from your Audubon circle page, which is read with no mapping, export the roster to Excel or CSV, and export or restore a full JSON backup.

## Run it

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. A new browser database starts empty.

To build a static site:

```bash
npm run build
```

Deploy `dist/` to any static host. Each visitor gets their own private database in their own browser.

The Audubon circle page sends no CORS headers, so the browser reaches it through the `/audubon-cbc` proxy in `vite.config.ts`. That proxy runs only under `npm run dev` and `npm run preview`. On a static host, Audubon circle details are not available, and the circle search falls back to Audubon's ArcGIS layer.

Each address (`localhost:5173` for dev, `localhost:4173` for preview) has its own browser database.

Run the unit tests with `npm test`.

## Back up your data

Browser storage can be cleared, and it does not move between computers. Use **Export Backup** after each import or major change. **Restore Backup** replaces the roster of every circle in the backup file, after a confirmation.

The app asks the browser for persistent storage, so the data is not evicted when disk space runs low. This does not protect against clearing site data.

In Chrome and Edge, **Auto-Save** keeps a backup file up to date on disk. Click it once and pick a file. The app rewrites that file after every change. After a browser restart the button shows **Reconnect**. Click it once to allow writing again. Restore the file with **Restore Backup**.

Opening the app on a database from the older single-circle version moves that roster into a circle with code `LEGACY`. Its map starts centered on Bloomington, MN; drag the circle to move it. If the move fails, the old data is left unchanged, and the app shows an error.

## Project structure

```text
cbc-circle-manager/
├── db/
│   └── migrations/
│       ├── 001_initial_schema.sql   # Tables, enums, and indexes, all scoped by circle_code
│       └── 002_views.sql            # Assignments, open areas, reminders, outreach
├── src/
│   ├── db/pgliteDb.ts               # Browser database: setup, upgrades, queries, backup and restore
│   ├── services/
│   │   ├── ebird.ts                 # eBird API v2 client
│   │   ├── audubonCircles.ts        # Circle search (ArcGIS, then OpenStreetMap Nominatim)
│   │   ├── audubonCirclePage.ts     # Count date and compiler from the Audubon circle page
│   │   └── kmlParser.ts             # KML, KMZ, and GeoJSON boundary parser
│   ├── components/                  # Map, area detail, results, importer, dialogs, help
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```
