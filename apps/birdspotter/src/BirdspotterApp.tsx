import { useCallback, useState } from 'react';
import type { GeolocateControl, Map as MapLibreMap } from 'maplibre-gl';
import { About } from '@birdspotter/birding-core/About.tsx';
import { BirdingBar, BirdingScreen } from '@birdspotter/birding-core/BirdingBar.tsx';
import { BirdingMap, type ReadyMap } from '@birdspotter/birding-core/BirdingMap.tsx';
import { EbirdKeyForm } from '@birdspotter/birding-core/EbirdKeyForm.tsx';
import { FirstRunScreen } from '@birdspotter/birding-core/FirstRunScreen.tsx';
import { Help } from '@birdspotter/birding-core/Help.tsx';
import { InstallBanner } from '@birdspotter/birding-core/InstallBanner.tsx';
import type { InstallPromptStore } from '@birdspotter/birding-core/installPrompt.ts';
import type { LngLat } from '@birdspotter/birding-core/nearby.ts';
import { NearbyPanel } from '@birdspotter/birding-core/NearbyPanel.tsx';
import type { Screen } from '@birdspotter/birding-core/screens.ts';
import { readSettings, writeSettings, type BirdingSettings } from '@birdspotter/birding-core/settings.ts';
import { SettingsForm } from '@birdspotter/birding-core/SettingsForm.tsx';
import type { KeyValueStorage } from '@birdspotter/birding-core/storage.ts';
import { SuggestionsPanel } from '@birdspotter/birding-core/SuggestionsPanel.tsx';
import { useEbirdKey } from '@birdspotter/birding-core/useEbirdKey.ts';
import { useLiveLocation } from '@birdspotter/birding-core/useLiveLocation.ts';
import { useNearbyData } from '@birdspotter/birding-core/useNearbyData.ts';
import { BIRDSPOTTER } from './appIdentity.ts';
import { BirdspotterHelp } from './BirdspotterHelp.tsx';
import { useChosenPlaceMarker } from './useChosenPlaceMarker.ts';

type Panel = 'sightings' | 'hotspots';

// The privacy page sits at the site root, one folder above app/.
const PRIVACY_URL = `${import.meta.env.BASE_URL}../privacy/`;

interface BirdspotterAppProps {
  readonly installPrompt: InstallPromptStore;
  readonly storage: KeyValueStorage | null;
}

export function BirdspotterApp({ installPrompt, storage }: BirdspotterAppProps) {
  const [error, setError] = useState<string | null>(null);
  const { ebirdApiKey, saveEbirdKey } = useEbirdKey(setError);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [locationControl, setLocationControl] = useState<GeolocateControl | null>(null);
  const live = useLiveLocation(locationControl, storage, BIRDSPOTTER);
  const [chosenPlace, setChosenPlace] = useState<LngLat | null>(null);
  const origin = chosenPlace ?? live.position;
  const [panel, setPanel] = useState<Panel>('sightings');
  const [screen, setScreen] = useState<Screen | null>(null);
  const [settings, setSettings] = useState(() => readSettings(storage, BIRDSPOTTER.settingsStorageKey));
  const [isSettingsSaved, setIsSettingsSaved] = useState(true);
  // Above both tabs, so Sightings and Hotspots share one load.
  const nearby = useNearbyData(
    ebirdApiKey,
    chosenPlace ? { center: chosenPlace, radiusMiles: settings.radiusMiles } : null,
    live.position,
    settings.radiusMiles,
    settings.backDays,
    settings.refreshMinutes * 60 * 1000
  );
  const takeMap = useCallback((ready: ReadyMap | null) => {
    setMap(ready?.map ?? null);
    setLocationControl(ready?.locationControl ?? null);
  }, []);
  useChosenPlaceMarker(map, chosenPlace);

  function lookAtMapCenter(): void {
    if (!map) return;
    const { lng, lat } = map.getCenter();
    setChosenPlace([lng, lat]);
  }

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
          <div className="birdspotter-map">
            <BirdingMap onReady={takeMap} data={nearby} origin={origin} />
            <button type="button" className="birdspotter-look-here" disabled={!map} onClick={lookAtMapCenter}>
              Look here
            </button>
          </div>
          {chosenPlace && (
            <div className="birdspotter-place" role="status">
              <p>The lists are around the place marked on the map.</p>
              <button type="button" onClick={() => setChosenPlace(null)}>
                Near me
              </button>
            </div>
          )}
          <div className="birdspotter-tabs">
            <button type="button" aria-pressed={panel === 'sightings'} onClick={() => setPanel('sightings')}>
              Sightings
            </button>
            <button type="button" aria-pressed={panel === 'hotspots'} onClick={() => setPanel('hotspots')}>
              Hotspots
            </button>
          </div>
          {panel === 'sightings' && (
            <NearbyPanel
              isInRegion={null}
              groupTitles={null}
              data={nearby}
              live={live}
              origin={origin}
              backDays={settings.backDays}
              onBackDaysChange={(backDays) => changeSettings({ ...settings, backDays })}
              refreshMinutes={settings.refreshMinutes}
              onFixKey={() => setScreen('ebird-key')}
            />
          )}
          {panel === 'hotspots' && (
            <SuggestionsPanel
              isInRegion={null}
              data={nearby}
              live={live}
              origin={origin}
              backDays={settings.backDays}
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
          {screen === 'help' && (
            <Help appName={BIRDSPOTTER.name} privacyUrl={PRIVACY_URL}>
              <BirdspotterHelp />
            </Help>
          )}
          {screen === 'about' && <About />}
        </BirdingScreen>
      )}
    </div>
  );
}
