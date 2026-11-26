import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeError } from './describeError.ts';
import {
  EbirdKeyRejectedError,
  EbirdKeyUnsendableError,
  EbirdRequestError,
  EbirdUnreachableError,
} from '@birdspotter/birding-core/errors.ts';
import { AudubonRequestError, InvalidCoordinatesError } from './errors.ts';

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

test('a rejected eBird key points at the Help & API Keys tab', () => {
  assert.equal(
    describeError(new EbirdKeyRejectedError('hotspots')),
    'ebird: eBird rejected the API key. Check the key on the Help & API Keys tab.'
  );
});

test('a key with a character eBird cannot take points at the Help & API Keys tab, not at the network', () => {
  const text = describeError(new EbirdKeyUnsendableError(new TypeError('not a ByteString')));
  assert.equal(text, "ebird: the API key has a character an eBird key can't have. Check the key on the Help & API Keys tab.");
  assert.notEqual(text, describeError(new EbirdUnreachableError('hotspots', new TypeError('failed to fetch'))));
});

test('a bad coordinate names the boundary it is in, when the boundary has a name', () => {
  assert.equal(
    describeError(new InvalidCoordinatesError('Area 7')),
    'kmlParser: a boundary has a coordinate that is not a valid longitude and latitude. (Area 7)'
  );
  assert.equal(
    describeError(new InvalidCoordinatesError('')),
    'kmlParser: a boundary has a coordinate that is not a valid longitude and latitude.'
  );
});

test('any other error shows its message, and a non-error shows as text', () => {
  assert.equal(describeError(new TypeError('bad input')), 'bad input');
  assert.equal(describeError('plain text'), 'plain text');
});
