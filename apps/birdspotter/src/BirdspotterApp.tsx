import { useCallback, useState } from 'react';
import type { GeolocateControl } from 'maplibre-gl';
import { About } from '@birdspotter/birding-core/About.tsx';
import { BirdingBar, BirdingScreen, type Screen } from '@birdspotter/birding-core/BirdingBar.tsx';
import { BirdingMap, type ReadyMap } from '@birdspotter/birding-core/BirdingMap.tsx';
import { EbirdKeyForm } from '@birdspotter/birding-core/EbirdKeyForm.tsx';
import { FirstRunScreen } from '@birdspotter/birding-core/FirstRunScreen.tsx';
import { Help } from '@birdspotter/birding-core/Help.tsx';
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
import { BIRDSPOTTER } from './appIdentity.ts';

type Panel = 'nearby' | 'suggestions';

const DEFAULT_BACK_DAYS = 7;

interface BirdspotterAppProps {
  readonly installPrompt: InstallPromptStore;
  readonly storage: KeyValueStorage | null;
}

function addNoLayers(): void {}

export function BirdspotterApp({ installPrompt, storage }: BirdspotterAppProps) {
  const [error, setError] = useState<string | null>(null);
  const { ebirdApiKey, saveEbirdKey } = useEbirdKey(setError);
  const [locationControl, setLocationControl] = useState<GeolocateControl | null>(null);
  const live = useLiveLocation(locationControl, storage, BIRDSPOTTER);
  const [panel, setPanel] = useState<Panel>('nearby');
  const [screen, setScreen] = useState<Screen | null>(null);
  const [settings, setSettings] = useState(() => readSettings(storage, BIRDSPOTTER.settingsStorageKey));
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
    setIsSettingsSaved(writeSettings(storage, BIRDSPOTTER.settingsStorageKey, next));
  }

  function changeKey(key: string): void {
    saveEbirdKey(key);
    setScreen(null);
  }

  return (
    <div className="birdspotter">
      {ebirdApiKey && <BirdingBar title={BIRDSPOTTER.name} onOpen={setScreen} />}
      <InstallBanner appName={BIRDSPOTTER.name} installPrompt={installPrompt} />
      {error && (
        <p className="birdspotter-error" role="alert">
          {error}
        </p>
      )}
      {ebirdApiKey ? (
        <>
          {live.error && (
            <p className="birdspotter-error" role="status">
              {live.error}
            </p>
          )}
          <BirdingMap addLayers={addNoLayers} onReady={takeMap} />
          <div className="birdspotter-tabs">
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
        </>
      ) : (
        <FirstRunScreen appName={BIRDSPOTTER.name} onSave={saveEbirdKey} onHelp={() => setScreen('help')} />
      )}
      {screen && (
        <BirdingScreen screen={screen} closeText={ebirdApiKey ? 'Back to map' : 'Back'} onClose={() => setScreen(null)}>
          {screen === 'ebird-key' && (
            <EbirdKeyForm appName={BIRDSPOTTER.name} savedKey={ebirdApiKey} onSave={changeKey} />
          )}
          {screen === 'settings' && (
            <SettingsForm
              appName={BIRDSPOTTER.name}
              settings={settings}
              isSaved={isSettingsSaved}
              isRadiusShown
              onChange={changeSettings}
            />
          )}
          {screen === 'help' && <Help appName={BIRDSPOTTER.name} />}
          {screen === 'about' && <About />}
        </BirdingScreen>
      )}
    </div>
  );
}
