import { useRef, type ChangeEvent } from 'react';
import type { ImportedParticipantRow, ImportOptions } from '../db/pgliteDb';
import { isoDay } from '../services/countDay';
import { describeError } from '../services/describeError';
import { failuresToError, type ActionContext } from './actionContext';

export function useRosterActions({ db, activeCircle, reload, flash, setError, confirm }: ActionContext) {
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  async function importRows(circleCode: string, rows: ImportedParticipantRow[], options: ImportOptions) {
    const res = await db.importParticipants(circleCode, rows, options);
    await reload();
    return res;
  }

  async function clearRoster() {
    if (!activeCircle) return;
    const code = activeCircle.code;
    confirm({
      title: `Clear Entire Roster for ${code}?`,
      message: `This permanently deletes all participants, emails, multi-year assignments, and notes for ${code}. Your circle settings and KML map boundaries will be kept.`,
      confirmLabel: 'Clear Roster',
      showBackupPrompt: true,
      onConfirm: () =>
        failuresToError(setError)(async () => {
          await db.clearCircleRoster(code);
          await reload();
          flash(`Cleared roster for ${code}. Ready to import your real spreadsheet.`);
        }),
    });
  }

  /** @returns true when the backup file was produced */
  async function downloadBackup(): Promise<boolean> {
    let json: string;
    try {
      json = await db.exportJsonBackup();
    } catch (err) {
      setError(`Backup export failed: ${describeError(err)}`);
      return false;
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `cbc-circle-manager-backup-${isoDay(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  }

  async function restoreBackup(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (backupInputRef.current) backupInputRef.current.value = '';
    if (!file) return;
    const attempt = failuresToError(setError, 'Backup restore failed: ');
    let text: string | null = null;
    await attempt(async () => {
      text = await file.text();
    });
    if (text === null) return;
    const backupText: string = text;
    confirm({
      title: `Restore Backup from ${file.name}?`,
      message:
        'Restoring replaces the participants, emails, assignments, notes, and count years of every circle in this backup file. Areas and KML map boundaries are merged, not replaced.',
      confirmLabel: 'Restore Backup',
      showBackupPrompt: true,
      onConfirm: () =>
        attempt(async () => {
          const res = await db.importJsonBackup(backupText);
          await reload();
          flash(`Restored ${res.people} people and ${res.participations} annual records from ${file.name}.`);
        }),
    });
  }

  return { backupInputRef, importRows, clearRoster, downloadBackup, restoreBackup };
}
