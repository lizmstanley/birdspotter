import { useMemo, useState } from 'react';
import { LocalCbcDb } from './db/pgliteDb';
import { AddCirclePanel } from './components/AddCirclePanel';
import { AppHeader } from './components/AppHeader';
import { AreaDetailPage } from './components/AreaDetailPage';
import { AllAreasPage } from './components/AllAreasPage';
import { AssignmentsTab } from './components/AssignmentsTab';
import { AwaitingResultsPage } from './components/AwaitingResultsPage';
import { CircleInfoBar } from './components/CircleInfoBar';
import { CircleMap } from './components/CircleMap';
import { CircleStats } from './components/CircleStats';
import { ConfirmDialog, type ConfirmDialogConfig } from './components/ConfirmDialog';
import { FirstCircleCard } from './components/FirstCircleCard';
import { DISCUSSIONS_URL, HelpPage } from './components/HelpPage';
import { OpenAreasTab } from './components/OpenAreasTab';
import { OutreachTab } from './components/OutreachTab';
import { PersonHistoryDialog } from './components/PersonHistoryDialog';
import { SeasonRolloverBanner } from './components/SeasonRolloverBanner';
import { SeasonRolloverDialog } from './components/SeasonRolloverDialog';
import { SpreadsheetImporter } from './components/SpreadsheetImporter';
import { TabNav } from './components/TabNav';
import { useAreaActions } from './hooks/useAreaActions';
import { useAutoSave } from './hooks/useAutoSave';
import { useCircleActions } from './hooks/useCircleActions';
import { useCircleData } from './hooks/useCircleData';
import { useEbirdKey } from './hooks/useEbirdKey';
import { useNotices } from './hooks/useNotices';
import { useRosterActions } from './hooks/useRosterActions';
import { useSeasonActions } from './hooks/useSeasonActions';
import { areResultsDue } from './services/countDay';
import { seasonToRollOverTo } from './services/season';
import { countCountersByArea } from './services/rosterSummary';
import { describeError } from './services/describeError';
import { shareApp } from './services/shareApp';
import { AREA_RETURN_LABELS, type AreaReturnTab, type SelectedArea, type Tab } from './tabs';

