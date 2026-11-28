import { EBIRD_SITE_URL } from './ebird.ts';
import type { LiveLocation } from './locationTracking.ts';
import type { LngLat } from './nearby.ts';
import { nearbyProgressText } from './nearbyProgress.ts';
import type { KeyProblem } from './nearbyRefresh.ts';
import { noSignalText } from './noSignalText.ts';
import { refreshIntervalText, type RefreshMinutes } from './settings.ts';
import type { NearbyData } from './useNearbyData.ts';

interface NearbyStatusProps {
  readonly data: NearbyData;
  readonly live: LiveLocation;
  /** The point the rows are measured from, or null when none is known yet. */
  readonly origin: LngLat | null;
  readonly onFixKey: () => void;
}

const KEY_PROBLEM_TEXT: Readonly<Record<KeyProblem, string>> = {
  rejected: 'eBird rejected your API key. Fix it under eBird key in the menu.',
  unsendable: "Your eBird API key has a character an eBird key can't have. Fix it under eBird key in the menu.",
};

/** The eBird load's errors, and why no rows show yet. */
export function NearbyStatus({ data, live, origin, onFixKey }: NearbyStatusProps) {
  const progressText = nearbyProgressText(origin, live, data.isLoading);
  return (
    <>
      {data.keyProblem && (
        <div className="birding-nearby-error" role="alert">
          <p>{KEY_PROBLEM_TEXT[data.keyProblem]}</p>
          <button type="button" onClick={onFixKey}>
            Fix eBird key
          </button>
        </div>
      )}
      {data.error && !data.keyProblem && (
        <p className="birding-nearby-error" role="alert">
          {data.error}
        </p>
      )}
      {data.hasNoSignal && <p role="status">{noSignalText(data.sightingsFetchedAt, data.hotspotsFetchedAt)}</p>}
      {progressText && <p role="status">{progressText}</p>}
    </>
  );
}

interface EbirdCreditProps {
  readonly refreshMinutes: RefreshMinutes;
  readonly hasNoSignal: boolean;
}

export function EbirdCredit({ refreshMinutes, hasNoSignal }: EbirdCreditProps) {
  return (
    <p className="birding-nearby-credit">
      Bird data from{' '}
      <a href={EBIRD_SITE_URL} target="_blank" rel="noreferrer">
        eBird.org
      </a>
      {hasNoSignal ? '.' : `, checked ${refreshIntervalText(refreshMinutes)}.`}
    </p>
  );
}
