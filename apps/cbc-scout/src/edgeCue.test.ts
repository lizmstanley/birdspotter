import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createEdgeCuePlayer } from './edgeCue.ts';

afterEach(() => {
  Reflect.deleteProperty(globalThis.navigator, 'vibrate');
  Reflect.deleteProperty(globalThis, 'document');
});

test('buzzes once inward and twice outward where the browser can vibrate', () => {
  const patterns: number[][] = [];
  Object.defineProperty(globalThis.navigator, 'vibrate', {
    configurable: true,
    value: (pattern: number[]) => patterns.push(pattern) > 0,
  });
  const player = createEdgeCuePlayer();
  player.play('inward');
  player.play('outward');
  assert.deepEqual(patterns, [[200], [200, 150, 200]]);
});

test('with no vibration, listens for the tap that unlocks sound until closed', () => {
  const listening = new Set<string>();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      addEventListener: (type: string) => listening.add(type),
      removeEventListener: (type: string) => listening.delete(type),
    },
  });
  const player = createEdgeCuePlayer();
  const whileOpen = [...listening].sort();
  player.play('outward');
  player.close();
  assert.deepEqual([whileOpen, [...listening]], [['click', 'keydown', 'touchend'], []]);
});
