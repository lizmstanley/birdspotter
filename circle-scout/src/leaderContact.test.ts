import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailHref, phoneHref } from './leaderContact.ts';

test('a phone number becomes a tel link with only dialable characters', () => {
  assert.equal(phoneHref('+1 (612) 555-0100'), 'tel:+16125550100');
});

test('a phone with no digits gets no link', () => {
  assert.equal(phoneHref('call the office'), null);
});

test('text that tries another scheme gets no link', () => {
  assert.equal(phoneHref('javascript:alert(1)'), null);
});

test('a number with an extension or a second number gets no link', () => {
  assert.equal(phoneHref('612-555-0100 ext. 22'), null);
  assert.equal(phoneHref('612-555-0100 or 612-555-0199'), null);
});

test('a plain email becomes a mailto link', () => {
  assert.equal(emailHref(' pat@example.test '), 'mailto:pat@example.test');
});

test('an email carrying prefilled fields gets no link', () => {
  assert.equal(emailHref('pat@example.test?subject=hi'), null);
  assert.equal(emailHref('not an email'), null);
});
