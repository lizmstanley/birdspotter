import type { MapPlace } from './mapPlaces.ts';
import { directionTo, distanceMiles, type LngLat } from './nearby.ts';
import { PlaceWhere } from './NearbyRows.tsx';

interface PlacePopupProps {
  readonly place: MapPlace;
  readonly position: LngLat;
}

function speciesText(place: MapPlace): string | null {
  const { notableSpecies, otherSpeciesCount } = place;
  if (notableSpecies.length === 0 && otherSpeciesCount === 0) return 'No recent sightings reported here.';
  if (otherSpeciesCount === 0) return null;
  if (notableSpecies.length === 0) return `${otherSpeciesCount} species reported`;
  return `${otherSpeciesCount} other species reported`;
}

/** What a tapped map place shows: its name, the notable species there, the other species count, and the way there. */
export function PlacePopup({ place, position }: PlacePopupProps) {
  const placeAt: LngLat = [place.lng, place.lat];
  const miles = distanceMiles(position, placeAt);
  const row = { item: place, miles, direction: directionTo(position, placeAt, miles), isInRegion: false };
  const text = speciesText(place);
  return (
    <div className="birding-place-popup">
      <strong>{place.name}</strong>
      {place.isHotspot && <span className="birding-place-kind">Hotspot</span>}
      {place.notableSpecies.length > 0 && (
        <p>
          <span className="birding-nearby-notable">Notable</span> {place.notableSpecies.join(', ')}
        </p>
      )}
      {text && <p>{text}</p>}
      <PlaceWhere row={row} placeName={place.name} />
    </div>
  );
}
