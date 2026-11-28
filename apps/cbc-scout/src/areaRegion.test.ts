import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EbirdObservation } from '@birdspotter/birding-core/ebird.ts';
import { countCircle, countCircleQuery, inAreaOnly, isInAreaTest } from './areaRegion.ts';
import { areaData } from './testing/areaFixtures.ts';

// The fixture circle is centered at -93.25, 44.95; its area spans -93.3 to -93.2 and 44.9 to 45.
const area = areaData();
const circle = countCircle(area);
const nearOutside = { lng: -93.25, lat: 45.03 };

test('a place inside the area outline is in the area, one just outside it is not', () => {
  const isInArea = isInAreaTest(area, circle);

  assert.equal(isInArea({ lng: -93.25, lat: 44.95 }), true);
  assert.equal(isInArea(nearOutside), false);
});

test('for a line outline, places in the circle count as in the area', () => {
  const lineArea = areaData({
    outline: {
      type: 'LineString',
      coordinates: [
        [-93.3, 44.9],
        [-93.2, 45],
      ],
    },
  });
  const isInArea = isInAreaTest(lineArea, circle);

  assert.equal(isInArea(nearOutside), true);
  assert.equal(isInArea({ lng: -93.25, lat: 45.1 }), false);
});

test('the query is the whole count circle', () => {
  assert.deepEqual(countCircleQuery(area), { center: area.circleCenter, radiusMiles: 7.5 });
});

function report(locId: string, place: { readonly lng: number; readonly lat: number }): EbirdObservation {
  return {
    speciesCode: 'rebnut',
    comName: 'Red-breasted Nuthatch',
    sciName: 'Sitta canadensis',
    locId,
    locName: locId,
    obsDt: '2026-11-20 08:15',
    subId: `S-${locId}`,
    ...place,
  };
}

test('the places fetched for one species are kept to the area, as the lists are', async () => {
  const inside = report('inside', { lng: -93.25, lat: 44.95 });
  const outside = report('outside', nearOutside);
  const requested: string[] = [];
  const lists = inAreaOnly(
    {
      regular: [inside, outside],
      notable: [outside],
      hotspots: [],
      fetchSpeciesPlaces: async (speciesCode) => {
        requested.push(speciesCode);
        return { items: [inside, outside], fetchedAt: 1, isNoSignalCopy: true };
      },
    },
    isInAreaTest(area, circle)
  );

  assert.deepEqual(lists.regular, [inside]);
  assert.deepEqual(lists.notable, []);
  assert.deepEqual(await lists.fetchSpeciesPlaces?.('rebnut'), { items: [inside], fetchedAt: 1, isNoSignalCopy: true });
  assert.deepEqual(requested, ['rebnut']);
});

test('with no search yet, there is no species fetcher to keep to the area', () => {
  const lists = inAreaOnly({ regular: [], notable: [], hotspots: [], fetchSpeciesPlaces: null }, isInAreaTest(area, circle));
  assert.equal(lists.fetchSpeciesPlaces, null);
});
