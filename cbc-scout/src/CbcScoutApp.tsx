import { useMemo, useState } from 'react';
import type { GeolocateControl } from 'maplibre-gl';
import { useEbirdKey } from '../../src/hooks/useEbirdKey.ts';
import { buildCirclePolygon } from '../../src/services/ebird.ts';
import { AreaPanel } from './AreaPanel.tsx';
import type { AreaStartup } from './areaStartup.ts';
import { EbirdKeyForm } from './EbirdKeyForm.tsx';
import { InstallBanner } from './InstallBanner.tsx';
import type { InstallPromptStore } from './installPrompt.ts';
import { isInAreaTest } from './nearby.ts';
import { NearbyPanel } from './NearbyPanel.tsx';
import type { AreaStorage } from './savedAreas.ts';
import { ScoutBar, ScoutScreen, type Screen } from './ScoutBar.tsx';
import { readScoutSettings, writeScoutSettings, type ScoutSettings } from './scoutSettings.ts';
import { ScoutMap } from './ScoutMap.tsx';
import { SettingsForm } from './SettingsForm.tsx';
import { SuggestionsPanel } from './SuggestionsPanel.tsx';
import { useLiveLocation } from './useLiveLocation.ts';
import { useNearbyData } from './useNearbyData.ts';
import { useSavedAreas } from './useSavedAreas.ts';

type Panel = 'nearby' | 'suggestions' | 'area';

const DEFAULT_BACK_DAYS = 7;

interface CbcScoutAppProps {
  readonly installPrompt: InstallPromptStore;
  readonly areaStartup: AreaStartup;
  readonly storage: AreaStorage | null;
}

export function CbcScoutApp({ installPrompt, areaStartup, storage }: CbcScoutAppProps) {
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
  const [backDays, setBackDays] = useState(DEFAULT_BACK_DAYS);
  // Above both tabs, so Nearby and Suggestions share one load.
  const nearby = useNearbyData(ebirdApiKey, area, live.position, backDays, settings.refreshMinutes * 60 * 1000);
  const isInArea = useMemo(() => (area ? isInAreaTest(area, buildCirclePolygon(...area.circleCenter)) : null), [area]);

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
          <ScoutMap
            area={area}
            live={live}
            onLocationControl={setLocationControl}
            storage={storage}
            setError={setError}
            setNotice={setNotice}
          />
          <div className="scout-tabs">
            <button type="button" aria-pressed={panel === 'nearby'} onClick={() => setPanel('nearby')}>
              Nearby
            </button>
            <button type="button" aria-pressed={panel === 'suggestions'} onClick={() => setPanel('suggestions')}>
              Suggestions
            </button>
            <button type="button" aria-pressed={panel === 'area'} onClick={() => setPanel('area')}>
              Your area
            </button>
          </div>
          {panel === 'nearby' && (
            <NearbyPanel
              area={area}
              isInArea={isInArea}
              data={nearby}
              live={live}
              backDays={backDays}
              onBackDaysChange={setBackDays}
              refreshMinutes={settings.refreshMinutes}
              onFixKey={() => setScreen('ebird-key')}
            />
          )}
          {panel === 'suggestions' && (
            <SuggestionsPanel
              area={area}
              isInArea={isInArea}
              data={nearby}
              live={live}
              backDays={backDays}
              refreshMinutes={settings.refreshMinutes}
              onFixKey={() => setScreen('ebird-key')}
            />
          )}
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
          <h1>CBC Scout</h1>
          <EbirdKeyForm savedKey="" onSave={saveEbirdKey} />
        </div>
      )}
    </div>
  );
}
