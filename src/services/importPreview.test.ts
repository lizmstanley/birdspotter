import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAMPLE_HEADERS,
  SAMPLE_ROWS,
  buildRows,
  checkRows,
  distinctValues,
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

test('rsvp enum values pass through unchanged', () => {
  assert.equal(normalizeRsvp('no_response'), 'no_response');
  assert.equal(normalizeRsvp('no_show'), 'no_show');
  assert.equal(normalizeRsvp('cancelled'), 'cancelled');
});

test('free text rsvp is read loosely', () => {
  assert.equal(normalizeRsvp('Yes'), 'confirmed');
  assert.equal(normalizeRsvp('Maybe'), 'undecided');
  assert.equal(normalizeRsvp('No'), 'declined_keep');
  assert.equal(normalizeRsvp(''), 'confirmed');
});

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

test('the sample file imports cleanly with the guessed columns', () => {
  assert.deepEqual(Object.keys(SAMPLE_ROWS[0]), SAMPLE_HEADERS);
  const rows = buildRows(SAMPLE_ROWS, MAPPING, {}, {});
  const check = checkRows(rows, ['A1', 'B2']);
  assert.equal(check.willImport, SAMPLE_ROWS.length);
  assert.equal(check.newAreas.length, 0);
  assert.ok(rows.every((r) => r.email.endsWith('@example.com')));
});
