import type { ReactNode } from 'react';
import { EBIRD_KEY_REQUEST_URL } from './ebird.ts';

interface HelpProps {
  readonly appName: string;
  /** The app's own sections, after the shared ones. */
  readonly children?: ReactNode;
}

export function Help({ appName, children }: HelpProps) {
  return (
    <div className="birding-help">
      <h2>What the lists show</h2>
      <p>
        <strong>Nearby</strong> lists notable sightings, then recent sightings, then eBird hotspots, nearest first.
        Pick how many days back, from 1 to 30. Notable sightings include reports still waiting for review. One an
        eBird reviewer has confirmed is marked <strong>Confirmed</strong>. Each sighting links to its eBird checklist.
      </p>
      <p>
        <strong>Suggestions</strong> lists <strong>Hotspots to visit</strong>, ranked by the species last reported
        there.
      </p>
      <p>
        Every place shows its distance from you, its direction once it&apos;s more than a tenth of a mile away, and
        a <strong>Directions</strong> link. It opens Apple Maps on iPhone and iPad, and Google Maps everywhere else.
      </p>

      <h2>The eBird key</h2>
      <p>
        {appName} uses your own free eBird API key. Sign in to eBird and request one on the{' '}
        <a href={EBIRD_KEY_REQUEST_URL} target="_blank" rel="noreferrer">
          eBird API key request page
        </a>
        . It shows up right away. Paste it on the first screen and tap <strong>Save key</strong>.
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
        {appName} needs a signal to open, to draw the map, and to check eBird. If the signal drops, the lists keep
        the eBird data they last loaded and say when it was fetched. Once that data is 6 hours old, eBird&apos;s
        terms no longer allow showing it, so it leaves the screen until a signal returns.
      </p>

      <h2>Install it</h2>
      <p>
        On iPhone and iPad, in Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. On
        Android, in Chrome, tap <strong>Install</strong> on the bar at the top, once Chrome offers it. {appName} also
        works in a plain browser tab.
      </p>

      <h2>What stays on the phone</h2>
      <p>
        {appName} has no account and no server. The phone keeps the eBird key, your settings, whether location is on,
        and copies of the day&apos;s eBird results. {appName} sends the key, the place to search, and the days back
        to eBird, and map views to OpenFreeMap for the map. Nothing goes to any other server.{' '}
        <strong>Directions</strong> and checklist links open Apple Maps, Google Maps, or eBird only when tapped.
      </p>

      {children}
    </div>
  );
}
