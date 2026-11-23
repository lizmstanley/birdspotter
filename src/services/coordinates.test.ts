import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCircleCenter } from './coordinates.ts';

test('a typed center inside the lat and lng ranges is accepted, edges included', () => {
  assert.deepEqual(parseCircleCenter('47.6186', '-91.3564'), { lat: 47.6186, lng: -91.3564 });
  assert.deepEqual(parseCircleCenter('-90', '180'), { lat: -90, lng: 180 });
});

for (const [lat, lng, why] of [
  ['90.1', '-93', 'latitude above 90'],
  ['-90.1', '-93', 'latitude below -90'],
  ['45', '180.5', 'longitude above 180'],
  ['45', '-181', 'longitude below -180'],
  ['', '-93', 'a blank latitude'],
  ['45', 'west', 'a longitude that is not a number'],
]) {
  test(`a typed center with ${why} is rejected`, () => {
    assert.equal(parseCircleCenter(lat, lng), null);
  });
}
