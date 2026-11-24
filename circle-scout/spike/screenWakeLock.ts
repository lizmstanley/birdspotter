import { describeError } from '../../src/services/describeError.ts';
import { showStatus } from './readout.ts';

export function setUpScreenWakeLock(button: HTMLButtonElement, statusEl: HTMLElement): void {
  if (!('wakeLock' in navigator)) {
    button.disabled = true;
    showStatus(statusEl, 'fail', 'This browser has no Screen Wake Lock API.');
    return;
  }

  let isWanted = false;
  let sentinel: WakeLockSentinel | null = null;
  let requestError: string | null = null;

  function render(): void {
    button.textContent = isWanted ? 'Let screen sleep' : 'Keep screen on';
    if (requestError) return showStatus(statusEl, 'fail', requestError);
    if (sentinel && !sentinel.released) return showStatus(statusEl, 'pass', 'Screen lock held.');
    if (isWanted) return showStatus(statusEl, 'fail', 'Screen lock asked for but not held.');
    showStatus(statusEl, 'waiting', 'Tap the button to hold the screen on.');
  }

  async function acquire(): Promise<void> {
    try {
      const granted = await navigator.wakeLock.request('screen');
      if (!isWanted || (sentinel && !sentinel.released)) {
        await granted.release();
        return;
      }
      sentinel = granted;
      requestError = null;
      sentinel.addEventListener('release', render);
    } catch (err) {
      requestError = `Screen lock refused: ${describeError(err)}`;
    }
    render();
  }

  function release(): void {
    const held = sentinel;
    sentinel = null;
    held?.release().catch((err: unknown) => {
      requestError = `Screen lock release failed: ${describeError(err)}`;
      render();
    });
    render();
  }

  button.addEventListener('click', () => {
    isWanted = !isWanted;
    requestError = null;
    if (isWanted) void acquire();
    else release();
  });

  // The browser drops the lock whenever the page is hidden, so take it again on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !isWanted) return;
    if (sentinel && !sentinel.released) return;
    void acquire();
  });

  render();
}
