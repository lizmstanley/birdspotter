import type { LocalCbcDb, SavedCircle } from '../db/pgliteDb';
import type { ConfirmDialogConfig } from '../components/ConfirmDialog';
import { describeError } from '../services/describeError';
import type { Flash, SetError } from './useNotices';

export interface ActionContext {
  db: LocalCbcDb;
  activeCircle: SavedCircle | null;
  reload: () => Promise<void>;
  flash: Flash;
  setError: SetError;
  confirm: (config: ConfirmDialogConfig) => void;
}

/** @returns a runner that shows a failed task's message as the page error */
export function failuresToError(setError: SetError, prefix = '') {
  return async (task: () => Promise<void>) => {
    try {
      await task();
    } catch (err) {
      setError(`${prefix}${describeError(err)}`);
    }
  };
}
