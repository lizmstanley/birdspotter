import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Party } from '../db/types.ts';
import { partyFormValues, partyFromForm, type PartyFormValues } from './partyForm.ts';

const FORM: PartyFormValues = {
  date: '2026-12-19',
  startTime: '07:30',
  stopTime: '16:15',
  participants: '3',
  carHours: '4.25',
  footHours: '3.5',
  feederHours: '',
  carMiles: '41.2',
  footMiles: ' 2 ',
};

test('a filled form gives the party in local time, with blank hours as none', () => {
  assert.deepEqual(partyFromForm(FORM, 'paper-1', '1A'), {
    party: {
      party_id: 'paper-1',
      area_code: '1A',
      start_time: new Date(2026, 11, 19, 7, 30).getTime(),
      stop_time: new Date(2026, 11, 19, 16, 15).getTime(),
      participants: 3,
      car_hours: 4.25,
      foot_hours: 3.5,
      feeder_hours: 0,
      car_miles: 41.2,
      foot_miles: 2,
    },
  });
});

test('editing a party fills the form with what was saved', () => {
  const party: Party = {
    party_id: 'phone-1',
    area_code: '2B',
    start_time: new Date(2026, 11, 19, 6, 5).getTime(),
    stop_time: new Date(2026, 11, 19, 17, 40).getTime(),
    participants: 2,
    car_hours: 1.5,
    foot_hours: 9,
    feeder_hours: 0.25,
    car_miles: 12,
    foot_miles: 6.4,
  };

  assert.deepEqual(partyFromForm(partyFormValues(party, ''), 'phone-1', '2B'), { party });
});

test('a new party form starts on the given date with one participant', () => {
  const values = partyFormValues(null, '2026-12-19');

  assert.deepEqual([values.date, values.participants, values.startTime], ['2026-12-19', '1', '']);
});

test('a stop time before the start time is refused', () => {
  assert.deepEqual(partyFromForm({ ...FORM, stopTime: '06:00' }, 'p', '1A'), {
    problem: 'The stop time is before the start time.',
  });
});

test('a missing time is refused', () => {
  assert.deepEqual(partyFromForm({ ...FORM, startTime: '' }, 'p', '1A'), {
    problem: 'Enter the date and the start and stop times.',
  });
});

for (const participants of ['0', '1.5', '', 'two', '2147483648']) {
  test(`participants "${participants}" is refused`, () => {
    assert.deepEqual(partyFromForm({ ...FORM, participants }, 'p', '1A'), {
      problem: 'Participants must be a whole number, 1 or more.',
    });
  });
}

test('the largest participants and miles the table holds are accepted', () => {
  const result = partyFromForm({ ...FORM, participants: '2147483647', footMiles: '99999.99' }, 'p', '1A');

  assert.ok('party' in result);
  assert.deepEqual([result.party.participants, result.party.foot_miles], [2147483647, 99999.99]);
});

for (const footMiles of ['-1', 'lots', '100000']) {
  test(`foot miles "${footMiles}" is refused`, () => {
    assert.deepEqual(partyFromForm({ ...FORM, footMiles }, 'p', '1A'), {
      problem: 'Hours and miles must be numbers from 0 to 99999.99.',
    });
  });
}
