import { useState, type FormEvent } from 'react';
import type { AreaLeader } from '../../src/services/areaLink.ts';
import { areaName } from './areaName.ts';
import { AreaScanner } from './AreaScanner.tsx';
import { emailHref, phoneHref } from './leaderContact.ts';
import type { SavedArea } from './savedAreas.ts';
import type { AreaLinkSource } from './useSavedAreas.ts';

type Entry = 'none' | 'paste' | 'scan';

interface AreaPanelProps {
  readonly areas: readonly SavedArea[];
  readonly activeArea: SavedArea | null;
  readonly onLoadText: (text: string, source: AreaLinkSource) => boolean;
  readonly onPick: (key: string) => void;
  readonly onRemove: (key: string) => void;
}

function ContactLink({ href, text }: { readonly href: string | null; readonly text: string }) {
  return href ? <a href={href}>{text}</a> : <span>{text}</span>;
}

function LeaderList({ leaders }: { readonly leaders: readonly AreaLeader[] }) {
  if (leaders.length === 0) return null;
  return (
    <ul className="scout-leaders">
      {leaders.map((leader, index) => (
        <li key={index}>
          <strong>{leader.name}</strong>, area leader
          {leader.phone && <ContactLink href={phoneHref(leader.phone)} text={leader.phone} />}
          {leader.email && <ContactLink href={emailHref(leader.email)} text={leader.email} />}
        </li>
      ))}
    </ul>
  );
}

function canReadClipboard(): boolean {
  return typeof navigator.clipboard?.readText === 'function';
}

function PasteForm({ onLoad, onClose }: { readonly onLoad: (text: string) => boolean; readonly onClose: () => void }) {
  const [draft, setDraft] = useState('');
  const [hint, setHint] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onLoad(draft)) onClose();
  }

  async function handleClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      setDraft(text);
      if (onLoad(text)) onClose();
    } catch {
      setHint('CBC Scout could not read the clipboard. Paste the link into the box instead.');
    }
  }

  return (
    <form className="scout-paste" onSubmit={handleSubmit}>
      <label htmlFor="area-link">Area link</label>
      <textarea
        id="area-link"
        rows={3}
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      {hint && <p>{hint}</p>}
      <div className="scout-actions">
        <button type="submit" disabled={!draft.trim()}>
          Load
        </button>
        {canReadClipboard() && (
          <button type="button" onClick={() => void handleClipboard()}>
            Paste from clipboard
          </button>
        )}
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function AreaPicker({ areas, activeArea, onPick, onRemove }: Omit<AreaPanelProps, 'onLoadText'>) {
  if (areas.length === 0) return null;

  function handleRemove() {
    if (!activeArea) return;
    const isConfirmed = window.confirm(
      `Remove ${areaName(activeArea.data)} from this phone? You will need its link or code to load it again.`
    );
    if (isConfirmed) onRemove(activeArea.key);
  }

  return (
    <div className="scout-actions">
      {areas.length > 1 && (
        <select aria-label="Active area" value={activeArea?.key ?? ''} onChange={(event) => onPick(event.target.value)}>
          {areas.map((area) => (
            <option key={area.key} value={area.key}>
              {areaName(area.data)}
            </option>
          ))}
        </select>
      )}
      {activeArea && (
        <button type="button" onClick={handleRemove}>
          Remove area
        </button>
      )}
    </div>
  );
}

export function AreaPanel({ areas, activeArea, onLoadText, onPick, onRemove }: AreaPanelProps) {
  const [entry, setEntry] = useState<Entry>('none');
  const closeEntry = () => setEntry('none');

  return (
    <section className="scout-area" aria-label="Your area">
      {activeArea ? (
        <>
          <h1>{areaName(activeArea.data)}</h1>
          <LeaderList leaders={activeArea.data.leaders} />
        </>
      ) : (
        <p>No area loaded. Open the link from your compiler, paste it, or scan its code.</p>
      )}
      <AreaPicker areas={areas} activeArea={activeArea} onPick={onPick} onRemove={onRemove} />
      {entry === 'none' && (
        <div className="scout-actions">
          <button type="button" onClick={() => setEntry('paste')}>
            Paste link
          </button>
          <button type="button" onClick={() => setEntry('scan')}>
            Scan area code
          </button>
        </div>
      )}
      {entry === 'paste' && <PasteForm onLoad={(text) => onLoadText(text, 'paste')} onClose={closeEntry} />}
      {entry === 'scan' && (
        <AreaScanner
          onRead={(text) => {
            onLoadText(text, 'scan');
            closeEntry();
          }}
          onClose={closeEntry}
        />
      )}
    </section>
  );
}
