import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, strToU8 } from 'fflate';
import { DAMAGED_LINK_MESSAGE, NEWER_LINK_MESSAGE, payloadFromText, readAreaLinkText } from './areaLinkText.ts';
import { areaPayload, SCOUT_URL } from './testing/areaFixtures.ts';

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

test('reads the payload from a link pasted with surrounding words', () => {
  const payload = areaPayload();
  assert.equal(payloadFromText(`Here is your area:\n${SCOUT_URL}#${payload}\nThanks!`), payload);
});

test('reads the payload from a link wrapped in punctuation', () => {
  const payload = areaPayload();
  const link = `${SCOUT_URL}#${payload}`;
  for (const wrapped of [`${link}.`, `<${link}>`, `(${link})`, `"${link}"`]) {
    assert.equal(payloadFromText(`Your area: ${wrapped}`), payload, wrapped);
  }
});

test('reads the area link after a plain link to the app', () => {
  const payload = areaPayload();
  assert.equal(payloadFromText(`Install ${SCOUT_URL} then open ${SCOUT_URL}#${payload}`), payload);
});

test('reads a bare payload', () => {
  const payload = areaPayload();
  assert.equal(payloadFromText(`  ${payload}  `), payload);
});

test('finds no payload in a link without data after the hash', () => {
  assert.equal(payloadFromText(SCOUT_URL), null);
  assert.equal(payloadFromText(`${SCOUT_URL}#`), null);
});

test('finds no payload in ordinary words', () => {
  assert.equal(payloadFromText('see you Saturday'), null);
});

test('reads the area from a scanned link', () => {
  const read = readAreaLinkText(`${SCOUT_URL}#${areaPayload({ areaCode: '7' })}`);
  assert.equal(read.status, 'read');
  assert.equal(read.status === 'read' && read.data.areaCode, '7');
});

test('reports a damaged link', () => {
  const payload = areaPayload();
  const read = readAreaLinkText(`${SCOUT_URL}#${payload.slice(0, payload.length - 10)}`);
  assert.deepEqual(read, { status: 'failed', message: DAMAGED_LINK_MESSAGE });
});

test('reports a link with no area as damaged', () => {
  assert.deepEqual(readAreaLinkText('hello'), { status: 'failed', message: DAMAGED_LINK_MESSAGE });
});

test('reports a link from a newer format version', () => {
  const newer = toBase64Url(deflateSync(strToU8(JSON.stringify({ v: 99 }))));
  assert.deepEqual(readAreaLinkText(`${SCOUT_URL}#${newer}`), { status: 'failed', message: NEWER_LINK_MESSAGE });
});
