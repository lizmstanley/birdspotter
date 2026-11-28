import { useMemo, useState } from 'react';
import type { GeolocateControl } from 'maplibre-gl';
import { About } from '@birdspotter/birding-core/About.tsx';
import { BirdingBar, BirdingScreen } from '@birdspotter/birding-core/BirdingBar.tsx';
import { EbirdKeyForm } from '@birdspotter/birding-core/EbirdKeyForm.tsx';
import { Help } from '@birdspotter/birding-core/Help.tsx';
import { InstallBanner } from '@birdspotter/birding-core/InstallBanner.tsx';
import type { InstallPromptStore } from '@birdspotter/birding-core/installPrompt.ts';
import type { RegionTest } from '@birdspotter/birding-core/nearby.ts';
import { NearbyPanel, type GroupTitles } from '@birdspotter/birding-core/NearbyPanel.tsx';
import type { AppScreen, Screen } from '@birdspotter/birding-core/screens.ts';
import { readSettings, writeSettings, type BirdingSettings } from '@birdspotter/birding-core/settings.ts';
import { SettingsForm } from '@birdspotter/birding-core/SettingsForm.tsx';
import type { KeyValueStorage } from '@birdspotter/birding-core/storage.ts';
import { SuggestionsPanel } from '@birdspotter/birding-core/SuggestionsPanel.tsx';
import { useEbirdKey } from '@birdspotter/birding-core/useEbirdKey.ts';
import { useLiveLocation } from '@birdspotter/birding-core/useLiveLocation.ts';
import { useNearbyData, type NearbyData } from '@birdspotter/birding-core/useNearbyData.ts';
import { CBC_CIRCLE_RADIUS_MILES } from '@birdspotter/cbc-manager/services/cbcCircle.ts';
import { AreaDetails, AreaPanel } from './AreaPanel.tsx';
import { countCircle, countCircleQuery, isInAreaTest } from './areaRegion.ts';
import type { AreaStartup } from './areaStartup.ts';
import { activeSavedArea } from './savedAreas.ts';
import { CBC_SCOUT } from './scoutIdentity.ts';
import { ScoutHelp } from './ScoutHelp.tsx';
import { ScoutMap } from './ScoutMap.tsx';
import { useOfflineMap } from './useOfflineMap.ts';
import { useSavedAreas } from './useSavedAreas.ts';

type Panel = 'sightings' | 'hotspots' | 'notes';
type ScoutScreen = Screen | 'areas';

const SCOUT_SCREENS: readonly AppScreen<'areas'>[] = [{ id: 'areas', title: 'Your areas' }];

// The privacy page sits at the site root, two folders above cbc/scout/.
const PRIVACY_URL = `${import.meta.env.BASE_URL}../../privacy/`;
const DEFAULT_BACK_DAYS = 7;

interface CbcScoutAppProps {
  readonly installPrompt: InstallPromptStore;
  readonly areaStartup: AreaStartup;
  readonly storage: KeyValueStorage | null;
}

const ROUTE_GROUP_TITLES: GroupTitles = { inRegion: 'In the circle', elsewhere: 'Outside the circle' };

type NearbyLists = Pick<NearbyData, 'regular' | 'notable' | 'hotspots'>;

function inAreaOnly({ regular, notable, hotspots }: NearbyLists, isInArea: RegionTest): NearbyLists {
  return { regular: regular.filter(isInArea), notable: notable.filter(isInArea), hotspots: hotspots.filter(isInArea) };
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

function EbirdKeyNeeded({ onAddKey }: { readonly onAddKey: () => void }) {
  return (
    <section className="birding-panel" aria-label="eBird key needed">
      <p>
        Sightings and hotspots come from eBird and need your own free eBird key. Your area, the map, notes, and the
        count work without one.
      </p>
      <button type="button" onClick={onAddKey}>
        Add eBird key
      </button>
    </section>
  );
}

export function CbcScoutApp({ installPrompt, areaStartup, storage }: CbcScoutAppProps) {
  const [error, setError] = useState<string | null>(areaStartup.error);
  const [notice, setNotice] = useState<string | null>(areaStartup.notice);
  const { ebirdApiKey, saveEbirdKey } = useEbirdKey(setError);
  // With no area yet, the counter's first job is loading one.
  const [screen, setScreen] = useState<ScoutScreen | null>(() => (activeSavedArea(areaStartup.saved) ? null : 'areas'));
  const { areas, activeArea, loadAreaText, pickArea, removeArea } = useSavedAreas({
    startup: areaStartup,
    storage,
    setError,
    setNotice,
    onLoad: () => setScreen(null),
  });
  const offlineMap = useOfflineMap(activeArea);
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
  // A route has no inside, so its places are grouped against the circle instead of kept to the area.
  const isRoute = area?.outline.type === 'LineString';
  const areaShapeTest = isRoute ? null : isInArea;
  const { regular, notable, hotspots } = nearby;
  // Keyed on the lists, not on nearby, which is new on every location fix, so the map regroups only when they change.
  const areaLists = useMemo(
    () => (areaShapeTest ? inAreaOnly({ regular, notable, hotspots }, areaShapeTest) : null),
    [regular, notable, hotspots, areaShapeTest]
  );
  const areaData = areaLists ? { ...nearby, ...areaLists } : nearby;

  function changeSettings(next: BirdingSettings): void {
    setSettings(next);
    setIsSettingsSaved(writeSettings(storage, CBC_SCOUT.settingsStorageKey, next));
  }

  function changeKey(key: string): void {
    saveEbirdKey(key);
    setScreen(null);
  }

  function pickActiveArea(key: string): void {
    pickArea(key);
    setScreen(null);
  }

  return (
    <div className="scout">
      <BirdingBar title={CBC_SCOUT.name} appScreens={SCOUT_SCREENS} onOpen={setScreen} />
      <InstallBanner appName={CBC_SCOUT.name} installPrompt={installPrompt} />
      {/* The Your areas screen covers these, so it shows them itself. */}
      {screen !== 'areas' && <Messages error={error} notice={notice} />}
      <ScoutMap
        area={area}
        live={live}
        data={areaData}
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
      {panel !== 'notes' && !ebirdApiKey && <EbirdKeyNeeded onAddKey={() => setScreen('ebird-key')} />}
      {panel === 'sightings' && ebirdApiKey && (
        <NearbyPanel
          isInRegion={isInArea}
          groupTitles={isRoute ? ROUTE_GROUP_TITLES : null}
          data={areaData}
          live={live}
          backDays={backDays}
          onBackDaysChange={setBackDays}
          refreshMinutes={settings.refreshMinutes}
          onFixKey={() => setScreen('ebird-key')}
        />
      )}
      {panel === 'hotspots' && ebirdApiKey && (
        <SuggestionsPanel
          isInRegion={isInArea}
          data={areaData}
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
      {screen && (
        <BirdingScreen
          screen={screen}
          appScreens={SCOUT_SCREENS}
          closeText="Back to map"
          onClose={() => setScreen(null)}
        >
          {screen === 'areas' && (
            <>
              <Messages error={error} notice={notice} />
              <AreaPanel
                areas={areas}
                activeArea={activeArea}
                offlineMap={offlineMap}
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
            <Help appName={CBC_SCOUT.name} privacyUrl={PRIVACY_URL}>
              <ScoutHelp />
            </Help>
          )}
          {screen === 'about' && <About />}
        </BirdingScreen>
      )}
    </div>
  );
}
