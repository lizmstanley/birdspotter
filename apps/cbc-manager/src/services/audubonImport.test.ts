import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAudubonExport, mapAudubonRows } from './audubonImport.ts';

const HEADERS = ['No.', 'First Name', 'Last Name', 'Email', 'Sector', 'Registered', 'CBC Circle', 'Notes'];

test('detects the Audubon export by its headers', () => {
  assert.equal(isAudubonExport(HEADERS), true);
  assert.equal(isAudubonExport(['Name', 'Email', 'Area']), false);
});

test('joins first and last name and marks the Audubon list', () => {
  const [row] = mapAudubonRows([
    { 'First Name': 'Pat', 'Last Name': 'Example', Email: 'pat@example.com', Sector: 'A1', Registered: 'Yes', Notes: 'hi' },
  ]);
  assert.equal(row.full_name, 'Pat Example');
  assert.equal(row.email, 'pat@example.com');
  assert.equal(row.area_code, 'A1');
  assert.equal(row.rsvp_status, 'confirmed');
  assert.equal(row.note, 'hi');
  assert.equal(row.in_audubon_list, true);
});

test('an unregistered signup has no response and no area', () => {
  const [row] = mapAudubonRows([
    { 'First Name': 'Sam', 'Last Name': '', Email: 'sam@example.com', Sector: '', Registered: 'No', 'Count Type': '' },
  ]);
  assert.equal(row.full_name, 'Sam');
  assert.equal(row.area_code, null);
  assert.equal(row.rsvp_status, 'no_response');
});

test('falls back to the participation answer for counter type', () => {
  const [row] = mapAudubonRows([
    { 'First Name': 'A', 'Last Name': 'B', Email: 'a@example.com', 'How do you plan to participate?': 'Feeder Watch' },
  ]);
  assert.equal(row.counter_type, 'Feeder Watch');
});
