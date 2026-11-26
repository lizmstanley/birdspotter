import { useMemo, useState } from 'react';
import { LocalCbcDb } from './db/pgliteDb';
import { AddCirclePanel } from './components/AddCirclePanel';
import { AppHeader } from './components/AppHeader';
import { CircleOverview } from './components/CircleOverview';
import { ConfirmDialog, type ConfirmDialogConfig } from './components/ConfirmDialog';
import { FirstCircleCard } from './components/FirstCircleCard';
import { DISCUSSIONS_URL, HelpPage } from './components/HelpPage';
import { PersonHistoryDialog } from './components/PersonHistoryDialog';
import { SeasonRolloverDialog } from './components/SeasonRolloverDialog';
import { TabContent } from './components/TabContent';
import { TabNav } from './components/TabNav';
import { useAreaActions } from './hooks/useAreaActions';
import { useAutoSave } from './hooks/useAutoSave';
import { useCircleActions } from './hooks/useCircleActions';
import { useCircleData } from './hooks/useCircleData';
import { useEbirdKey } from '@birdspotter/birding-core/useEbirdKey.ts';
import { useNotices } from './hooks/useNotices';
import { useRosterActions } from './hooks/useRosterActions';
import { useSeasonActions } from './hooks/useSeasonActions';
import { areResultsDue } from './services/countDay';
import { seasonToRollOverTo } from './services/season';
import { describeError } from './services/describeError';
import { copyLink, shareApp, shareLink } from './services/shareApp';
import type { AreaReturnTab, SelectedArea, Tab } from './tabs';

const AREA_LINK_COPIED = 'Area link copied. Paste it into a text or email.';

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
  const { savedCircles, activeCircle, loading, reload, ...circleData } = useCircleData(db, setError, autoSave.scheduleSave);
  const { assignments, openAreas, reminders, outreach, areas } = circleData;

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
  const areaActions = useAreaActions(actionContext, circleData.areaBoundaries.length);
  const rosterActions = useRosterActions(actionContext);
  const seasonActions = useSeasonActions(actionContext);

  const countedAreas = useMemo(() => areas.filter((a) => a.is_counted), [areas]);
  const notCountedAreas = useMemo(() => areas.filter((a) => !a.is_counted), [areas]);
  const currentSeason = activeCircle?.current_year ?? null;
  const rolloverSeason = seasonToRollOverTo(currentSeason, new Date());
  const areResultsDueNow = areResultsDue(activeCircle?.count_date, new Date(), currentSeason ?? undefined);
  const awaitingResultsCount = areResultsDueNow ? countedAreas.filter((a) => !a.results_received).length : 0;
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
        <CircleOverview
          circle={activeCircle}
          circleActions={circleActions}
          currentSeason={currentSeason}
          rolloverSeason={rolloverSeason}
          isRolloverDismissed={dismissedRolloverCircle === activeCircle.code}
          countedAreaCount={countedAreas.length}
          activeCounterCount={assignments.length}
          openAreaCount={openAreas.length}
          awaitingResultsCount={awaitingResultsCount}
          areResultsDue={areResultsDueNow}
          onStartRollover={() => setIsRolloverOpen(true)}
          onDismissRollover={() => setDismissedRolloverCircle(activeCircle.code)}
          onOpenTab={setTab}
        />
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
          {activeCircle && (
            <TabContent
              tab={tab}
              circle={activeCircle}
              data={circleData}
              countedAreas={countedAreas}
              notCountedAreas={notCountedAreas}
              areResultsDue={areResultsDueNow}
              selectedArea={selectedArea}
              ebirdApiKey={ebirdApiKey}
              areaActions={areaActions}
              circleActions={circleActions}
              rosterActions={rosterActions}
              onOpenPerson={setHistoryPersonId}
              onCopyBcc={copyBcc}
              onShareLink={(title, url) =>
                void shareLink({ title, url }, AREA_LINK_COPIED, flash, setError)
              }
              onCopyLink={(url) => void copyLink(url, AREA_LINK_COPIED, flash, setError)}
              onOpenArea={openArea}
              onSelectTab={setTab}
            />
          )}
          {tab === 'help' && <HelpPage ebirdApiKey={ebirdApiKey} onSaveEbirdKey={saveEbirdKey} />}
        </main>
      )}

      <AppFooter />

      <AppDialogs
        db={db}
        rollover={
          isRolloverOpen && activeCircle && currentSeason !== null && rolloverSeason !== null
            ? { circleCode: activeCircle.code, currentSeason, nextSeason: rolloverSeason }
            : null
        }
        onCloseRollover={() => setIsRolloverOpen(false)}
        onRollOver={seasonActions.rollOver}
        historyPersonId={historyPersonId}
        onCloseHistory={() => setHistoryPersonId(null)}
        confirmConfig={confirmConfig}
        onCloseConfirm={() => setConfirmConfig(null)}
        onExportBackup={rosterActions.downloadBackup}
      />
    </div>
  );
}

interface AppDialogsProps {
  db: LocalCbcDb;
  rollover: { circleCode: string; currentSeason: number; nextSeason: number } | null;
  onCloseRollover: () => void;
  onRollOver: ReturnType<typeof useSeasonActions>['rollOver'];
  historyPersonId: number | null;
  onCloseHistory: () => void;
  confirmConfig: ConfirmDialogConfig | null;
  onCloseConfirm: () => void;
  onExportBackup: () => Promise<boolean>;
}

function AppDialogs({
  db,
  rollover,
  onCloseRollover,
  onRollOver,
  historyPersonId,
  onCloseHistory,
  confirmConfig,
  onCloseConfirm,
  onExportBackup,
}: AppDialogsProps) {
  return (
    <>
      {rollover && (
        <SeasonRolloverDialog
          circleCode={rollover.circleCode}
          currentSeason={rollover.currentSeason}
          nextSeason={rollover.nextSeason}
          onClose={onCloseRollover}
          onConfirm={(carryAssignments) => onRollOver(rollover.nextSeason, carryAssignments)}
        />
      )}

      {historyPersonId !== null && (
        <PersonHistoryDialog key={historyPersonId} db={db} personId={historyPersonId} onClose={onCloseHistory} />
      )}

      <ConfirmDialog config={confirmConfig} onClose={onCloseConfirm} onExportBackup={onExportBackup} />
    </>
  );
}

function AppFooter() {
  return (
    <footer className="app-footer">
      Questions, ideas, or something not working?{' '}
      <a href={DISCUSSIONS_URL} target="_blank" rel="noreferrer">
        Let me know on GitHub Discussions
      </a>
      .
    </footer>
  );
}
