import { useState } from 'react';
import { AREA_NOTE_MAX_LENGTH } from '../services/areaLink';

interface Props {
  areaCode: string;
  savedNote: string;
  onSave: (areaCode: string, note: string) => Promise<void>;
}

/** Give it a `key` of the area and saved note, so the draft resets after a save or an area change. */
export function CounterNoteEditor({ areaCode, savedNote, onSave }: Props) {
  const [draft, setDraft] = useState(savedNote);
  const charactersLeft = AREA_NOTE_MAX_LENGTH - draft.length;
  const isOverLimit = charactersLeft < 0;
  const isUnsaved = draft !== savedNote;
  const inputId = `counter-note-${areaCode}`;

  return (
    <div className="counter-note">
      <label htmlFor={inputId}>
        <strong>Note for counters</strong>
      </label>
      <p className="muted">
        Where to meet, feeders to visit, gate codes, places to skip. Share Area puts this note in the link and QR code,
        so anyone with the link can read it.
      </p>
      <textarea
        id={inputId}
        rows={4}
        maxLength={AREA_NOTE_MAX_LENGTH}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="row-actions">
        <span className={isOverLimit ? 'counter-note-over' : 'muted'} aria-live="polite">
          {isOverLimit
            ? `${-charactersLeft} characters over the limit. Shorten the note to save it.`
            : `${charactersLeft} characters left`}
          {isUnsaved && !isOverLimit && '. Save the note to put it in the link.'}
        </span>
        <button
          type="button"
          disabled={!isUnsaved || isOverLimit}
          onClick={() => void onSave(areaCode, draft)}
        >
          Save Note
        </button>
      </div>
    </div>
  );
}
