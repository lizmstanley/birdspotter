import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeError } from './describeError.ts';
import { AudubonRequestError, EbirdRequestError } from './errors.ts';

test('a failed eBird or Audubon request shows its HTTP status', () => {
  assert.equal(
    describeError(new EbirdRequestError('hotspots', 429, 'slow down')),
    'ebird: the hotspots request failed. (HTTP 429)'
  );
  assert.equal(
    describeError(new AudubonRequestError('MNBL', 500)),
    'audubonCirclePage: the circle page request failed. (HTTP 500)'
  );
});

test('any other error shows its message, and a non-error shows as text', () => {
  assert.equal(describeError(new TypeError('bad input')), 'bad input');
  assert.equal(describeError('plain text'), 'plain text');
});
