import { useState } from 'react';
import type { SetError } from './useNotices';

const EBIRD_KEY_STORAGE = 'cbc_ebird_api_key';

function loadEbirdKey(): string {
  try {
    return localStorage.getItem(EBIRD_KEY_STORAGE)?.trim() ?? '';
  } catch {
    // Storage can be blocked (private windows, strict settings); the app then works without a saved key.
    return '';
  }
}

export function useEbirdKey(setError: SetError) {
  const [ebirdApiKey, setEbirdApiKey] = useState(loadEbirdKey);

  function saveEbirdKey(key: string) {
    const trimmed = key.trim();
    setEbirdApiKey(trimmed);
    try {
      if (trimmed) localStorage.setItem(EBIRD_KEY_STORAGE, trimmed);
      else localStorage.removeItem(EBIRD_KEY_STORAGE);
    } catch {
      setError('Your browser blocked saving the eBird key. It works until you close this tab.');
    }
  }

  return { ebirdApiKey, saveEbirdKey };
}
