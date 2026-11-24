import { useState, type FormEvent } from 'react';
import { EBIRD_KEY_REQUEST_URL } from '../../src/services/ebird.ts';

export function EbirdKeyForm({ onSave }: { onSave: (key: string) => void }) {
  const [draft, setDraft] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
  }

  return (
    <form className="scout-key" onSubmit={handleSubmit}>
      <h1>Circle Scout</h1>
      <p>
        Circle Scout uses your own free eBird API key. The key stays on this phone and is sent only to
        eBird.
      </p>
      <label htmlFor="ebird-key">eBird API key</label>
      <input
        id="ebird-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="submit" disabled={!draft.trim()}>
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
