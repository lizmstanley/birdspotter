import type { EbirdHotspot, EbirdObservation } from '../../packages/birding-core/src/ebird.ts';
import { MemoryStorage } from '../../packages/birding-core/src/testing/memoryStorage.ts';
import { encodeAreaLink, type AreaLinkData } from '../../apps/cbc-manager/src/services/areaLink.ts';
import { areaName } from '../../apps/cbc-scout/src/areaName.ts';
import {
  startSession,
  withFix,
  withParticipants,
  writeCountSession,
  type CountSession,
} from '../../apps/cbc-scout/src/countSession.ts';
import { NO_SAVED_AREAS, withArea, writeSavedAreas } from '../../apps/cbc-scout/src/savedAreas.ts';

// Every place, person, circle, and area here is made up. The pictures are committed, and no real data goes in git.

/** [longitude, latitude] where the phone reports itself. */
export const PHONE_POSITION: readonly [number, number] = [-93.2465, 44.9442];

interface SamplePlace {
  readonly locId: string;
  readonly locName: string;
  readonly lng: number;
  readonly lat: number;
  readonly numSpeciesAllTime: number;
}

const PLACES: readonly SamplePlace[] = [
  { locId: 'L9000001', locName: 'Willow Bend Park', lng: -93.2441, lat: 44.9468, numSpeciesAllTime: 182 },
  { locId: 'L9000002', locName: 'Heron Pond Trail', lng: -93.2552, lat: 44.9391, numSpeciesAllTime: 151 },
  { locId: 'L9000003', locName: 'Old Mill Overlook', lng: -93.2318, lat: 44.9507, numSpeciesAllTime: 134 },
  { locId: 'L9000004', locName: 'Cattail Marsh Boardwalk', lng: -93.2627, lat: 44.9536, numSpeciesAllTime: 167 },
  { locId: 'L9000005', locName: 'Maple Ridge Woods', lng: -93.2209, lat: 44.9361, numSpeciesAllTime: 96 },
  { locId: 'L9000006', locName: 'Lakeshore Picnic Grounds', lng: -93.2745, lat: 44.9312, numSpeciesAllTime: 121 },
  { locId: 'L9000007', locName: 'Prairie Hill Preserve', lng: -93.2133, lat: 44.9602, numSpeciesAllTime: 88 },
];

interface SampleSighting {
  readonly speciesCode: string;
  readonly comName: string;
  readonly sciName: string;
  readonly place: number;
  readonly hoursAgo: number;
  readonly howMany: number;
}

const SIGHTINGS: readonly SampleSighting[] = [
  { speciesCode: 'baleag', comName: 'Bald Eagle', sciName: 'Haliaeetus leucocephalus', place: 2, hoursAgo: 1, howMany: 2 },
  { speciesCode: 'pilwoo', comName: 'Pileated Woodpecker', sciName: 'Dryocopus pileatus', place: 0, hoursAgo: 2, howMany: 1 },
  { speciesCode: 'cedwax', comName: 'Cedar Waxwing', sciName: 'Bombycilla cedrorum', place: 0, hoursAgo: 3, howMany: 24 },
  { speciesCode: 'hoomer', comName: 'Hooded Merganser', sciName: 'Lophodytes cucullatus', place: 1, hoursAgo: 4, howMany: 6 },
  { speciesCode: 'rebnut', comName: 'Red-breasted Nuthatch', sciName: 'Sitta canadensis', place: 4, hoursAgo: 5, howMany: 3 },
  { speciesCode: 'amtspa', comName: 'American Tree Sparrow', sciName: 'Spizelloides arborea', place: 6, hoursAgo: 6, howMany: 8 },
  { speciesCode: 'coohaw', comName: "Cooper's Hawk", sciName: 'Accipiter cooperii', place: 3, hoursAgo: 8, howMany: 1 },
  { speciesCode: 'gnbher', comName: 'Great Blue Heron', sciName: 'Ardea herodias', place: 1, hoursAgo: 20, howMany: 1 },
  { speciesCode: 'commer', comName: 'Common Merganser', sciName: 'Mergus merganser', place: 5, hoursAgo: 26, howMany: 40 },
  { speciesCode: 'whwsco', comName: 'White-winged Scoter', sciName: 'Melanitta deglandi', place: 5, hoursAgo: 30, howMany: 1 },
  { speciesCode: 'brncre', comName: 'Brown Creeper', sciName: 'Certhia americana', place: 4, hoursAgo: 44, howMany: 2 },
  { speciesCode: 'easblu', comName: 'Eastern Bluebird', sciName: 'Sialia sialis', place: 6, hoursAgo: 52, howMany: 5 },
];

