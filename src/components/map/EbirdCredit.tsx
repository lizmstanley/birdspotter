import { EBIRD_SITE_URL } from '@birdspotter/birding-core/ebird.ts';

export function EbirdCredit() {
  return (
    <p className="muted ebird-credit">
      Bird data from{' '}
      <a href={EBIRD_SITE_URL} target="_blank" rel="noreferrer">
        eBird.org
      </a>
      . Saved hotspots are kept for the day, sightings for 6 hours.
    </p>
  );
}
