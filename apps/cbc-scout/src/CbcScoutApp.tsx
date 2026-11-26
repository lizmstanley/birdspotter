import { useMemo, useState } from 'react';
import type { GeolocateControl } from 'maplibre-gl';
import { About } from '@birdspotter/birding-core/About.tsx';
import { BirdingBar, BirdingScreen, type Screen } from '@birdspotter/birding-core/BirdingBar.tsx';
import { EbirdKeyForm } from '@birdspotter/birding-core/EbirdKeyForm.tsx';
import { FirstRunScreen } from '@birdspotter/birding-core/FirstRunScreen.tsx';
import { Help } from '@birdspotter/birding-core/Help.tsx';
import { InstallBanner } from '@birdspotter/birding-core/InstallBanner.tsx';
import type { InstallPromptStore } from '@birdspotter/birding-core/installPrompt.ts';
import { NearbyPanel, type GroupTitles } from '@birdspotter/birding-core/NearbyPanel.tsx';
import { readSettings, writeSettings, type BirdingSettings } from '@birdspotter/birding-core/settings.ts';
import { SettingsForm } from '@birdspotter/birding-core/SettingsForm.tsx';
import type { KeyValueStorage } from '@birdspotter/birding-core/storage.ts';
import { SuggestionsPanel, type BirdsRegion } from '@birdspotter/birding-core/SuggestionsPanel.tsx';
import { useEbirdKey } from '@birdspotter/birding-core/useEbirdKey.ts';
import { useLiveLocation } from '@birdspotter/birding-core/useLiveLocation.ts';
import { useNearbyData } from '@birdspotter/birding-core/useNearbyData.ts';
import { areaDisplayName } from '@birdspotter/cbc-manager/components/map/mapText.ts';
import type { AreaLinkData } from '@birdspotter/cbc-manager/services/areaLink.ts';
import { CBC_CIRCLE_RADIUS_MILES } from '@birdspotter/cbc-manager/services/cbcCircle.ts';
import { AreaPanel } from './AreaPanel.tsx';
import { countCircle, countCircleQuery, isInAreaTest } from './areaRegion.ts';
import type { AreaStartup } from './areaStartup.ts';
import { CBC_SCOUT } from './scoutIdentity.ts';
import { ScoutHelp } from './ScoutHelp.tsx';
import { ScoutMap } from './ScoutMap.tsx';
import { useSavedAreas } from './useSavedAreas.ts';

type Panel = 'nearby' | 'suggestions' | 'area';

const DEFAULT_BACK_DAYS = 7;

interface CbcScoutAppProps {
  readonly installPrompt: InstallPromptStore;
  readonly areaStartup: AreaStartup;
  readonly storage: KeyValueStorage | null;
}

function groupTitles(area: AreaLinkData): GroupTitles {
  if (area.outline.type === 'LineString') return { inRegion: 'In the circle', elsewhere: 'Outside the circle' };
  return { inRegion: `In ${areaDisplayName(area.areaCode)}`, elsewhere: 'Outside your area' };
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
  const live = useLiveLocation(locationControl, storage, CBC_SCOUT);
  // With no area yet, the counter's first job is loading one.
  const [panel, setPanel] = useState<Panel>(activeArea ? 'nearby' : 'area');
  const area = activeArea?.data ?? null;
  const [screen, setScreen] = useState<Screen | null>(null);
  const [settings, setSettings] = useState(() => readSettings(storage, CBC_SCOUT.settingsStorageKey));
  const [isSettingsSaved, setIsSettingsSaved] = useState(true);
  const [backDays, setBackDays] = useState(DEFAULT_BACK_DAYS);
  const circleQuery = useMemo(() => (area ? countCircleQuery(area) : null), [area]);
  // Above both tabs, so Nearby and Suggestions share one load. With no area, the search is the size of a count circle.
  const nearby = useNearbyData(
    ebirdApiKey,
    circleQuery,
    live.position,
    CBC_CIRCLE_RADIUS_MILES,
    backDays,
    settings.refreshMinutes * 60 * 1000
  );
  const isInArea = useMemo(() => (area ? isInAreaTest(area, countCircle(area)) : null), [area]);
  // A route's stand-in region is the whole circle, the same circle the sightings come from, so nothing is outside it.
  const birdsRegion = useMemo<BirdsRegion | null>(
    () => (area?.outline.type !== 'LineString' && isInArea ? { isInRegion: isInArea, outsideText: 'outside your area' } : null),
    [area, isInArea]
  );

  function changeSettings(next: BirdingSettings): void {
    setSettings(next);
    setIsSettingsSaved(writeSettings(storage, CBC_SCOUT.settingsStorageKey, next));
  }

  function changeKey(key: string): void {
    saveEbirdKey(key);
    setScreen(null);
  }

  return (
    <div className="scout">
      {ebirdApiKey && <BirdingBar title={CBC_SCOUT.name} onOpen={setScreen} />}
      <InstallBanner appName={CBC_SCOUT.name} installPrompt={installPrompt} />
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
              isInRegion={isInArea}
              groupTitles={area ? groupTitles(area) : null}
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
              isInRegion={isInArea}
              birdsRegion={birdsRegion}
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
        </>
      ) : (
        <FirstRunScreen appName={CBC_SCOUT.name} onSave={saveEbirdKey} onHelp={() => setScreen('help')} />
      )}
      {screen && (
        <BirdingScreen screen={screen} closeText={ebirdApiKey ? 'Back to map' : 'Back'} onClose={() => setScreen(null)}>
          {screen === 'ebird-key' && (
            <EbirdKeyForm appName={CBC_SCOUT.name} savedKey={ebirdApiKey} onSave={changeKey} />
          )}
          {screen === 'settings' && (
            <SettingsForm
              appName={CBC_SCOUT.name}
              settings={settings}
              isSaved={isSettingsSaved}
              isRadiusShown={false}
              onChange={changeSettings}
            />
          )}
          {screen === 'help' && (
            <Help appName={CBC_SCOUT.name}>
              <ScoutHelp />
            </Help>
          )}
          {screen === 'about' && <About />}
        </BirdingScreen>
      )}
    </div>
  );
}
