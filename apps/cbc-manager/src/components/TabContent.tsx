import { useMemo } from 'react';
import type { AreaOption, SavedCircle } from '../db/pgliteDb';
import type { useAreaActions } from '../hooks/useAreaActions';
import type { ActiveCircleData } from '../hooks/useCircleData';
import type { useCircleActions } from '../hooks/useCircleActions';
import type { useRosterActions } from '../hooks/useRosterActions';
import { buildAreaLinkData } from '../services/areaShare';
import { countCountersByArea } from '../services/rosterSummary';
import { AREA_RETURN_LABELS, type AreaReturnTab, type SelectedArea, type Tab } from '../tabs';
import { AllAreasPage } from './AllAreasPage';
import { AreaDetailPage } from './AreaDetailPage';
import { AssignmentsTab } from './AssignmentsTab';
import { AwaitingResultsPage } from './AwaitingResultsPage';
import { CircleMap } from './CircleMap';
import { OpenAreasTab } from './OpenAreasTab';
import { OutreachTab } from './OutreachTab';
import { SpreadsheetImporter } from './SpreadsheetImporter';

interface Props {
  tab: Tab;
  circle: SavedCircle;
  data: ActiveCircleData;
  countedAreas: AreaOption[];
  notCountedAreas: AreaOption[];
  areResultsDue: boolean;
  selectedArea: SelectedArea | null;
  ebirdApiKey: string;
  areaActions: ReturnType<typeof useAreaActions>;
  circleActions: ReturnType<typeof useCircleActions>;
  rosterActions: ReturnType<typeof useRosterActions>;
  onOpenPerson: (personId: number) => void;
  onCopyBcc: (emails: string[], label: string) => void;
  onShareLink: (title: string, url: string) => void;
  onCopyLink: (url: string) => void;
  onOpenArea: (code: string, label: string | null | undefined, from: AreaReturnTab) => void;
  onSelectTab: (tab: Tab) => void;
}

export function TabContent(props: Props) {
  const { tab, circle, data, countedAreas, notCountedAreas, areResultsDue, areaActions, onOpenPerson, onCopyBcc } =
    props;
  const { assignments } = data;

  switch (tab) {
    case 'assignments':
      return (
        <AssignmentsTab
          circleCode={circle.code}
          assignments={assignments}
          countedAreas={countedAreas}
          onReassign={(participationId, newArea) => void areaActions.reassign(participationId, newArea)}
          onOpenPerson={onOpenPerson}
        />
      );
    case 'open':
      return (
        <OpenAreasTab
          circleCode={circle.code}
          openAreas={data.openAreas}
          notCountedAreas={notCountedAreas}
          onToggleCounted={(code, isCounted) => void areaActions.toggleAreaCounted(code, isCounted)}
          onDeleteArea={areaActions.deleteArea}
        />
      );
    case 'outreach':
      return (
        <OutreachTab
          reminders={data.reminders}
          outreach={data.outreach}
          onCopyBcc={onCopyBcc}
          onOpenPerson={onOpenPerson}
        />
      );
    case 'map':
      return <MapTab {...props} />;
    case 'area':
      return props.selectedArea && <AreaDetail {...props} selectedArea={props.selectedArea} />;
    case 'areas':
      return (
        <AllAreasPage
          circleCode={circle.code}
          areResultsDue={areResultsDue}
          areas={data.areas}
          assignments={assignments}
          onSelectArea={(code) => props.onOpenArea(code, null, 'areas')}
        />
      );
    case 'results':
      return (
        <AwaitingResultsPage
          circleCode={circle.code}
          countDate={circle.count_date}
          areResultsDue={areResultsDue}
          countedAreas={countedAreas}
          assignments={assignments}
          onToggleResultsReceived={areaActions.toggleResultsReceived}
          onSelectArea={(code) => props.onOpenArea(code, null, 'results')}
          onCopyBcc={onCopyBcc}
        />
      );
    case 'import':
      return (
        <SpreadsheetImporter
          circleCode={circle.code}
          assignments={assignments}
          areas={data.areas}
          onImport={props.rosterActions.importRows}
          onClearRoster={props.rosterActions.clearRoster}
        />
      );
    case 'help':
      return null;
    default: {
      const unhandled: never = tab;
      return unhandled;
    }
  }
}

function MapTab({ circle, data, notCountedAreas, areaActions, circleActions, ebirdApiKey, onOpenArea }: Props) {
  const { assignments } = data;
  const areaParticipantCounts = useMemo(() => countCountersByArea(assignments), [assignments]);
  return (
    <CircleMap
      activeCode={circle.code}
      activeName={circle.name}
      centerLat={circle.center_lat}
      centerLng={circle.center_lng}
      radiusMiles={circle.radius_miles}
      areaBoundaries={data.areaBoundaries}
      areaParticipantCounts={areaParticipantCounts}
      notCountedAreaCodes={notCountedAreas.map((a) => a.code)}
      onCenterChange={(lat, lng) => void areaActions.changeCenter(lat, lng)}
      onSelectArea={(code, label) => onOpenArea(code, label, 'map')}
      onImportBoundaries={areaActions.importBoundaries}
      onClearBoundaries={areaActions.clearBoundaries}
      onSaveScoutedCircle={circleActions.createCircle}
      ebirdApiKey={ebirdApiKey}
    />
  );
}

function AreaDetail({
  circle,
  data,
  countedAreas,
  notCountedAreas,
  selectedArea,
  areaActions,
  onOpenPerson,
  onCopyBcc,
  onShareLink,
  onCopyLink,
  onSelectTab,
}: Props & { selectedArea: SelectedArea }) {
  const selectedCode = selectedArea.code.toUpperCase();
  const areaInfo = data.areas.find((a) => a.code.toUpperCase() === selectedCode) ?? null;
  const counterNote = areaInfo?.counter_note ?? null;
  const areaLinkData = useMemo(
    () => buildAreaLinkData(circle, data.areaBoundaries, data.assignments, selectedArea.code, counterNote),
    [circle, data.areaBoundaries, data.assignments, selectedArea.code, counterNote]
  );
  return (
    <AreaDetailPage
      circleCode={circle.code}
      areaCode={selectedArea.code}
      areaLabel={selectedArea.label}
      isCounted={!notCountedAreas.some((a) => a.code.toUpperCase() === selectedCode)}
      resultsReceived={Boolean(areaInfo?.results_received)}
      areaInfo={areaInfo}
      allAreas={countedAreas}
      assignments={data.assignments}
      areaLinkData={areaLinkData}
      backLabel={AREA_RETURN_LABELS[selectedArea.from]}
      onBack={() => onSelectTab(selectedArea.from)}
      onOpenPerson={onOpenPerson}
      onReassign={areaActions.reassign}
      onCopyBcc={onCopyBcc}
      onShareLink={onShareLink}
      onCopyLink={onCopyLink}
      onToggleCounted={areaActions.toggleAreaCounted}
      onToggleResultsReceived={areaActions.toggleResultsReceived}
      onSaveCounterNote={areaActions.saveCounterNote}
    />
  );
}
