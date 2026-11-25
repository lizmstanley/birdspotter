import { EBIRD_SITE_URL } from '../../src/services/ebird.ts';
import type { LiveLocation } from './locationTracking.ts';
import { refreshIntervalText, type RefreshMinutes } from './scoutSettings.ts';
import type { NearbyData } from './useNearbyData.ts';

interface NearbyStatusProps {
  readonly data: NearbyData;
  readonly live: LiveLocation;
  readonly onFixKey: () => void;
}

function waitingText(live: LiveLocation): string {
  if (live.error) return live.error;
  if (live.isTracking) return 'Finding your location…';
  return 'Turn on location with the location button on the map to see what is nearby.';
}

/** The eBird load's errors, and why no rows show yet. */
export function NearbyStatus({ data, live, onFixKey }: NearbyStatusProps) {
  return (
    <>
      {data.isKeyRejected && (
        <div className="scout-nearby-error" role="alert">
          <p>eBird rejected your API key. Fix it under eBird key in the menu.</p>
          <button type="button" onClick={onFixKey}>
            Fix eBird key
          </button>
        </div>
      )}
      {data.error && !data.isKeyRejected && (
        <p className="scout-nearby-error" role="alert">
          {data.error}
        </p>
      )}
      {!live.position && <p role="status">{waitingText(live)}</p>}
      {live.position && data.isLoading && <p role="status">Loading eBird data…</p>}
    </>
  );
}

export function EbirdCredit({ refreshMinutes }: { readonly refreshMinutes: RefreshMinutes }) {
  return (
    <p className="scout-nearby-credit">
      Bird data from{' '}
      <a href={EBIRD_SITE_URL} target="_blank" rel="noreferrer">
        eBird.org
      </a>
      , checked {refreshIntervalText(refreshMinutes)}.
    </p>
  );
}
