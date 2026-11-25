import { useState, type FormEvent } from 'react';
import { EBIRD_KEY_REQUEST_URL } from '../../src/services/ebird.ts';

interface EbirdKeyFormProps {
  /** The saved key, or empty when there is none. */
  readonly savedKey: string;
  readonly onSave: (key: string) => void;
}

function EyeIcon({ isCrossed }: { isCrossed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {isCrossed && <path d="M3 3l18 18" />}
    </svg>
  );
}

export function EbirdKeyForm({ savedKey, onSave }: EbirdKeyFormProps) {
  const [draft, setDraft] = useState(savedKey);
  const [isShown, setIsShown] = useState(false);
  const isChanged = draft.trim() !== savedKey;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
  }

  return (
    <form className="scout-key" onSubmit={handleSubmit}>
      <p>
        CBC Scout uses your own free eBird API key. The key stays on this phone and is sent only to
        eBird.
      </p>
      <label htmlFor="ebird-key">eBird API key</label>
      <div className="scout-key-field">
        <input
          id="ebird-key"
          type={isShown ? 'text' : 'password'}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="button"
          className="scout-key-toggle"
          aria-label={isShown ? 'Hide key' : 'Show key'}
          aria-controls="ebird-key"
          onClick={() => setIsShown((shown) => !shown)}
        >
          <EyeIcon isCrossed={isShown} />
        </button>
      </div>
      <button type="submit" disabled={!isChanged || !draft.trim()}>
        Save key
      </button>
      <p>
        No key yet? Sign in to eBird and request one on the{' '}
        <a href={EBIRD_KEY_REQUEST_URL} target="_blank" rel="noreferrer">
          eBird API key request page
        </a>
        . It shows up right away.
      </p>
    </form>
  );
}
