import { useCallback, useState } from 'react';
import type { GeolocateControl } from 'maplibre-gl';
import { BirdingMap, type ReadyMap } from '@birdspotter/birding-core/BirdingMap.tsx';
import { EbirdKeyForm } from '@birdspotter/birding-core/EbirdKeyForm.tsx';
import { InstallBanner } from '@birdspotter/birding-core/InstallBanner.tsx';
import type { InstallPromptStore } from '@birdspotter/birding-core/installPrompt.ts';
import { NearbyPanel } from '@birdspotter/birding-core/NearbyPanel.tsx';
import { readSettings, writeSettings, type BirdingSettings } from '@birdspotter/birding-core/settings.ts';
import { SettingsForm } from '@birdspotter/birding-core/SettingsForm.tsx';
import type { KeyValueStorage } from '@birdspotter/birding-core/storage.ts';
import { SuggestionsPanel } from '@birdspotter/birding-core/SuggestionsPanel.tsx';
import { useEbirdKey } from '@birdspotter/birding-core/useEbirdKey.ts';
import { useLiveLocation } from '@birdspotter/birding-core/useLiveLocation.ts';
import { useNearbyData } from '@birdspotter/birding-core/useNearbyData.ts';
import { AppBar, AppScreen, type Screen } from './AppBar.tsx';
import { LETS_GO_BIRDING } from './appIdentity.ts';

type Panel = 'nearby' | 'suggestions';

const DEFAULT_BACK_DAYS = 7;

interface LetsGoBirdingAppProps {
  readonly installPrompt: InstallPromptStore;
  readonly storage: KeyValueStorage | null;
}

function addNoLayers(): void {}

export function LetsGoBirdingApp({ installPrompt, storage }: LetsGoBirdingAppProps) {
  const [error, setError] = useState<string | null>(null);
  const { ebirdApiKey, saveEbirdKey } = useEbirdKey(setError);
  const [locationControl, setLocationControl] = useState<GeolocateControl | null>(null);
  const live = useLiveLocation(locationControl, storage, LETS_GO_BIRDING);
  const [panel, setPanel] = useState<Panel>('nearby');
  const [screen, setScreen] = useState<Screen | null>(null);
  const [settings, setSettings] = useState(() => readSettings(storage, LETS_GO_BIRDING.settingsStorageKey));
  const [isSettingsSaved, setIsSettingsSaved] = useState(true);
  const [backDays, setBackDays] = useState(DEFAULT_BACK_DAYS);
  // Above both tabs, so Nearby and Suggestions share one load.
  const nearby = useNearbyData(
    ebirdApiKey,
    null,
    live.position,
    settings.radiusMiles,
    backDays,
    settings.refreshMinutes * 60 * 1000
  );
  const takeMap = useCallback((ready: ReadyMap | null) => setLocationControl(ready?.locationControl ?? null), []);

  function changeSettings(next: BirdingSettings): void {
    setSettings(next);
    setIsSettingsSaved(writeSettings(storage, LETS_GO_BIRDING.settingsStorageKey, next));
  }

  function changeKey(key: string): void {
    saveEbirdKey(key);
    setScreen(null);
  }

  return (
    <div className="lgb">
      {ebirdApiKey && <AppBar onOpen={setScreen} />}
      <InstallBanner appName={LETS_GO_BIRDING.name} installPrompt={installPrompt} />
      {error && (
        <p className="lgb-error" role="alert">
          {error}
        </p>
      )}
      {ebirdApiKey ? (
        <>
          {live.error && (
            <p className="lgb-error" role="status">
              {live.error}
            </p>
          )}
          <BirdingMap addLayers={addNoLayers} onReady={takeMap} />
          <div className="lgb-tabs">
            <button type="button" aria-pressed={panel === 'nearby'} onClick={() => setPanel('nearby')}>
              Nearby
            </button>
            <button type="button" aria-pressed={panel === 'suggestions'} onClick={() => setPanel('suggestions')}>
              Suggestions
            </button>
          </div>
          {panel === 'nearby' && (
            <NearbyPanel
              isInRegion={null}
              groupTitles={null}
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
              isInRegion={null}
              birdsRegion={null}
              data={nearby}
              live={live}
              backDays={backDays}
              refreshMinutes={settings.refreshMinutes}
              onFixKey={() => setScreen('ebird-key')}
            />
          )}
          {screen && (
            <AppScreen screen={screen} onClose={() => setScreen(null)}>
              {screen === 'ebird-key' && (
                <EbirdKeyForm appName={LETS_GO_BIRDING.name} savedKey={ebirdApiKey} onSave={changeKey} />
              )}
              {screen === 'settings' && (
                <SettingsForm
                  appName={LETS_GO_BIRDING.name}
                  settings={settings}
                  isSaved={isSettingsSaved}
                  isRadiusShown
                  onChange={changeSettings}
                />
              )}
            </AppScreen>
          )}
        </>
      ) : (
        <div className="lgb-first-run">
          <h1>{LETS_GO_BIRDING.name}</h1>
          <EbirdKeyForm appName={LETS_GO_BIRDING.name} savedKey="" onSave={saveEbirdKey} />
        </div>
      )}
    </div>
  );
}
