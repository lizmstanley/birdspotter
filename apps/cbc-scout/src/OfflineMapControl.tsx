import type { OfflineMap, OfflineMapState } from './useOfflineMap.ts';

function megabytesText(byteCount: number): string {
  return `${(byteCount / 1_000_000).toFixed(1)} MB`;
}

function statusText(state: OfflineMapState): string {
  switch (state.status) {
    case 'unsupported':
      return 'This browser cannot save the street map, so it needs a signal to draw.';
    case 'checking':
      return 'Checking for a saved street map…';
    case 'none':
      return 'The street map needs a signal to draw. Save it to see it with no signal.';
    case 'saving':
      return state.progress.total === 0
        ? 'Saving the street map…'
        : `Saving the street map: ${state.progress.done} of ${state.progress.total} files.`;
    case 'saved':
      return `Street map saved on this phone on ${new Date(state.info.savedAt).toLocaleDateString()}, ${megabytesText(state.info.byteCount)}.`;
    case 'failed':
      return state.message;
    default: {
      const unhandled: never = state;
      return unhandled;
    }
  }
}

/** The active area's saved street map: whether there is one, the download's progress, and why it stopped. */
export function OfflineMapControl({ offlineMap }: { readonly offlineMap: OfflineMap }) {
  const { state } = offlineMap;
  const canSave = state.status === 'none' || state.status === 'failed';
  return (
    <div className="scout-offline-map">
      <p role="status">{statusText(state)}</p>
      {canSave && (
        <div className="scout-actions">
          <button type="button" onClick={offlineMap.save}>
            Save street map
          </button>
        </div>
      )}
      {state.status === 'saved' && (
        <div className="scout-actions">
          <button type="button" onClick={offlineMap.remove}>
            Remove street map
          </button>
        </div>
      )}
    </div>
  );
}
