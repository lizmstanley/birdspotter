import type { ReactNode } from 'react';
import type { DistanceUnit } from './distanceUnit.ts';
import { EBIRD_KEY_REQUEST_URL } from './ebird.ts';

interface HelpProps {
  readonly appName: string;
  /** The site's privacy page, which sits outside every app's folder. */
  readonly privacyUrl: string;
  readonly distanceUnit: DistanceUnit;
  /** The app's own sections, after the shared ones. */
  readonly children?: ReactNode;
}

// Each matches DIRECTION_MIN_MILES in nearby.ts.
const DIRECTION_MIN_TEXT: Readonly<Record<DistanceUnit, string>> = {
  mi: 'a tenth of a mile',
  km: '160 meters',
};

export function Help({ appName, privacyUrl, distanceUnit, children }: HelpProps) {
  return (
    <div className="birding-help">
      <h2>What the lists show</h2>
      <p>
        <strong>Sightings</strong> lists notable sightings, then recent sightings, nearest first.
        Pick how many days back, from 1 to 30. {appName} keeps that choice until you change it. Notable sightings
        include reports still waiting for review. One an eBird reviewer has confirmed is marked{' '}
        <strong>Confirmed</strong>. Each sighting says how long ago it was reported and links to its eBird checklist. To
        find one bird, type part of its name in <strong>Find a species</strong>, such as &quot;nuth&quot; or
        &quot;coopers&quot;. Case, spaces, and punctuation don&apos;t matter. Clear the box to see every sighting again.
      </p>
      <p>
        A sighting shows the species&apos; latest report. Tap <strong>Every place reported</strong> under it to see
        each place it was reported in those days, nearest first, with the latest report there. For a notable species,
        that is every place with a notable report. For any other species, {appName} asks eBird when you open it, so it
        needs a signal, unless you opened that species in the last 6 hours.
      </p>
      <p>
        <strong>Hotspots</strong> lists <strong>Hotspots to visit</strong>, ranked by the species reported there.
        Tap a hotspot&apos;s species count to see which species, each linked to its eBird checklist.
      </p>
      <p>
        Every place shows its distance from you, its direction once it&apos;s more than{' '}
        {DIRECTION_MIN_TEXT[distanceUnit]} away, and
        a <strong>Directions</strong> link. It opens Apple Maps on iPhone and iPad, and Google Maps everywhere else.
      </p>

      <h2>What the map shows</h2>
      <p>
        Once location is on, the map shows a dot for each place in the lists: green for a hotspot, blue for a place
        with sightings, and a larger amber dot with a dark ring for a place with a notable sighting. Close places
        join into one larger gray dot until you zoom in. Tap it to zoom in. It is amber when it holds a notable place.
      </p>
      <p>
        Tap a place to see its name, the notable species there, how many other species were reported, its distance
        and direction, and a <strong>Directions</strong> link. The dots stay with no signal for as long as the lists
        keep their data.
      </p>

      <h2>The eBird key</h2>
      <p>
        {appName} uses your own free eBird API key. Sign in to eBird and request one on the{' '}
        <a href={EBIRD_KEY_REQUEST_URL} target="_blank" rel="noreferrer">
          eBird API key request page
        </a>
        . It shows up right away. Paste it where {appName} asks for it and tap <strong>Save key</strong>.
      </p>
      <p>
        To change it later, open the menu and tap <strong>eBird key</strong>. If eBird rejects the key, the lists
        show a <strong>Fix eBird key</strong> button that opens the same screen. Apps from this site share one saved
        key in the same browser. On iPhone, each home screen app keeps its own, so enter it once in each.
      </p>

      <h2>Location</h2>
      <p>
        Tap the location button on the map to show where you are. The lists show once location is on. If you leave it
        on, it&apos;s on again the next time you open {appName}. If the phone blocks location, {appName} says how to
        allow it.
      </p>

      <h2>No signal</h2>
      <p>
        {appName} opens with no signal once it has opened with a signal since its last update. It needs a signal to
        check eBird.
        If the signal drops, the lists keep the eBird data they last loaded and say when it was fetched. Once that
        data is 6 hours old, eBird&apos;s terms no longer allow showing it, so it leaves the screen until a signal
        returns.
      </p>

      <h2>Install it</h2>
      <p>
        On iPhone and iPad, in Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. On
        Android, in Chrome, tap <strong>Install</strong> on the bar at the top, once Chrome offers it. {appName} also
        works in a plain browser tab.
      </p>

      <h2>What stays on the phone</h2>
      <p>
        {appName} has no account and no server of its own. The phone keeps the eBird key, your settings and days
        back, whether location is on, {appName}&apos;s own files, and copies of recent eBird results. {appName} sends
        the key, the place to search, the days back, and any species whose places you open to eBird, and map views to
        OpenFreeMap for the map. GitHub, which hosts the site, sends {appName}&apos;s files. Each of them sees your
        phone&apos;s IP address. Nothing goes to any other server. <strong>Directions</strong> and checklist links open
        Apple Maps, Google Maps, or eBird only when tapped.
      </p>
      <p>
        <a href={privacyUrl} target="_blank" rel="noreferrer">
          Privacy: what the phone apps send and keep
        </a>
      </p>

      {children}
    </div>
  );
}