export function App() {
  const db = useMemo(() => new LocalCbcDb(), []);
  const [tab, setTab] = useState<Tab>('map');
  const [showAddCircle, setShowAddCircle] = useState(false);
  const [historyPersonId, setHistoryPersonId] = useState<number | null>(null);
  const [selectedArea, setSelectedArea] = useState<SelectedArea | null>(null);
  const [isRolloverOpen, setIsRolloverOpen] = useState(false);
  const [dismissedRolloverCircle, setDismissedRolloverCircle] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmDialogConfig | null>(null);

  const { toast, error, setError, flash } = useNotices();
  const { ebirdApiKey, saveEbirdKey } = useEbirdKey(setError);
  const autoSave = useAutoSave(db, setError, flash);
  const { savedCircles, activeCircle, assignments, openAreas, reminders, outreach, areas, areaBoundaries, loading, reload } =
    useCircleData(db, setError, autoSave.scheduleSave);

  const actionContext = { db, activeCircle, reload, flash, setError, confirm: setConfirmConfig };
  const circleActions = useCircleActions(
    actionContext,
    savedCircles.map((c) => c.code),
    {
      afterSwitch: () => {
        setSelectedArea(null);
        if (tab === 'area') setTab('map');
      },
      afterCreate: () => setTab('map'),
    }
  );
  const areaActions = useAreaActions(actionContext, areaBoundaries.length);
  const rosterActions = useRosterActions(actionContext);
  const seasonActions = useSeasonActions(actionContext);

  const countedAreas = useMemo(() => areas.filter((a) => a.is_counted), [areas]);
  const notCountedAreas = useMemo(() => areas.filter((a) => !a.is_counted), [areas]);
  const currentSeason = activeCircle?.current_year ?? null;
  const rolloverSeason = seasonToRollOverTo(currentSeason, new Date());
  const resultsDue = areResultsDue(activeCircle?.count_date, new Date(), currentSeason ?? undefined);
  const awaitingResultsCount = resultsDue ? countedAreas.filter((a) => !a.results_received).length : 0;
  const areaParticipantCounts = useMemo(() => countCountersByArea(assignments), [assignments]);
  const selectedAreaInfo =
    areas.find((a) => a.code.toUpperCase() === selectedArea?.code.toUpperCase()) ?? null;
  // An area page has no tab of its own; highlight the tab it was opened from.
  const activeNavTab: Tab = tab === 'area' ? (selectedArea?.from ?? 'map') : tab;

  function copyBcc(emails: string[], label: string) {
    navigator.clipboard.writeText(emails.filter(Boolean).join(', ')).then(
      () => flash(`Copied ${emails.length} ${label} emails to clipboard.`),
      (err: unknown) => setError(`Copy failed: ${describeError(err)}`)
    );
  }

  function openArea(code: string, label: string | null | undefined, from: AreaReturnTab) {
    setSelectedArea({ code, label, from });
    setTab('area');
  }

  return (
    <div className="shell">
      <AppHeader
        activeCircle={activeCircle}
        savedCircles={savedCircles}
        autoSaveStatus={autoSave.status}
        backupInputRef={rosterActions.backupInputRef}
        onSelectCircle={(code) => void circleActions.selectCircle(code)}
        onToggleAddCircle={() => setShowAddCircle((v) => !v)}
        onRenameCircle={() => void circleActions.renameActiveCircle()}
        onDeleteCircle={circleActions.removeActiveCircle}
        onShare={() => void shareApp(flash, setError)}
        onExportBackup={() => void rosterActions.downloadBackup()}
        onRestoreBackup={(e) => void rosterActions.restoreBackup(e)}
        onAutoSaveClick={() => void autoSave.toggle()}
      />

      {showAddCircle && (
        <div style={{ marginBottom: 16 }}>
          <AddCirclePanel onCreateCircle={circleActions.createCircle} onClose={() => setShowAddCircle(false)} />
        </div>
      )}

      {!loading && activeCircle && (
        <>
          <CircleInfoBar
            circle={activeCircle}
            isRefreshing={circleActions.refreshingAudubon}
            onRefreshFromAudubon={() => void circleActions.refreshFromAudubon()}
            onSave={circleActions.saveCircleInfo}
          />
          {rolloverSeason !== null && currentSeason !== null && dismissedRolloverCircle !== activeCircle.code && (
            <SeasonRolloverBanner
              circleCode={activeCircle.code}
              currentSeason={currentSeason}
              nextSeason={rolloverSeason}
              onStart={() => setIsRolloverOpen(true)}
              onDismiss={() => setDismissedRolloverCircle(activeCircle.code)}
            />
          )}
          <CircleStats
            countedAreaCount={countedAreas.length}
            activeCounterCount={assignments.length}
            openAreaCount={openAreas.length}
            awaitingResultsCount={awaitingResultsCount}
            countedAreaTotal={countedAreas.length}
            resultsDue={resultsDue}
            countDate={activeCircle.count_date}
            onOpenTab={setTab}
          />
        </>
      )}

      <TabNav
        activeTab={activeNavTab}
        areaCount={areas.length}
        assignmentCount={assignments.length}
        outreachCount={reminders.length + outreach.length}
        onSelect={setTab}
      />

      {toast && <div className="toast">{toast}</div>}
      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="card">Booting local PostgreSQL (PGlite)...</div>
      ) : (
        <main>
          {!activeCircle && tab !== 'help' && !showAddCircle && (
            <FirstCircleCard onAddCircle={() => setShowAddCircle(true)} />
          )}

          {tab === 'assignments' && activeCircle && (
            <AssignmentsTab
              circleCode={activeCircle.code}
              assignments={assignments}
              countedAreas={countedAreas}
              onReassign={(participationId, newArea) => void areaActions.reassign(participationId, newArea)}
              onOpenPerson={setHistoryPersonId}
            />
          )}

          {tab === 'open' && activeCircle && (
            <OpenAreasTab
              circleCode={activeCircle.code}
              openAreas={openAreas}
              notCountedAreas={notCountedAreas}
              onToggleCounted={(code, isCounted) => void areaActions.toggleAreaCounted(code, isCounted)}
              onDeleteArea={areaActions.deleteArea}
            />
          )}

          {tab === 'outreach' && activeCircle && (
            <OutreachTab
              reminders={reminders}
              outreach={outreach}
              onCopyBcc={copyBcc}
              onOpenPerson={setHistoryPersonId}
            />
          )}

          {tab === 'map' && activeCircle && (
            <CircleMap
              activeCode={activeCircle.code}
              activeName={activeCircle.name}
              centerLat={activeCircle.center_lat}
              centerLng={activeCircle.center_lng}
              radiusMiles={activeCircle.radius_miles}
              areaBoundaries={areaBoundaries}
              areaParticipantCounts={areaParticipantCounts}
              notCountedAreaCodes={notCountedAreas.map((a) => a.code)}
              onCenterChange={(lat, lng) => void areaActions.changeCenter(lat, lng)}
              onSelectArea={(code, label) => openArea(code, label, 'map')}
              onImportBoundaries={areaActions.importBoundaries}
              onClearBoundaries={areaActions.clearBoundaries}
              onSaveScoutedCircle={circleActions.createCircle}
              ebirdApiKey={ebirdApiKey}
            />
          )}

          {tab === 'area' && activeCircle && selectedArea && (
            <AreaDetailPage
              circleCode={activeCircle.code}
              areaCode={selectedArea.code}
              areaLabel={selectedArea.label}
              isCounted={!notCountedAreas.some((a) => a.code.toUpperCase() === selectedArea.code.toUpperCase())}
              resultsReceived={Boolean(selectedAreaInfo?.results_received)}
              areaInfo={selectedAreaInfo}
              allAreas={countedAreas}
              assignments={assignments}
              backLabel={AREA_RETURN_LABELS[selectedArea.from]}
              onBack={() => setTab(selectedArea.from)}
              onOpenPerson={setHistoryPersonId}
              onReassign={areaActions.reassign}
              onCopyBcc={copyBcc}
              onToggleCounted={areaActions.toggleAreaCounted}
              onToggleResultsReceived={areaActions.toggleResultsReceived}
            />
          )}

          {tab === 'areas' && activeCircle && (
            <AllAreasPage
              circleCode={activeCircle.code}
              resultsDue={resultsDue}
              areas={areas}
              assignments={assignments}
              onSelectArea={(code) => openArea(code, null, 'areas')}
            />
          )}

          {tab === 'results' && activeCircle && (
            <AwaitingResultsPage
              circleCode={activeCircle.code}
              countDate={activeCircle.count_date}
              resultsDue={resultsDue}
              countedAreas={countedAreas}
              assignments={assignments}
              onToggleResultsReceived={areaActions.toggleResultsReceived}
              onSelectArea={(code) => openArea(code, null, 'results')}
              onCopyBcc={copyBcc}
            />
          )}

          {tab === 'import' && activeCircle && (
            <SpreadsheetImporter
              circleCode={activeCircle.code}
              assignments={assignments}
              areas={areas}
              onImport={rosterActions.importRows}
              onClearRoster={rosterActions.clearRoster}
            />
          )}
          {tab === 'help' && <HelpPage ebirdApiKey={ebirdApiKey} onSaveEbirdKey={saveEbirdKey} />}
        </main>
      )}

      <footer className="app-footer">
        Questions, ideas, or something not working?{' '}
        <a href={DISCUSSIONS_URL} target="_blank" rel="noreferrer">
          Let me know on GitHub Discussions
        </a>
        .
      </footer>

      {isRolloverOpen && activeCircle && currentSeason !== null && rolloverSeason !== null && (
        <SeasonRolloverDialog
          circleCode={activeCircle.code}
          currentSeason={currentSeason}
          nextSeason={rolloverSeason}
          onClose={() => setIsRolloverOpen(false)}
          onConfirm={(carryAssignments) => seasonActions.rollOver(rolloverSeason, carryAssignments)}
        />
      )}

      {historyPersonId !== null && (
        <PersonHistoryDialog
          key={historyPersonId}
          db={db}
          personId={historyPersonId}
          onClose={() => setHistoryPersonId(null)}
        />
      )}

      <ConfirmDialog
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
        onExportBackup={rosterActions.downloadBackup}
      />
    </div>
  );
}
