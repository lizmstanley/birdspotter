import { EBIRD_SITE_URL } from '../../services/ebird.ts';

export function EbirdCredit() {
  return (
    <p className="muted ebird-credit">
      Bird data from{' '}
      <a href={EBIRD_SITE_URL} target="_blank" rel="noreferrer">
        eBird.org
      </a>
      , refreshed once a day.
    </p>
  );
}
