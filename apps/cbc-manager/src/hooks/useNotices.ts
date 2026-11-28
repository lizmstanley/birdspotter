import { useEffect, useRef, useState } from 'react';

const TOAST_MILLISECONDS = 3500;

export function useNotices() {
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    },
    []
  );

  function flash(message: string) {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(null), TOAST_MILLISECONDS);
  }

  return { toast, error, setError, flash };
}

export type Flash = ReturnType<typeof useNotices>['flash'];
export type SetError = ReturnType<typeof useNotices>['setError'];
