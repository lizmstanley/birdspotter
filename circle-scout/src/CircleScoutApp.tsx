import { useState } from 'react';
import { useEbirdKey } from '../../src/hooks/useEbirdKey.ts';
import { EbirdKeyForm } from './EbirdKeyForm.tsx';
import { InstallBanner } from './InstallBanner.tsx';
import type { InstallPromptStore } from './installPrompt.ts';
import { ScoutMap } from './ScoutMap.tsx';

export function CircleScoutApp({ installPrompt }: { installPrompt: InstallPromptStore }) {
  const [error, setError] = useState<string | null>(null);
  const { ebirdApiKey, saveEbirdKey } = useEbirdKey(setError);

  return (
    <div className="scout">
      <InstallBanner installPrompt={installPrompt} />
      {error && (
        <p className="scout-error" role="alert">
          {error}
        </p>
      )}
      {ebirdApiKey ? <ScoutMap /> : <EbirdKeyForm onSave={saveEbirdKey} />}
    </div>
  );
}
