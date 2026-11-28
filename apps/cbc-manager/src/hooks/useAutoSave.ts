import { useEffect, useRef, useState } from 'react';
import { requestPersistentStorage } from '@birdspotter/birding-core/persistentStorage.ts';
import type { LocalCbcDb } from '../db/pgliteDb';
import {
  chooseAutoSaveFile,
  clearHandle,
  hasPermission,
  isAutoSaveSupported,
  loadHandle,
  requestPermission,
  writeBackupFile,
  type AutoSaveStatus,
  type FileHandleLike,
} from '../services/autoSave';
import { describeError } from '../services/describeError';
import type { Flash, SetError } from './useNotices';

const AUTO_SAVE_DELAY_MILLISECONDS = 1000;

export function useAutoSave(db: LocalCbcDb, setError: SetError, flash: Flash) {
  const handleRef = useRef<FileHandleLike | null>(null);
  const timerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<AutoSaveStatus>(isAutoSaveSupported() ? 'off' : 'unsupported');

  useEffect(() => {
    void requestPersistentStorage();
    void (async () => {
      try {
        const handle = await loadHandle();
        if (!handle) return;
        handleRef.current = handle;
        setStatus((await hasPermission(handle)) ? 'on' : 'needs-permission');
      } catch (err) {
        setError(`Auto-save could not resume: ${describeError(err)}`);
      }
    })();
  }, [setError]);

  async function save() {
    const handle = handleRef.current;
    if (!handle) return;
    try {
      if (!(await hasPermission(handle))) {
        if (handleRef.current === handle) setStatus('needs-permission');
        return;
      }
      await writeBackupFile(handle, await db.exportJsonBackup());
      if (handleRef.current === handle) setStatus('on');
    } catch (err) {
      setError(`Auto-save failed: ${describeError(err)}`);
    }
  }

  function scheduleSave() {
    if (!handleRef.current) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void save(), AUTO_SAVE_DELAY_MILLISECONDS);
  }

  async function toggle() {
    try {
      const existing = handleRef.current;
      if (existing && status === 'needs-permission') {
        if (await requestPermission(existing)) await save();
        return;
      }
      if (existing) {
        await clearHandle();
        handleRef.current = null;
        setStatus('off');
        flash('Auto-save turned off.');
        return;
      }
      const handle = await chooseAutoSaveFile();
      if (!handle) return;
      handleRef.current = handle;
      await save();
      flash(`Auto-saving to ${handle.name}.`);
    } catch (err) {
      setError(`Auto-save setup failed: ${describeError(err)}`);
    }
  }

  return { status, scheduleSave, toggle };
}
