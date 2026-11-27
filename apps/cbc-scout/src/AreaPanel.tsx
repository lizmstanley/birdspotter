import { useState, type FormEvent } from 'react';
import type { AreaLeader, AreaLinkData } from '@birdspotter/cbc-manager/services/areaLink.ts';
import { areaName } from './areaName.ts';
import { AreaScanner } from './AreaScanner.tsx';
import { emailHref, phoneHref } from './leaderContact.ts';
import { OfflineMapControl } from './OfflineMapControl.tsx';
import type { SavedArea } from './savedAreas.ts';
import type { OfflineMap } from './useOfflineMap.ts';
import type { AreaLinkSource } from './useSavedAreas.ts';

type Entry = 'none' | 'paste' | 'scan';

interface AreaPanelProps {
  readonly areas: readonly SavedArea[];
  readonly activeArea: SavedArea | null;
  /** The active area's saved street map. */
  readonly offlineMap: OfflineMap;
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

/** The area's name, its leaders, and the compiler's note, as the link carries them. */
export function AreaDetails({ area }: { readonly area: AreaLinkData }) {
  return (
    <>
      <h2>{areaName(area)}</h2>
      <LeaderList leaders={area.leaders} />
      {area.note && <p className="scout-area-note">{area.note}</p>}
    </>
  );
}

interface SavedAreaCardProps {
  readonly area: SavedArea;
  /** Set only on the active area's card. */
  readonly offlineMap: OfflineMap | null;
  readonly onPick: (key: string) => void;
  readonly onRemove: (key: string) => void;
}

function SavedAreaCard({ area, offlineMap, onPick, onRemove }: SavedAreaCardProps) {
  function handleRemove() {
    const isConfirmed = window.confirm(
      `Remove ${areaName(area.data)} and its saved street map from this phone? You will need its link or code to load it again.`
    );
    if (isConfirmed) onRemove(area.key);
  }

  return (
    <li className="scout-area-card">
      <AreaDetails area={area.data} />
      {offlineMap && <OfflineMapControl offlineMap={offlineMap} />}
      <div className="scout-actions">
        {offlineMap ? (
          <span className="scout-area-active">Active area</span>
        ) : (
          <button type="button" onClick={() => onPick(area.key)}>
            Make active
          </button>
        )}
        <button type="button" onClick={handleRemove}>
          Remove area
        </button>
      </div>
    </li>
  );
}

/** @returns the active area first, then the rest, latest loaded first */
function activeFirst(areas: readonly SavedArea[], activeKey: string | null): SavedArea[] {
  const latestFirst = [...areas].reverse();
  return [...latestFirst.filter((area) => area.key === activeKey), ...latestFirst.filter((area) => area.key !== activeKey)];
}

export function AreaPanel({ areas, activeArea, offlineMap, onLoadText, onPick, onRemove }: AreaPanelProps) {
  const [entry, setEntry] = useState<Entry>('none');
  const closeEntry = () => setEntry('none');

  return (
    <div className="scout-areas">
      {areas.length === 0 ? (
        <p>No area loaded. Open the link from your compiler, paste it, or scan its QR code.</p>
      ) : (
        <ul className="scout-area-list">
          {activeFirst(areas, activeArea?.key ?? null).map((area) => (
            <SavedAreaCard
              key={area.key}
              area={area}
              offlineMap={area.key === activeArea?.key ? offlineMap : null}
              onPick={onPick}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
      {entry === 'none' && (
        <div className="scout-actions">
          <button type="button" onClick={() => setEntry('paste')}>
            Paste link
          </button>
          <button type="button" onClick={() => setEntry('scan')}>
            Scan QR code
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
    </div>
  );
}