const NOTABLE: readonly SampleSighting[] = [
  { speciesCode: 'snoowl1', comName: 'Snowy Owl', sciName: 'Bubo scandiacus', place: 6, hoursAgo: 3, howMany: 1 },
  { speciesCode: 'harduc', comName: 'Harlequin Duck', sciName: 'Histrionicus histrionicus', place: 2, hoursAgo: 28, howMany: 1 },
];

// Local time, as eBird sends it. Chrome runs in the same time zone as this script, so the ages it shows match.
function ebirdDateTime(time: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())} ` +
    `${pad(time.getHours())}:${pad(time.getMinutes())}`
  );
}

function observation(sighting: SampleSighting, now: number, index: number): EbirdObservation {
  const place = PLACES[sighting.place];
  return {
    speciesCode: sighting.speciesCode,
    comName: sighting.comName,
    sciName: sighting.sciName,
    locId: place.locId,
    locName: place.locName,
    obsDt: ebirdDateTime(new Date(now - sighting.hoursAgo * 60 * 60 * 1000)),
    howMany: sighting.howMany,
    lat: place.lat,
    lng: place.lng,
    subId: `S9${String(index).padStart(7, '0')}`,
    obsValid: true,
  };
}

function hotspot(place: SamplePlace, now: number): EbirdHotspot {
  return { ...place, latestObsDt: ebirdDateTime(new Date(now - 60 * 60 * 1000)) };
}

/** @returns the made-up answer to an eBird API request, chosen by its path */
export function sampleEbirdAnswer(url: URL, now: number): readonly unknown[] {
  const path = url.pathname;
  if (path === '/v2/ref/hotspot/geo') return PLACES.map((place) => hotspot(place, now));
  if (path === '/v2/data/obs/geo/recent') return SIGHTINGS.map((sighting, index) => observation(sighting, now, index));
  if (path === '/v2/data/obs/geo/recent/notable') {
    return NOTABLE.map((sighting, index) => observation(sighting, now, SIGHTINGS.length + index));
  }
  const speciesCode = path.split('/').at(-1);
  const matches = [...SIGHTINGS, ...NOTABLE].filter((sighting) => sighting.speciesCode === speciesCode);
  return matches.map((sighting, index) => observation(sighting, now, 100 + index));
}

export const SAMPLE_AREA: AreaLinkData = {
  circleCode: 'ZZSV',
  circleName: 'Sample Valley',
  circleCenter: [-93.235, 44.955],
  areaCode: '4',
  areaLabel: '4 - Willow Bend',
  outline: {
    type: 'Polygon',
    coordinates: [
      [
        [-93.262, 44.936],
        [-93.229, 44.934],
        [-93.226, 44.955],
        [-93.247, 44.958],
        [-93.263, 44.951],
        [-93.262, 44.936],
      ],
    ],
  },
  leaders: [{ name: 'Robin Example', phone: '555-0142', email: 'robin@example.com' }],
  note: 'Start at the Willow Bend Park lot. Check the feeders along the river trail, and listen for owls at dusk.',
};

const ROUTE: readonly (readonly [number, number])[] = [
  [-93.2585, 44.9375],
  [-93.2561, 44.9389],
  [-93.2538, 44.9398],
  [-93.2519, 44.9411],
  [-93.2502, 44.9423],
  [-93.2488, 44.9433],
  [-93.2477, 44.9445],
  [PHONE_POSITION[0], PHONE_POSITION[1]],
];

const COUNT_STARTED_HOURS_AGO = 2.25;
const PARTY_SIZE = 3;

/** A count of the sample area that is still running, with a recorded walk that ends where the phone is. */
function runningCount(now: number): CountSession {
  const start = now - COUNT_STARTED_HOURS_AGO * 60 * 60 * 1000;
  const stepMs = ((now - start) * 0.9) / ROUTE.length;
  let session = startSession(start, {
    name: areaName(SAMPLE_AREA),
    code: SAMPLE_AREA.areaCode,
    circleCode: SAMPLE_AREA.circleCode,
  });
  ROUTE.forEach(([lng, lat], index) => {
    session = withFix(session, { lng, lat, time: start + (index + 1) * stepMs, accuracy: 10 });
  });
  return withParticipants(session, PARTY_SIZE);
}

/** @returns CBC Scout's `localStorage` items with the sample area saved and active, and a running count when asked */
export function scoutStorageItems(now: number, isCountRunning: boolean): ReadonlyMap<string, string> {
  const storage = new MemoryStorage();
  writeSavedAreas(storage, withArea(NO_SAVED_AREAS, encodeAreaLink(SAMPLE_AREA), SAMPLE_AREA));
  if (isCountRunning) writeCountSession(storage, runningCount(now));
  return storage.items;
}
