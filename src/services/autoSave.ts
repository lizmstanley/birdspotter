interface WritableLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface FileHandleLike {
  name: string;
  createWritable(): Promise<WritableLike>;
  queryPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
}

type SaveFilePicker = (opts: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileHandleLike>;

export type AutoSaveStatus = 'unsupported' | 'off' | 'needs-permission' | 'on';

const IDB_NAME = 'cbc-circle-manager-autosave';
const IDB_STORE = 'handles';
const HANDLE_KEY = 'backup-file';

export function isAutoSaveSupported(): boolean {
  return typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbRequest<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const idb = await openIdb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(idb.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    idb.close();
  }
}

export async function loadHandle(): Promise<FileHandleLike | null> {
  try {
    return ((await idbRequest('readonly', (s) => s.get(HANDLE_KEY))) as FileHandleLike | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function clearHandle(): Promise<void> {
  await idbRequest('readwrite', (s) => s.delete(HANDLE_KEY));
}

/** Prompts the user for a file. Must run from a click. Returns the file handle, or null if cancelled. */
export async function chooseAutoSaveFile(): Promise<FileHandleLike | null> {
  const picker = (window as unknown as { showSaveFilePicker: SaveFilePicker }).showSaveFilePicker;
  try {
    const handle = await picker({
      suggestedName: 'cbc-circle-manager-autosave.json',
      types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }],
    });
    await idbRequest('readwrite', (s) => s.put(handle, HANDLE_KEY));
    return handle;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

export async function hasPermission(handle: FileHandleLike): Promise<boolean> {
  return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
}

/** Must run from a click. */
export async function requestPermission(handle: FileHandleLike): Promise<boolean> {
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function writeBackupFile(handle: FileHandleLike, json: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(json);
  await writable.close();
}

export type { FileHandleLike };
