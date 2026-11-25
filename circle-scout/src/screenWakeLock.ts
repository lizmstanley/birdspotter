/**
 * Holds the screen on, and asks again each time the page is shown, since the browser releases the lock when it is hidden.
 * @param onUnavailable called when the browser has no wake lock or refuses it
 * @returns a function that releases the lock and stops asking
 */
export function keepScreenOn(onUnavailable: () => void): () => void {
  const wakeLock = navigator.wakeLock;
  if (!wakeLock) {
    onUnavailable();
    return () => {};
  }
  let sentinel: WakeLockSentinel | null = null;
  let isHolding = true;

  function request(): void {
    if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
    wakeLock
      .request('screen')
      .then((granted) => {
        if (isHolding) sentinel = granted;
        else void granted.release();
      })
      .catch(() => {
        if (isHolding) onUnavailable();
      });
  }

  document.addEventListener('visibilitychange', request);
  request();
  return () => {
    isHolding = false;
    document.removeEventListener('visibilitychange', request);
    void sentinel?.release();
  };
}
