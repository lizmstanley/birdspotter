import { useEffect, useState } from 'react';

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  details?: string[];
  confirmLabel: string;
  /** Optional text the user must type to unlock the destructive button (e.g., circle code) */
  requireTypedText?: string;
  /** Show a prominent warning + one-click "Export Backup First" button */
  showBackupPrompt?: boolean;
  onConfirm: () => Promise<void> | void;
}

interface Props {
  config: ConfirmDialogConfig | null;
  onClose: () => void;
  /** @returns true when the backup file was produced */
  onExportBackup: () => Promise<boolean>;
}

export function ConfirmDialog({ config, onClose, onExportBackup }: Props) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupDone, setBackupDone] = useState(false);

  useEffect(() => {
    setTyped('');
    setBusy(false);
    setBackupDone(false);
  }, [config]);

  if (!config) return null;

  const expected = config.requireTypedText?.trim() ?? '';
  const canConfirm =
    !busy &&
    (!expected || typed.trim().toUpperCase() === expected.toUpperCase());

  async function handleBackupClick() {
    setBusy(true);
    try {
      setBackupDone(await onExportBackup());
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmClick() {
    if (!canConfirm || !config) return;
    setBusy(true);
    try {
      await config.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="confirm-dialog-title">{config.title}</h2>
        </div>

        <p className="modal-message">{config.message}</p>

        {config.details && config.details.length > 0 && (
          <ul className="modal-details">
            {config.details.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        )}

        {config.showBackupPrompt && (
          <div className="modal-backup-callout">
            <div>
              <strong>Export a backup first?</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                This action permanently deletes local browser data and cannot be undone.
                Download a <code>.json</code> backup first if you may ever need this data again.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => void handleBackupClick()}
            >
              {backupDone ? 'Backup Downloaded ✓' : 'Export Backup First'}
            </button>
          </div>
        )}

        {expected && (
          <label className="modal-type-confirm">
            <span>
              Type <code>{expected}</code> to confirm:
            </span>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={expected}
              autoFocus
            />
          </label>
        )}

        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger-solid"
            disabled={!canConfirm}
            onClick={() => void handleConfirmClick()}
          >
            {busy ? 'Working...' : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
