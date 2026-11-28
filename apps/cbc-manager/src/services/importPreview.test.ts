import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RSVP_OPTIONS,
  SAMPLE_HEADERS,
  SAMPLE_ROWS,
  buildRows,
  checkRows,
  distinctValues,
  isEveryHeaderMapped,
  normalizeCounterType,
  normalizeRsvp,
  type ColumnMapping,
} from './importPreview.ts';

const MAPPING: ColumnMapping = {
  nameCol: 'Name',
  emailCol: 'Email',
  areaCol: 'Area',
  rsvpCol: 'RSVP',
  typeCol: 'Counter Type',
  noteCol: 'Notes',
};

test('every rsvp value and label reads back as that value', () => {
  for (const option of RSVP_OPTIONS) {
    assert.equal(normalizeRsvp(option.value), option.value);
    assert.equal(normalizeRsvp(option.label), option.value);
  }
});

const RSVP_TEXT: [string, string][] = [
  ['', 'confirmed'],
  ['Yes', 'confirmed'],
  ['Y', 'confirmed'],
  ['Confirmed', 'confirmed'],
  ['Maybe', 'undecided'],
  ['Undecided', 'undecided'],
  ['Pending', 'undecided'],
  ['TBD', 'undecided'],
  ['Please remove me', 'declined_remove'],
  ['No show', 'no_show'],
  ['No-show', 'no_show'],
  ['noshow', 'no_show'],
  ['Canceled', 'cancelled'],
  ['Declined', 'declined_keep'],
  ["Can't make it", 'declined_keep'],
  ['Can’t make it', 'declined_keep'],
  ['Significant other', 'no_response'],
  ["Won't make it", 'declined_keep'],
  ['Yes, no problem', 'confirmed'],
  ['Count me in, yes', 'confirmed'],
  ['Not confirmed', 'no_response'],
  ['Not yet confirmed', 'no_response'],
  ['Cannot attend', 'declined_keep'],
  ['No', 'declined_keep'],
  ['N', 'declined_keep'],
  ['Not sure', 'no_response'],
  ['Unconfirmed', 'no_response'],
  ['Tentative', 'no_response'],
];

for (const [text, expected] of RSVP_TEXT) {
  test(`rsvp text "${text}" reads as ${expected}`, () => {
    assert.equal(normalizeRsvp(text), expected);
  });
}

test('every rsvp reading is a value the app has', () => {
  const values = new Set(RSVP_OPTIONS.map((o) => o.value));
  for (const [text] of RSVP_TEXT) assert.ok(values.has(normalizeRsvp(text)), text);
});

const COUNTER_TEXT: [string, string][] = [
  ['Field and feeders', 'both'],
  ['Both', 'both'],
  ['Field + feeder watch', 'both'],
  ['Feeder', 'home_feeders'],
  ['Home feeders', 'home_feeders'],
  ['Coordinator only', 'coordinator_only'],
  ['Field', 'field'],
  ['', 'field'],
];

for (const [text, expected] of COUNTER_TEXT) {
  test(`counter type text "${text}" reads as ${expected}`, () => {
    assert.equal(normalizeCounterType(text), expected);
  });
}

test('distinct values are counted, most common first', () => {
  const rows = [{ R: 'Yes' }, { R: 'No' }, { R: 'Yes' }, { R: '' }];
  assert.deepEqual(distinctValues(rows, 'R'), [
    { value: 'Yes', count: 2 },
    { value: '', count: 1 },
    { value: 'No', count: 1 },
  ]);
  assert.deepEqual(distinctValues(rows, ''), []);
});

test('a chosen value overrides the loose reading', () => {
  const rows = buildRows([{ Name: 'A', Email: 'a@example.com', RSVP: 'Tentative' }], MAPPING, { Tentative: 'undecided' }, {});
  assert.equal(rows[0].rsvp_status, 'undecided');
});

test('with no rsvp or type column, rows carry no rsvp or type', () => {
  const rows = buildRows(
    [{ Name: 'A', Email: 'a@example.com' }],
    { ...MAPPING, rsvpCol: '', typeCol: '' },
    {},
    {}
  );
  assert.equal(rows[0].rsvp_status, undefined);
  assert.equal(rows[0].counter_type, undefined);
});

test('checks report skipped rows, duplicates, and new areas', () => {
  const rows = buildRows(
    [
      { Name: 'A', Email: 'a@example.com', Area: 'A1' },
      { Name: 'B', Email: 'A@example.com', Area: 'zz9' },
      { Name: 'C', Email: '', Area: 'A1' },
      { Name: 'D', Email: 'not-an-email', Area: '' },
    ],
    MAPPING,
    {},
    {}
  );
  const check = checkRows(rows, ['A1']);
  assert.equal(check.total, 4);
  assert.equal(check.skippedNoEmail, 2);
  assert.equal(check.willImport, 2);
  assert.deepEqual(check.duplicateEmails, ['a@example.com']);
  assert.deepEqual(check.newAreas, ['zz9']);
});

test('a file counts as fully mapped only when every header is used and email is chosen', () => {
  const headers = Object.values(MAPPING);
  const shortMapping = { ...MAPPING, rsvpCol: '', typeCol: '', noteCol: '' };
  assert.equal(isEveryHeaderMapped(headers, MAPPING), true);
  assert.equal(isEveryHeaderMapped(['Name', 'Email', 'Area'], shortMapping), true);
  assert.equal(isEveryHeaderMapped([...headers, 'Phone'], MAPPING), false);
  assert.equal(isEveryHeaderMapped(headers, { ...MAPPING, areaCol: '' }), false);
  assert.equal(isEveryHeaderMapped(['Name', 'Area'], { ...shortMapping, emailCol: '' }), false);
});

test('the sample file imports cleanly with the guessed columns', () => {
  assert.deepEqual(Object.keys(SAMPLE_ROWS[0]), SAMPLE_HEADERS);
  const rows = buildRows(SAMPLE_ROWS, MAPPING, {}, {});
  const check = checkRows(rows, ['A1', 'B2']);
  assert.equal(check.willImport, SAMPLE_ROWS.length);
  assert.equal(check.newAreas.length, 0);
  assert.ok(rows.every((r) => r.email.endsWith('@example.com')));
});
