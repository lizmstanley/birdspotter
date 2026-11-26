import { useState } from 'react';

const TOAST_MILLISECONDS = 3500;

export function useNotices() {
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), TOAST_MILLISECONDS);
  }

  return { toast, error, setError, flash };
}

export type Flash = ReturnType<typeof useNotices>['flash'];
export type SetError = ReturnType<typeof useNotices>['setError'];
