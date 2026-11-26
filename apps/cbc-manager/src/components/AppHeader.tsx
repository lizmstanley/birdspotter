import type { ChangeEvent, RefObject } from 'react';
import type { SavedCircle } from '../db/pgliteDb';
import type { AutoSaveStatus } from '../services/autoSave';
import { DISCUSSIONS_URL } from './HelpPage';

interface Props {
  activeCircle: SavedCircle | null;
  savedCircles: readonly SavedCircle[];
  autoSaveStatus: AutoSaveStatus;
  backupInputRef: RefObject<HTMLInputElement | null>;
  onSelectCircle: (code: string) => void;
  onToggleAddCircle: () => void;
  onRenameCircle: () => void;
  onDeleteCircle: () => void;
  onShare: () => void;
  onExportBackup: () => void;
  onRestoreBackup: (e: ChangeEvent<HTMLInputElement>) => void;
  onAutoSaveClick: () => void;
}

const AUTO_SAVE_TITLES: Record<AutoSaveStatus, string> = {
  on: 'Auto-Save is on: the backup file on your computer is rewritten after every change. Click to turn it off.',
  'needs-permission': 'The browser needs your OK again to write the backup file. Click to allow it.',
  off: 'Pick a file on your computer, and the app keeps a backup in it up to date after every change. Chrome and Edge only.',
  unsupported: '',
};

const AUTO_SAVE_LABELS: Record<AutoSaveStatus, string> = {
  on: 'Auto-Save: On',
  'needs-permission': 'Auto-Save: Reconnect',
  off: 'Auto-Save: Off',
  unsupported: '',
};

export function AppHeader({
  activeCircle,
  savedCircles,
  autoSaveStatus,
  backupInputRef,
  onSelectCircle,
  onToggleAddCircle,
  onRenameCircle,
  onDeleteCircle,
  onShare,
  onExportBackup,
  onRestoreBackup,
  onAutoSaveClick,
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar-actions">
        <a
          className="topbar-link"
          href={DISCUSSIONS_URL}
          target="_blank"
          rel="noreferrer"
          title="Questions, ideas, or something not working? Tell me on GitHub Discussions. Opens in a new tab."
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Feedback
        </a>
        <button
          type="button"
          className="topbar-link"
          title="Share a link to this app with another compiler. Your data isn't shared."
          onClick={onShare}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="m8.59 13.51 6.83 3.98" />
            <path d="m15.41 6.51-6.82 3.98" />
          </svg>
          Share
        </button>
      </div>
      <div className="brand">
        <img className="brand-mark" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="44" height="44" />
        <div>
          <h1>CBC Circle Manager</h1>
          <p className="subtitle">
            {activeCircle ? `${activeCircle.code} — ${activeCircle.name}` : 'Local-First PostgreSQL (PGlite)'}
          </p>
        </div>
      </div>

      <div className="controls">
        <label className="circle-selector-label">
          <span>My Circles:</span>
          <select
            aria-label="My Circles"
            title="The circle you're working on. Every tab shows data for this circle only."
            value={activeCircle?.code ?? ''}
            onChange={(e) => onSelectCircle(e.target.value)}
            disabled={savedCircles.length === 0}
          >
            {savedCircles.length === 0 && <option value="">Add a circle</option>}
            {savedCircles.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn-primary"
          type="button"
          title="Add another count circle by Audubon code, place search, KML file, or coordinates"
          onClick={onToggleAddCircle}
        >
          + Add Circle
        </button>
        {activeCircle && (
          <button
            type="button"
            title="Change the circle's display name. The circle code stays the same."
            onClick={onRenameCircle}
          >
            Rename
          </button>
        )}
        {activeCircle && savedCircles.length > 1 && (
          <button
            type="button"
            title="Permanently delete this circle and all its people, areas, notes, and map outlines from this browser"
            onClick={onDeleteCircle}
          >
            Delete Circle
          </button>
        )}
        <input
          ref={backupInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={onRestoreBackup}
        />
        <button
          title="Download a .json file with every circle, person, season, note, and map outline. Your data lives only in this browser, so keep a copy."
          onClick={onExportBackup}
        >
          Export Backup
        </button>
        <button
          title="Load a .json backup. It replaces the roster of each circle in the file. You confirm first."
          onClick={() => backupInputRef.current?.click()}
        >
          Restore Backup
        </button>
        {autoSaveStatus !== 'unsupported' && (
          <button type="button" onClick={onAutoSaveClick} title={AUTO_SAVE_TITLES[autoSaveStatus]}>
            {AUTO_SAVE_LABELS[autoSaveStatus]}
          </button>
        )}
      </div>
    </header>
  );
}
