import { useState } from 'react';
import type { GeolocateControl } from 'maplibre-gl';
import { useEbirdKey } from '../../src/hooks/useEbirdKey.ts';
import { AreaPanel } from './AreaPanel.tsx';
import type { AreaStartup } from './areaStartup.ts';
import { EbirdKeyForm } from './EbirdKeyForm.tsx';
import { InstallBanner } from './InstallBanner.tsx';
import type { InstallPromptStore } from './installPrompt.ts';
import { NearbyPanel } from './NearbyPanel.tsx';
import type { AreaStorage } from './savedAreas.ts';
import { ScoutBar, ScoutScreen, type Screen } from './ScoutBar.tsx';
import { readScoutSettings, writeScoutSettings, type ScoutSettings } from './scoutSettings.ts';
import { ScoutMap } from './ScoutMap.tsx';
import { SettingsForm } from './SettingsForm.tsx';
import { useLiveLocation } from './useLiveLocation.ts';
import { useSavedAreas } from './useSavedAreas.ts';

type Panel = 'nearby' | 'area';

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
  const [locationControl, setLocationControl] = useState<GeolocateControl | null>(null);
  const live = useLiveLocation(locationControl, storage);
  // With no area yet, the counter's first job is loading one.
  const [panel, setPanel] = useState<Panel>(activeArea ? 'nearby' : 'area');
  const area = activeArea?.data ?? null;
  const [screen, setScreen] = useState<Screen | null>(null);
  const [settings, setSettings] = useState(() => readScoutSettings(storage));
  const [isSettingsSaved, setIsSettingsSaved] = useState(true);

  function changeSettings(next: ScoutSettings): void {
    setSettings(next);
    setIsSettingsSaved(writeScoutSettings(storage, next));
  }

  function changeKey(key: string): void {
    saveEbirdKey(key);
    setScreen(null);
  }

  return (
    <div className="scout">
      {ebirdApiKey && <ScoutBar onOpen={setScreen} />}
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
          <ScoutMap area={area} live={live} onLocationControl={setLocationControl} />
          <div className="scout-tabs">
            <button type="button" aria-pressed={panel === 'nearby'} onClick={() => setPanel('nearby')}>
              Nearby
            </button>
            <button type="button" aria-pressed={panel === 'area'} onClick={() => setPanel('area')}>
              Your area
            </button>
          </div>
          {/* Hidden, not unmounted, so the day range and loaded rows survive a look at the area. */}
          <div hidden={panel !== 'nearby'}>
            <NearbyPanel
              apiKey={ebirdApiKey}
              area={area}
              live={live}
              refreshMinutes={settings.refreshMinutes}
              onFixKey={() => setScreen('ebird-key')}
            />
          </div>
          {panel === 'area' && (
            <AreaPanel
              areas={areas}
              activeArea={activeArea}
              onLoadText={loadAreaText}
              onPick={pickArea}
              onRemove={removeArea}
            />
          )}
          {screen && (
            <ScoutScreen screen={screen} onClose={() => setScreen(null)}>
              {screen === 'ebird-key' && <EbirdKeyForm savedKey={ebirdApiKey} onSave={changeKey} />}
              {screen === 'settings' && <SettingsForm settings={settings} isSaved={isSettingsSaved} onChange={changeSettings} />}
            </ScoutScreen>
          )}
        </>
      ) : (
        <div className="scout-first-run">
          <h1>Circle Scout</h1>
          <EbirdKeyForm savedKey="" onSave={saveEbirdKey} />
        </div>
      )}
    </div>
  );
}
