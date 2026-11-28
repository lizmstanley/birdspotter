import { useEffect, useState } from 'react';
import { describeError } from './describeError.ts';
import type { DistanceUnit } from './distanceUnit.ts';
import type { EbirdList, EbirdObservation } from './ebird.ts';
import { EbirdUnreachableError } from './errors.ts';
import { latestAtEachPlace, sortNearby, type LngLat, type RegionTest } from './nearby.ts';
import { SpeciesPlaceRow } from './NearbyRows.tsx';
import type { SpeciesPlacesFetcher } from './useNearbyData.ts';

/** Where a species's places come from: the notable reports held, or a fetch when the list is opened. */
export type PlacesSource =
  | { readonly kind: 'notable'; readonly reports: readonly EbirdObservation[] }
  | { readonly kind: 'fetched'; readonly fetchPlaces: SpeciesPlacesFetcher };

interface SpeciesPlacesProps {
  readonly speciesCode: string;
  readonly source: PlacesSource;
  readonly origin: LngLat;
  readonly isInRegion: RegionTest | null;
  readonly now: Date;
  readonly distanceUnit: DistanceUnit;
}

interface PlacesProps {
  readonly reports: readonly EbirdObservation[];
  readonly origin: LngLat;
  readonly isInRegion: RegionTest | null;
  readonly now: Date;
  readonly distanceUnit: DistanceUnit;
}

type Fetched =
  | { readonly status: 'loaded'; readonly list: EbirdList<EbirdObservation> }
  | { readonly status: 'failed'; readonly error: unknown };

/** Every place a species was reported, opened under its row, nearest first. */
export function SpeciesPlaces({ speciesCode, source, origin, isInRegion, now, distanceUnit }: SpeciesPlacesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const places = { origin, isInRegion, now, distanceUnit };
  return (
    <details className="birding-species-places" onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary>Every place reported</summary>
      {isOpen && source.kind === 'notable' && (
        <Places reports={source.reports.filter((report) => report.speciesCode === speciesCode)} {...places} />
      )}
      {isOpen && source.kind === 'fetched' && (
        <FetchedPlaces speciesCode={speciesCode} fetchPlaces={source.fetchPlaces} {...places} />
      )}
    </details>
  );
}

function FetchedPlaces({
  speciesCode,
  fetchPlaces,
  ...places
}: Omit<PlacesProps, 'reports'> & { readonly speciesCode: string; readonly fetchPlaces: SpeciesPlacesFetcher }) {
  const fetched = useFetchedPlaces(fetchPlaces, speciesCode);
  if (fetched === null) return <p className="birding-nearby-detail">Loading places…</p>;
  if (fetched.status === 'failed') {
    const text =
      fetched.error instanceof EbirdUnreachableError
        ? 'These places need a signal. None are saved for this species yet.'
        : describeError(fetched.error);
    return <p className="birding-nearby-detail">{text}</p>;
  }
  return (
    <>
      {fetched.list.isNoSignalCopy && <p className="birding-nearby-detail">No signal. These places were saved earlier.</p>}
      <Places reports={fetched.list.items} {...places} />
    </>
  );
}

/**
 * Fetches again each time the fetcher changes, keeping the last result on screen until the next one settles.
 * @returns null until the first fetch settles
 */
function useFetchedPlaces(fetchPlaces: SpeciesPlacesFetcher, speciesCode: string): Fetched | null {
  const [fetched, setFetched] = useState<Fetched | null>(null);
  useEffect(() => {
    let isCurrent = true;
    fetchPlaces(speciesCode).then(
      (list) => {
        if (isCurrent) setFetched({ status: 'loaded', list });
      },
      (error: unknown) => {
        if (isCurrent) setFetched({ status: 'failed', error });
      }
    );
    return () => {
      isCurrent = false;
    };
  }, [fetchPlaces, speciesCode]);
  return fetched;
}

function Places({ reports, origin, isInRegion, now, distanceUnit }: PlacesProps) {
  const rows = sortNearby(latestAtEachPlace(reports), origin, isInRegion);
  if (rows.length === 0) return <p className="birding-nearby-detail">No places reported in that time.</p>;
  if (rows.length === 1) return <p className="birding-nearby-detail">Reported at only this place in that time.</p>;
  return (
    <ul className="birding-nearby-list">
      {rows.map((row) => (
        <SpeciesPlaceRow key={row.item.locId} row={row} now={now} distanceUnit={distanceUnit} />
      ))}
    </ul>
  );
}
