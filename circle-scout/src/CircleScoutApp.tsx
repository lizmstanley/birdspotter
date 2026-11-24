import { useState } from 'react';
import { useEbirdKey } from '../../src/hooks/useEbirdKey.ts';
import { AreaPanel } from './AreaPanel.tsx';
import type { AreaStartup } from './areaStartup.ts';
import { EbirdKeyForm } from './EbirdKeyForm.tsx';
import { InstallBanner } from './InstallBanner.tsx';
import type { InstallPromptStore } from './installPrompt.ts';
import type { AreaStorage } from './savedAreas.ts';
import { ScoutMap } from './ScoutMap.tsx';
import { useSavedAreas } from './useSavedAreas.ts';

interface CircleScoutAppProps {
  readonly installPrompt: InstallPromptStore;
  readonly areaStartup: AreaStartup;
  readonly storage: AreaStorage | null;
}

export function CircleScoutApp({ installPrompt, areaStartup, storage }: CircleScoutAppProps) {
  const [error, setError] = useState<string | null>(areaStartup.error);
  const [notice, setNotice] = useState<string | null>(areaStartup.notice);
  const { ebirdApiKey, saveEbirdKey } = useEbirdKey(setError);
  const { areas, activeArea, loadAreaText, pickArea, removeArea } = useSavedAreas({
    startup: areaStartup,
    storage,
    setError,
    setNotice,
  });

  return (
    <div className="scout">
      <InstallBanner installPrompt={installPrompt} />
      {error && (
        <p className="scout-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="scout-notice" role="status">
          {notice}
        </p>
      )}
      {ebirdApiKey ? (
        <>
          <ScoutMap area={activeArea?.data ?? null} storage={storage} />
          <AreaPanel
            areas={areas}
            activeArea={activeArea}
            onLoadText={loadAreaText}
            onPick={pickArea}
            onRemove={removeArea}
          />
        </>
      ) : (
        <EbirdKeyForm onSave={saveEbirdKey} />
      )}
    </div>
  );
}
