import { useState } from 'react';
import { About } from '@birdspotter/birding-core/About.tsx';
import { EBIRD_KEY_REQUEST_URL } from '@birdspotter/birding-core/ebird.ts';
import { CBC_SCOUT_URL, BIRDSPOTTER_URL } from '../services/shareApp.ts';

export const DISCUSSIONS_URL = 'https://github.com/lizmstanley/birdspotter/discussions';

interface Props {
  /** The saved eBird API key, or empty. */
  ebirdApiKey: string;
  /** Saves the key for every circle; an empty string removes it. */
  onSaveEbirdKey: (key: string) => void;
}

export function HelpPage({ ebirdApiKey, onSaveEbirdKey }: Props) {
  const [draftKey, setDraftKey] = useState(ebirdApiKey);
  const isChanged = draftKey.trim() !== ebirdApiKey;

  return (
    <div className="stack">
      <div className="card">
        <h2>API Keys &amp; Setup Guide</h2>
        <p className="muted">
          CBC Circle Manager runs 100% inside your browser with no central server. Only{' '}
          <strong>one free API key</strong> (eBird) is needed to load live hotspots and recent
          sightings.
        </p>

        <h3>1. eBird API Key (Required for Hotspots &amp; Recent Sightings)</h3>
        <ol className="help-steps">
          <li>
            Sign in to your free eBird / Cornell Lab account and open the{' '}
            <a href={EBIRD_KEY_REQUEST_URL} target="_blank" rel="noreferrer">
              eBird API Key Request Page (ebird.org/api/keygen)
            </a>
            .
          </li>
          <li>
            Fill out the brief form (for <em>Project / Intended Use</em>, enter something like{' '}
            <code>Personal Christmas Bird Count circle scouting and hotspot mapping</code>).
          </li>
          <li>
            Cornell Lab issues your personal key immediately. Copy it, paste it into the box below, and
            click <strong>Save Key</strong>. One key works for every circle and for scouting.
          </li>
          <li>
            Your key is saved only in your browser&apos;s <code>localStorage</code> and sent
            directly from your browser to <code>api.ebird.org</code>.
          </li>
          <li>
            This web app saves eBird results in this browser: hotspots for the rest of the day and
            sightings for up to 6 hours, as eBird&apos;s terms allow. CBC Scout checks for new sightings
            more often (see section 4). Bird data comes from{' '}
            <a href="https://ebird.org" target="_blank" rel="noreferrer">eBird.org</a> under the{' '}
            <a href="https://www.birds.cornell.edu/home/ebird-api-terms-of-use/" target="_blank" rel="noreferrer">
              eBird API Terms of Use
            </a>
            .
          </li>
        </ol>

        <div className="ebird-bar">
          <input
            type="password"
            aria-label="Your eBird API key"
            placeholder="Paste your eBird API key"
            autoComplete="off"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={!isChanged || !draftKey.trim()}
            onClick={() => onSaveEbirdKey(draftKey)}
          >
            Save Key
          </button>
          {ebirdApiKey && (
            <button
              type="button"
              title="Forget the key in this browser"
              onClick={() => {
                setDraftKey('');
                onSaveEbirdKey('');
              }}
            >
              Remove Key
            </button>
          )}
          <span className="muted">{ebirdApiKey ? 'A key is saved.' : 'No key saved yet.'}</span>
        </div>
      </div>

      <div className="card">
        <h3>2. Street Map &amp; Audubon Circle Search (No API Keys Needed)</h3>
        <ul className="help-list">
          <li>
            <strong>Street Map (OpenFreeMap):</strong> Uses free{' '}
            <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
              OpenFreeMap
            </a>{' '}
            vector tiles built from OpenStreetMap data, with no key or registration. Satellite imagery
            is not offered, because Esri&apos;s World Imagery terms require Esri software or an ArcGIS subscription.
          </li>
          <li>
            <strong>Audubon Circle Lookup:</strong> Searches Audubon&apos;s public ArcGIS CBC layer by
            circle code (e.g., <code>MNBL</code>) or name (e.g., <code>Bloomington</code>). The count
            date and compiler come from the circle&apos;s Audubon page. That needs the app&apos;s own
            server (<code>npm run dev</code> or <code>npm run preview</code>). For official compiler
            registration details, visit{' '}
            <a href="https://cbc.audubon.org/en/join" target="_blank" rel="noreferrer">
              cbc.audubon.org/en/join
            </a>
            .
          </li>
        </ul>
      </div>

      <div className="card">
        <h3>3. Privacy, Local Storage &amp; Backups</h3>
        <ul className="help-list">
          <li>
            <strong>Zero server storage:</strong> Your volunteer roster, notes, and favorite
            circles are stored in a local PostgreSQL database (PGlite) inside your browser&apos;s
            IndexedDB.
          </li>
          <li>
            <strong>Back up regularly:</strong> Because browser data can be cleared if you wipe site
            storage or switch laptops, use <strong>Export Backup</strong> in the top bar after
            importing or updating your roster.
          </li>
        </ul>
      </div>

      <div className="card">
        <h3>4. CBC Scout for Field Counters</h3>
        <p>
          <a href={CBC_SCOUT_URL} target="_blank" rel="noreferrer">
            CBC Scout
          </a>{' '}
          is a phone app for your field counters. It shows a counter their area on a map, where they are,
          and what&apos;s been seen nearby, and it records the party&apos;s hours and miles.
        </p>
        <ul className="help-list">
          <li>
            <strong>Install:</strong> open <code>{CBC_SCOUT_URL}</code> on the phone. On iPhone and
            iPad, in Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. On
            Android, in Chrome, tap <strong>Install</strong> on the bar at the top of CBC Scout, once
            Chrome offers it. It also works in a plain browser tab. On iPhone, the home screen app keeps its
            own storage, apart from Safari.
          </li>
          <li>
            <strong>eBird key:</strong> CBC Scout asks for a key on its first screen. Get one as in
            section 1, paste it, and tap <strong>Save key</strong>. To change it later, open the menu and
            tap <strong>eBird key</strong>. The web app, CBC Scout, and Birdspotter share one saved
            key, but only in the same browser on the same device, so a counter&apos;s phone needs it entered
            once.
          </li>
          <li>
            <strong>Send an area:</strong> open an area and click <strong>Share Area</strong>. Send the
            link, or print or show its QR code. The counter opens the link, or on the{' '}
            <strong>Your area</strong> tab taps <strong>Paste link</strong> or{' '}
            <strong>Scan area code</strong>. CBC Scout keeps every area it loads, one active at a time.
          </li>
          <li>
            <strong>Map:</strong> the circle and the area&apos;s outline. Tap the location button to show
            where you are and whether you&apos;re in your area, outside it, or outside the circle.
          </li>
          <li>
            <strong>Nearby:</strong> notable sightings, recent sightings, and eBird hotspots, those in your
            area first, then nearest first. They show once location is on. Each place has its distance,
            its direction past a tenth of a mile, and a{' '}
            <strong>Directions</strong> link to Apple Maps on iPhone and iPad, or Google Maps elsewhere.
            Notable sightings include reports still waiting for review. One an eBird reviewer has confirmed
            is marked <strong>Confirmed</strong>.
          </li>
          <li>
            <strong>Suggestions:</strong> <strong>Hotspots to visit</strong>, ranked by species last
            reported there. With an area loaded whose outline is a shape, not a route line, it also shows{' '}
            <strong>Birds to look for</strong>, species whose latest report is outside your area.
          </li>
          <li>
            <strong>Party hours and miles:</strong> <strong>Start count</strong> records the route and
            sorts each stretch into travel by vehicle or by foot. After <strong>Stop count</strong>,{' '}
            <strong>Share totals</strong> sends the party&apos;s line of the count sheet as text.
          </li>
          <li>
            <strong>Settings:</strong> in the menu, choose how often to check eBird for new sightings:
            every 15 minutes, half hour, hour, or 2 hours. Hotspots don&apos;t follow this setting: CBC
            Scout uses a copy saved in the last 6 hours.
          </li>
          <li>
            <strong>Needs a signal:</strong> CBC Scout needs a signal to open, to draw the map, and to
            check eBird. With no signal, the lists show the eBird data last loaded for the active area,
            with the time it was fetched, until it is 6 hours old, as eBird&apos;s terms allow. Older data
            is not shown.
          </li>
          <li>
            <strong>Privacy:</strong> the phone keeps the eBird key, saved areas, settings, whether
            location tracking is on, the count session and its route, and the day&apos;s eBird results.
            CBC Scout sends the key, the place to search, and the days back to eBird. The place is the
            circle&apos;s center when an area is loaded, or your location when none is. It sends map views
            to OpenFreeMap. Nothing goes to any other server. The area data sits after the{' '}
            <code>#</code> in the link, so it never reaches a server.
          </li>
        </ul>
      </div>

      <div className="card">
        <h3>5. Birdspotter for Any Birder</h3>
        <p>
          <a href={BIRDSPOTTER_URL} target="_blank" rel="noreferrer">
            Birdspotter
          </a>{' '}
          is a phone app for any birder, with no count to set up. It shows a map of where you are and lists
          recent sightings, notable sightings, and eBird hotspots around you, each with its distance,
          direction, and a <strong>Directions</strong> link. <strong>Suggestions</strong> lists hotspots
          worth a stop. It has no areas, count sessions, or hours and miles. Install it from{' '}
          <code>{BIRDSPOTTER_URL}</code> the same way as CBC Scout. In <strong>Settings</strong>, choose
          how often to check eBird and how far around you to search, from 2 to 25 miles. Its settings are
          its own, apart from CBC Scout&apos;s.
        </p>
      </div>

      <div className="card">
        <h3>6. Questions, Ideas &amp; Feedback</h3>
        <p>
          Something confusing, broken, or missing? Have an idea that would help your count? Tell me on{' '}
          <a href={DISCUSSIONS_URL} target="_blank" rel="noreferrer">
            GitHub Discussions
          </a>
          . You need a free GitHub account to post. Please don&apos;t post volunteer names, emails, or backup
          files there: it&apos;s public.
        </p>
      </div>

      <div className="card">
        <h3>7. About</h3>
        <About />
      </div>
    </div>
  );
}
