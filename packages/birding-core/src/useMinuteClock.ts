import { useEffect, useState } from 'react';

const TICK_MS = 60_000;

/** The time now, updated once a minute while the page is in view and again as soon as it comes back into view. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const updateIfVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    const timer = window.setInterval(updateIfVisible, TICK_MS);
    document.addEventListener('visibilitychange', updateIfVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', updateIfVisible);
    };
  }, []);
  return now;
}
