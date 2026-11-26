import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countCountersByArea, emailsNotOnList, emailsOf } from './rosterSummary.ts';

test('counts counters per area ignoring case and skipping unassigned people', () => {
  const counts = countCountersByArea([{ area: '3a' }, { area: '3A' }, { area: null }, { area: '4' }]);
  assert.deepEqual(counts, { '3A': 2, '4': 1 });
});

test('emails drop rows with no email', () => {
  assert.deepEqual(emailsOf([{ email: 'a@x.org' }, { email: null }, { email: '' }]), ['a@x.org']);
});

test('not-on-list emails leave out old-email rows', () => {
  const emails = emailsNotOnList([
    { reason: 'not_on_list', email: 'a@x.org' },
    { reason: 'old_email', email: 'b@x.org' },
    { reason: 'not_on_list', email: null },
  ]);
  assert.deepEqual(emails, ['a@x.org']);
});
