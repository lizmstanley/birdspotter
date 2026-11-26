import { useMemo, useState } from 'react';
import type { GeolocateControl } from 'maplibre-gl';
import { About } from '@birdspotter/birding-core/About.tsx';
import { BirdingBar, BirdingScreen } from '@birdspotter/birding-core/BirdingBar.tsx';
import { EbirdKeyForm } from '@birdspotter/birding-core/EbirdKeyForm.tsx';
import { FirstRunScreen } from '@birdspotter/birding-core/FirstRunScreen.tsx';
import { Help } from '@birdspotter/birding-core/Help.tsx';
import { InstallBanner } from '@birdspotter/birding-core/InstallBanner.tsx';
import type { InstallPromptStore } from '@birdspotter/birding-core/installPrompt.ts';
import { NearbyPanel, type GroupTitles } from '@birdspotter/birding-core/NearbyPanel.tsx';
import type { AppScreen, Screen } from '@birdspotter/birding-core/screens.ts';
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
import { AreaDetails, AreaPanel } from './AreaPanel.tsx';
import { countCircle, countCircleQuery, isInAreaTest } from './areaRegion.ts';
import type { AreaStartup } from './areaStartup.ts';
import { activeSavedArea } from './savedAreas.ts';
import { CBC_SCOUT } from './scoutIdentity.ts';
import { ScoutHelp } from './ScoutHelp.tsx';
import { ScoutMap } from './ScoutMap.tsx';
import { useSavedAreas } from './useSavedAreas.ts';

type Panel = 'sightings' | 'hotspots' | 'notes';
type ScoutScreen = Screen | 'areas';

const SCOUT_SCREENS: readonly AppScreen<'areas'>[] = [{ id: 'areas', title: 'Your areas' }];

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

function Messages({ error, notice }: { readonly error: string | null; readonly notice: string | null }) {
  return (
    <>
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
    </>
  );
}

export function CbcScoutApp({ installPrompt, areaStartup, storage }: CbcScoutAppProps) {
  const [error, setError] = useState<string | null>(areaStartup.error);
  const [notice, setNotice] = useState<string | null>(areaStartup.notice);
  const { ebirdApiKey, saveEbirdKey } = useEbirdKey(setError);
  // With no area yet, the counter's first job is loading one.
  const [screen, setScreen] = useState<ScoutScreen | null>(() =>
    ebirdApiKey && !activeSavedArea(areaStartup.saved) ? 'areas' : null
  );
  const { areas, activeArea, loadAreaText, pickArea, removeArea } = useSavedAreas({
    startup: areaStartup,
    storage,
    setError,
    setNotice,
    onLoad: () => setScreen(null),
  });
  const [locationControl, setLocationControl] = useState<GeolocateControl | null>(null);
  const live = useLiveLocation(locationControl, storage, CBC_SCOUT);
  const [chosenPanel, setPanel] = useState<Panel>('sightings');
  const area = activeArea?.data ?? null;
  // Notes belong to an area, so with none loaded the tab is gone and Sightings shows.
  const panel = chosenPanel === 'notes' && !area ? 'sightings' : chosenPanel;
  const [settings, setSettings] = useState(() => readSettings(storage, CBC_SCOUT.settingsStorageKey));
  const [isSettingsSaved, setIsSettingsSaved] = useState(true);
  const [backDays, setBackDays] = useState(DEFAULT_BACK_DAYS);
  const circleQuery = useMemo(() => (area ? countCircleQuery(area) : null), [area]);
  // Above the tabs, so Sightings and Hotspots share one load. With no area, the search is the size of a count circle.
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

  function saveFirstKey(key: string): void {
    saveEbirdKey(key);
    if (!activeArea) setScreen('areas');
  }

  function pickActiveArea(key: string): void {
    pickArea(key);
    setScreen(null);
  }

  return (
    <div className="scout">
      {ebirdApiKey && <BirdingBar title={CBC_SCOUT.name} appScreens={SCOUT_SCREENS} onOpen={setScreen} />}
      <InstallBanner appName={CBC_SCOUT.name} installPrompt={installPrompt} />
      {/* The Your areas screen covers these, so it shows them itself. */}
      {screen !== 'areas' && <Messages error={error} notice={notice} />}
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
            <button type="button" aria-pressed={panel === 'sightings'} onClick={() => setPanel('sightings')}>
              Sightings
            </button>
            <button type="button" aria-pressed={panel === 'hotspots'} onClick={() => setPanel('hotspots')}>
              Hotspots
            </button>
            {area && (
              <button type="button" aria-pressed={panel === 'notes'} onClick={() => setPanel('notes')}>
                Notes
              </button>
            )}
          </div>
          {panel === 'sightings' && (
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
          {panel === 'hotspots' && (
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
          {panel === 'notes' && area && (
            <section className="birding-panel scout-notes" aria-label="Notes">
              <AreaDetails area={area} />
              {!area.note && <p>No note from your compiler for this area.</p>}
            </section>
          )}
        </>
      ) : (
        <FirstRunScreen appName={CBC_SCOUT.name} onSave={saveFirstKey} onHelp={() => setScreen('help')} />
      )}
      {screen && (
        <BirdingScreen
          screen={screen}
          appScreens={SCOUT_SCREENS}
          closeText={ebirdApiKey ? 'Back to map' : 'Back'}
          onClose={() => setScreen(null)}
        >
          {screen === 'areas' && (
            <>
              <Messages error={error} notice={notice} />
              <AreaPanel
                areas={areas}
                activeArea={activeArea}
                onLoadText={loadAreaText}
                onPick={pickActiveArea}
                onRemove={removeArea}
              />
            </>
          )}
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
            <Help appName={CBC_SCOUT.name} opensWithoutSignal>
              <ScoutHelp />
            </Help>
          )}
          {screen === 'about' && <About />}
        </BirdingScreen>
      )}
    </div>
  );
}
