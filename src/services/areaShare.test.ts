import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AreaBoundaryRow, AssignmentRow, SavedCircle } from '../db/types.ts';
import { buildAreaLinkData } from './areaShare.ts';

const CIRCLE: SavedCircle = {
  code: 'MNMI',
  name: 'Minneapolis North',
  state_province: 'MN',
  center_lat: 44.95,
  center_lng: -93.25,
  radius_miles: 7.5,
  is_favorite: false,
  is_active: true,
  compiler_name: 'Chris Compiler',
  compiler_email: 'chris@example.test',
  count_date: null,
  audubon_url: null,
  current_year: 2026,
};

const RING = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];

function boundary(code: string, label: string | null, type: AreaBoundaryRow['boundary_geojson']['type'] = 'Polygon'): AreaBoundaryRow {
  const coordinates = type === 'Point' ? [0, 0] : [RING];
  return { circle_code: 'MNMI', code, label, boundary_geojson: { type, coordinates } };
}

function assignment(overrides: Partial<AssignmentRow>): AssignmentRow {
  return {
    circle_code: 'MNMI',
    participation_id: 1,
    person_id: 1,
    area: '12',
    cities: 'Richfield',
    full_name: 'Counter',
    email: 'counter@example.test',
    rsvp_status: 'confirmed',
    counter_type: 'field',
    is_area_leader: false,
    companions: 'Two friends',
    active_notes: 'Has a key to the gate',
    first_year_participated: 2010,
    seasons_counted: 5,
    phone: '612-555-0199',
    ...overrides,
  };
}

const BOUNDARIES = [boundary('Full CBC circle', 'Full CBC circle'), boundary('12', '12 - Richfield'), boundary('13', null)];

test('the link data holds the circle, the area outline, and only area leaders of this area', () => {
  const assignments = [
    assignment({ full_name: ' Pat Leader ', is_area_leader: true, phone: '612-555-0100', email: 'pat@example.test' }),
    assignment({ full_name: 'Sam Second', is_area_leader: true, phone: '  ', email: null, area: '12' }),
    assignment({ full_name: 'Not A Leader' }),
    assignment({ full_name: 'Other Area Leader', is_area_leader: true, area: '13' }),
  ];
  assert.deepEqual(buildAreaLinkData(CIRCLE, BOUNDARIES, assignments, '12'), {
    circleCode: 'MNMI',
    circleName: 'Minneapolis North',
    circleCenter: [-93.25, 44.95],
    areaCode: '12',
    areaLabel: '12 - Richfield',
    outline: { type: 'Polygon', coordinates: [RING] },
    leaders: [{ name: 'Pat Leader', phone: '612-555-0100', email: 'pat@example.test' }, { name: 'Sam Second' }],
  });
});

test('the area code matches outlines and leaders regardless of case', () => {
  const data = buildAreaLinkData(
    CIRCLE,
    [boundary('4N', null)],
    [assignment({ area: '4n', is_area_leader: true, full_name: 'Lee' })],
    '4n'
  );
  assert.equal(data?.areaCode, '4N');
  assert.deepEqual(data?.leaders.map((l) => l.name), ['Lee']);
  assert.equal(data && 'areaLabel' in data, false);
});

test('an area without a polygon or line outline has no link data', () => {
  assert.equal(buildAreaLinkData(CIRCLE, BOUNDARIES, [], '99'), null);
  assert.equal(buildAreaLinkData(CIRCLE, [boundary('12', null, 'Point')], [], '12'), null);
});

test('the outer circle outline is never shared as an area', () => {
  assert.equal(buildAreaLinkData(CIRCLE, BOUNDARIES, [], 'Full CBC circle'), null);
});
