import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchInstallPrompt } from './installPrompt.ts';

function promptEvent() {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  let promptCount = 0;
  Object.assign(event, {
    prompt: async () => {
      promptCount += 1;
    },
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  return { event, promptCount: () => promptCount };
}

function setUp() {
  const target = new EventTarget();
  const store = watchInstallPrompt(target as unknown as Window);
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });
  return { target, store, notifications: () => notifications };
}

test('holds the prompt and stops the browser showing its own', () => {
  const { target, store, notifications } = setUp();
  const { event } = promptEvent();
  target.dispatchEvent(event);
  assert.equal(store.hasPrompt(), true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(notifications(), 1);
});

test('install shows the held prompt once and then drops it', async () => {
  const { target, store } = setUp();
  const held = promptEvent();
  target.dispatchEvent(held.event);
  await store.install();
  await store.install();
  assert.equal(held.promptCount(), 1);
  assert.equal(store.hasPrompt(), false);
});

test('drops the prompt when the app is installed some other way', () => {
  const { target, store, notifications } = setUp();
  target.dispatchEvent(promptEvent().event);
  target.dispatchEvent(new Event('appinstalled'));
  assert.equal(store.hasPrompt(), false);
  assert.equal(notifications(), 2);
});

test('stops notifying a listener after it unsubscribes', () => {
  const target = new EventTarget();
  const store = watchInstallPrompt(target as unknown as Window);
  let calls = 0;
  const unsubscribe = store.subscribe(() => {
    calls += 1;
  });
  unsubscribe();
  target.dispatchEvent(promptEvent().event);
  assert.equal(calls, 0);
});
