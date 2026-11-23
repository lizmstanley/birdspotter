import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  LocalCbcDb,
  type AreaBoundaryRow,
  type AreaOption,
  type AssignmentRow,
  type SavedCircle,
  type ImportedParticipantRow,
  type ImportOptions,
  type OpenAreaRow,
  type PossibleOutreachRow,
  type ReminderRow,
} from './db/pgliteDb';
import { AddCirclePanel, type NewCirclePayload } from './components/AddCirclePanel';
import { CircleMap } from './components/CircleMap';
import { AreaDetailPage } from './components/AreaDetailPage';
import { AwaitingResultsPage } from './components/AwaitingResultsPage';
import { AllAreasPage } from './components/AllAreasPage';
import { countingSince, PersonHistoryDialog } from './components/PersonHistoryDialog';
import type { ParsedAreaBoundary } from './services/kmlParser';
import { SpreadsheetImporter } from './components/SpreadsheetImporter';
import { HelpPage } from './components/HelpPage';
import { ConfirmDialog, type ConfirmDialogConfig } from './components/ConfirmDialog';
import { fetchAudubonCircleDetails } from './services/audubonCirclePage';
import { areResultsDue } from './services/countDay';
import {
  chooseAutoSaveFile,
  clearHandle,
  hasPermission,
  isAutoSaveSupported,
  loadHandle,
  requestPermission,
  requestPersistentStorage,
  writeBackupFile,
  type AutoSaveStatus,
  type FileHandleLike,
} from './services/autoSave';

type Tab = 'assignments' | 'open' | 'results' | 'outreach' | 'map' | 'areas' | 'area' | 'import' | 'help';
type AreaReturnTab = 'map' | 'areas' | 'results';

const AREA_RETURN_LABELS: Record<AreaReturnTab, string> = {
  map: 'Map',
  areas: 'All Areas',
  results: 'Awaiting Results',
};

export function App() {
  const db = useMemo(() => new LocalCbcDb(), []);
  const [tab, setTab] = useState<Tab>('map');
  const [showAddCircle, setShowAddCircle] = useState(false);
  const [editingCircleInfo, setEditingCircleInfo] = useState(false);
  const [editCompilerName, setEditCompilerName] = useState('');
  const [editCompilerEmail, setEditCompilerEmail] = useState('');
  const [editCountDate, setEditCountDate] = useState('');
  const [refreshingAudubon, setRefreshingAudubon] = useState(false);
  const [historyPersonId, setHistoryPersonId] = useState<number | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const autoSaveHandleRef = useRef<FileHandleLike | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>(
    isAutoSaveSupported() ? 'off' : 'unsupported'
  );
  const [selectedArea, setSelectedArea] = useState<{
    code: string;
    label?: string | null;
    from: AreaReturnTab;
  } | null>(null);

  const [savedCircles, setSavedCircles] = useState<SavedCircle[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [openAreas, setOpenAreas] = useState<OpenAreaRow[]>([]);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [outreach, setOutreach] = useState<PossibleOutreachRow[]>([]);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [areaBoundaries, setAreaBoundaries] = useState<AreaBoundaryRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmDialogConfig | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      await db.init();
      const circles = await db.getSavedCircles();
      const current = circles.find((c) => c.is_active) ?? circles[0] ?? null;
      setSavedCircles(circles);

      if (!current) {
        setAssignments([]);
        setOpenAreas([]);
        setReminders([]);
        setOutreach([]);
        setAreas([]);
        setAreaBoundaries([]);
        return;
      }

      const [a, o, r, out, areaOpts, boundaries] = await Promise.all([
        db.getAssignments(current.code),
        db.getOpenAreas(current.code),
        db.getNeedsReminder(current.code),
        db.getPossibleOutreach(current.code),
        db.getAreas(current.code),
        db.getCircleBoundaries(current.code),
      ]);
      setAssignments(a);
      setOpenAreas(o);
      setReminders(r);
      setOutreach(out);
      setAreas(areaOpts);
      setAreaBoundaries(boundaries);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      scheduleAutoSave();
    }
  }

  function scheduleAutoSave() {
    if (!autoSaveHandleRef.current) return;
    if (autoSaveTimerRef.current !== null) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => void runAutoSave(), 1000);
  }

  async function runAutoSave() {
    const handle = autoSaveHandleRef.current;
    if (!handle) return;
    try {
      if (!(await hasPermission(handle))) {
        setAutoSaveStatus('needs-permission');
        return;
      }
      await writeBackupFile(handle, await db.exportJsonBackup());
      setAutoSaveStatus('on');
    } catch (err) {
      setError(`Auto-save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleAutoSaveClick() {
    try {
      const existing = autoSaveHandleRef.current;
      if (existing && autoSaveStatus === 'needs-permission') {
        if (await requestPermission(existing)) await runAutoSave();
        return;
      }
      if (existing) {
        await clearHandle();
        autoSaveHandleRef.current = null;
        setAutoSaveStatus('off');
        flash('Auto-save turned off.');
        return;
      }
      const handle = await chooseAutoSaveFile();
      if (!handle) return;
      autoSaveHandleRef.current = handle;
      await runAutoSave();
      flash(`Auto-saving to ${handle.name}.`);
    } catch (err) {
      setError(`Auto-save setup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  useEffect(() => {
    void requestPersistentStorage();
    void (async () => {
      const handle = await loadHandle();
      if (!handle) return;
      autoSaveHandleRef.current = handle;
      setAutoSaveStatus((await hasPermission(handle)) ? 'on' : 'needs-permission');
    })();
    void loadAll();
  }, [db]);

  const activeCircle = savedCircles.find((c) => c.is_active) ?? savedCircles[0] ?? null;
  // An area page has no tab of its own; highlight the tab it was opened from.
  const activeNavTab: Tab = tab === 'area' ? (selectedArea?.from ?? 'map') : tab;
  const countedAreas = useMemo(() => areas.filter((a) => a.is_counted), [areas]);
  const notCountedAreas = useMemo(() => areas.filter((a) => !a.is_counted), [areas]);
  const resultsDue = areResultsDue(activeCircle?.count_date);
  const awaitingResultsAreas = useMemo(
    () => (resultsDue ? countedAreas.filter((a) => !a.results_received) : []),
    [countedAreas, resultsDue]
  );

  const notOnListEmails = useMemo(
    () =>
      outreach
        .filter((o) => o.reason === 'not_on_list')
        .map((o) => o.email)
        .filter((e): e is string => Boolean(e)),
    [outreach]
  );

  const areaParticipantCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of assignments) {
      if (!row.area) continue;
      const key = row.area.toUpperCase();
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [assignments]);

  async function handleReassign(participationId: number, newArea: string) {
    try {
      await db.reassignArea(participationId, newArea || null);
      await loadAll();
      flash('Area assignment updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCenterChange(lat: number, lng: number) {
    if (!activeCircle) return;
    try {
      await db.updateActiveCircleCenter(activeCircle.code, lat, lng);
      await loadAll();
      flash(`Saved ${activeCircle.code} center: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSelectCircle(code: string) {
    try {
      await db.setActiveCircle(code);
      await loadAll();
      setSelectedArea(null);
      if (tab === 'area') setTab('map');
      flash(`Switched to circle ${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCreateCircle(payload: NewCirclePayload) {
    const code = payload.code.trim().toUpperCase();
    if (savedCircles.some((c) => c.code === code)) {
      setError(`Circle ${code} is already in My Circles. Select it from the list, or add the new circle with a different code.`);
      return;
    }
    try {
      await db.upsertFavoriteCircle({
        code: payload.code,
        name: payload.name,
        state_province: payload.state_province ?? null,
        center_lat: payload.center_lat,
        center_lng: payload.center_lng,
        radius_miles: payload.radius_miles ?? 7.5,
        compiler_name: payload.compiler_name ?? null,
        compiler_email: payload.compiler_email ?? null,
        count_date: payload.count_date ?? null,
        audubon_url: payload.audubon_url ?? null,
        setActive: true,
      });
      if (payload.initialBoundaries && payload.initialBoundaries.length > 0) {
        await db.upsertCircleBoundaries(code, payload.initialBoundaries);
      }
      await loadAll();
      setTab('map');
      flash(`Added ${code} (${payload.name}) to My Circles.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRenameActiveCircle() {
    if (!activeCircle) return;
    const nextName = window.prompt(
      `Rename circle ${activeCircle.code}:`,
      activeCircle.name
    );
    if (!nextName || !nextName.trim() || nextName.trim() === activeCircle.name) return;
    try {
      await db.renameCircle(activeCircle.code, nextName.trim());
      await loadAll();
      flash(`Renamed ${activeCircle.code} to "${nextName.trim()}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleRemoveActiveCircle() {
    if (!activeCircle) return;
    const target = activeCircle;
    setConfirmConfig({
      title: `Delete Circle ${target.code} — ${target.name}?`,
      message:
        'Deleting this circle permanently removes ALL data associated with it from your local browser database.',
      details: [
        'All participants, emails, and multi-year assignment history for this circle',
        'All areas, notes, and active restrictions',
        'All imported KML / KMZ map boundaries',
      ],
      confirmLabel: `Permanently Delete ${target.code}`,
      requireTypedText: target.code,
      showBackupPrompt: true,
      onConfirm: async () => {
        try {
          await db.removeFavoriteCircle(target.code);
          await loadAll();
          flash(`Removed ${target.code} from My Circles.`);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      },
    });
  }

  async function handleImportBoundaries(boundaries: ParsedAreaBoundary[]) {
    if (!activeCircle) return { saved: 0 };
    const res = await db.upsertCircleBoundaries(activeCircle.code, boundaries);
    await loadAll();
    flash(`Saved ${res.saved} KML/KMZ area boundaries for ${activeCircle.code}.`);
    return res;
  }

  async function handleClearBoundaries() {
    if (!activeCircle) return;
    const code = activeCircle.code;
    setConfirmConfig({
      title: `Clear Map Boundaries for ${code}?`,
      message: `This will remove all ${areaBoundaries.length} imported KML / KMZ polygons from ${code}'s map. Your participant roster and assignments will be kept.`,
      confirmLabel: 'Clear Map Boundaries',
      showBackupPrompt: true,
      onConfirm: async () => {
        try {
          await db.clearCircleBoundaries(code);
          await loadAll();
          flash(`Cleared imported area boundaries for ${code}.`);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      },
    });
  }

  async function handleToggleResultsReceived(areaCode: string, received: boolean) {
    if (!activeCircle) return;
    try {
      await db.setAreaResultsReceived(activeCircle.code, areaCode, received);
      await loadAll();
      flash(
        received
          ? `Marked Area ${areaCode} results as received.`
          : `Marked Area ${areaCode} as awaiting results.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function startEditCircleInfo() {
    if (!activeCircle) return;
    setEditCompilerName(activeCircle.compiler_name ?? '');
    setEditCompilerEmail(activeCircle.compiler_email ?? '');
    setEditCountDate(activeCircle.count_date ?? '');
    setEditingCircleInfo(true);
  }

  async function handleSaveCircleInfo() {
    if (!activeCircle) return;
    try {
      await db.updateCircleInfo(activeCircle.code, {
        compiler_name: editCompilerName,
        compiler_email: editCompilerEmail,
        count_date: editCountDate,
        audubon_url: activeCircle.audubon_url,
      });
      setEditingCircleInfo(false);
      await loadAll();
      flash(`Updated circle info for ${activeCircle.code}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRefreshFromAudubon() {
    if (!activeCircle) return;
    const circle = activeCircle;
    setRefreshingAudubon(true);
    try {
      const details = await fetchAudubonCircleDetails(circle.code);
      if (!details) {
        setError(`No Audubon circle page found for ${circle.code}.`);
        return;
      }
      await db.updateCircleInfo(circle.code, {
        compiler_name: details.compilerName ?? circle.compiler_name,
        compiler_email: details.compilerEmail ?? circle.compiler_email,
        count_date: details.countDate ?? circle.count_date,
        audubon_url: details.pageUrl,
      });
      await loadAll();
      flash(`Updated ${circle.code} count date and compiler from Audubon.`);
    } catch (err) {
      setError(`Audubon refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRefreshingAudubon(false);
    }
  }

  async function handleToggleAreaCounted(areaCode: string, isCounted: boolean) {
    if (!activeCircle) return;
    try {
      await db.setAreaCounted(activeCircle.code, areaCode, isCounted);
      await loadAll();
      flash(
        isCounted
          ? `Restored "${areaCode}" to counted areas.`
          : `Marked "${areaCode}" as Not Counted (kept on map in gray).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleDeleteArea(areaCode: string) {
    if (!activeCircle) return;
    const code = activeCircle.code;
    setConfirmConfig({
      title: `Remove "${areaCode}" from ${code}?`,
      message: `This removes "${areaCode}" from ${code}'s area list and unassigns any counters currently assigned to it. Any KML map outline will remain on the map.`,
      confirmLabel: `Remove ${areaCode}`,
      onConfirm: async () => {
        try {
          await db.deleteArea(code, areaCode);
          await loadAll();
          flash(`Removed "${areaCode}" from ${code} areas.`);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      },
    });
  }

  async function handleClearRoster() {
    if (!activeCircle) return;
    const code = activeCircle.code;
    setConfirmConfig({
      title: `Clear Entire Roster for ${code}?`,
      message: `This permanently deletes all participants, emails, multi-year assignments, and notes for ${code}. Your circle settings and KML map boundaries will be kept.`,
      confirmLabel: 'Clear Roster',
      showBackupPrompt: true,
      onConfirm: async () => {
        try {
          await db.clearCircleRoster(code);
          await loadAll();
          flash(`Cleared roster for ${code}. Ready to import your real spreadsheet.`);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      },
    });
  }

  async function handleImport(rows: ImportedParticipantRow[], options: ImportOptions) {
    if (!activeCircle) throw new Error('Select or add a circle first.');
    const res = await db.importParticipants(activeCircle.code, rows, options);
    await loadAll();
    return res;
  }

  async function handleBackup(): Promise<boolean> {
    let json: string;
    try {
      json = await db.exportJsonBackup();
    } catch (err) {
      setError(`Backup export failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cbc-circle-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  async function handleRestoreBackup(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (backupInputRef.current) backupInputRef.current.value = '';
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      setError(`Backup restore failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    setConfirmConfig({
      title: `Restore Backup from ${file.name}?`,
      message:
        'Restoring replaces the participants, emails, assignments, notes, and count years of every circle in this backup file. Areas and KML map boundaries are merged, not replaced.',
      confirmLabel: 'Restore Backup',
      showBackupPrompt: true,
      onConfirm: async () => {
        try {
          const res = await db.importJsonBackup(text);
          await loadAll();
          flash(`Restored ${res.people} people and ${res.participations} annual records from ${file.name}.`);
        } catch (err) {
          setError(`Backup restore failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    });
  }

  function copyBcc(emails: string[], label: string) {
    const bcc = emails.filter(Boolean).join(', ');
    void navigator.clipboard.writeText(bcc);
    flash(`Copied ${emails.length} ${label} emails to clipboard.`);
  }

  function openArea(code: string, label: string | null | undefined, from: AreaReturnTab) {
    setSelectedArea({ code, label, from });
    setTab('area');
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 7h.01" />
              <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20" />
              <path d="m20 7 2 .5-2 .5" />
              <path d="M10 18v3" />
              <path d="M14 17.75V21" />
              <path d="M7 18a6 6 0 0 0 3.84-10.61" />
            </svg>
          </div>
          <div>
            <h1>CBC Circle Manager</h1>
            <p className="subtitle">
              {activeCircle ? `${activeCircle.code} — ${activeCircle.name}` : 'Local-First PostgreSQL (PGlite)'}
            </p>
          </div>
        </div>

        <div className="controls">
          <label className="circle-selector-label">
            <span>My Circles:</span>
            <select
              aria-label="My Circles"
              title="The circle you're working on. Every tab shows data for this circle only."
              value={activeCircle?.code ?? ''}
              onChange={(e) => void handleSelectCircle(e.target.value)}
              disabled={savedCircles.length === 0}
            >
              {savedCircles.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-primary"
            type="button"
            title="Add another count circle by Audubon code, place search, KML file, or coordinates"
            onClick={() => setShowAddCircle((v) => !v)}
          >
            + Add Circle
          </button>
          {activeCircle && (
            <button
              type="button"
              title="Change the circle's display name. The circle code stays the same."
              onClick={() => void handleRenameActiveCircle()}
            >
              Rename
            </button>
          )}
          {activeCircle && savedCircles.length > 1 && (
            <button
              type="button"
              title="Permanently delete this circle and all its people, areas, notes, and map outlines from this browser"
              onClick={() => void handleRemoveActiveCircle()}
            >
              Delete Circle
            </button>
          )}
          <input
            ref={backupInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => void handleRestoreBackup(e)}
          />
          <button
            title="Download a .json file with every circle, person, season, note, and map outline. Your data lives only in this browser, so keep a copy."
            onClick={() => void handleBackup()}
          >
            Export Backup
          </button>
          <button
            title="Load a .json backup. It replaces the roster of each circle in the file. You confirm first."
            onClick={() => backupInputRef.current?.click()}
          >
            Restore Backup
          </button>
          {autoSaveStatus !== 'unsupported' && (
            <button
              type="button"
              onClick={() => void handleAutoSaveClick()}
              title={
                autoSaveStatus === 'on'
                  ? 'Auto-Save is on: the backup file on your computer is rewritten after every change. Click to turn it off.'
                  : autoSaveStatus === 'needs-permission'
                    ? 'The browser needs your OK again to write the backup file. Click to allow it.'
                    : 'Pick a file on your computer, and the app keeps a backup in it up to date after every change. Chrome and Edge only.'
              }
            >
              {autoSaveStatus === 'on'
                ? 'Auto-Save: On'
                : autoSaveStatus === 'needs-permission'
                  ? 'Auto-Save: Reconnect'
                  : 'Auto-Save: Off'}
            </button>
          )}
        </div>
      </header>

      {showAddCircle && (
        <div style={{ marginBottom: 16 }}>
          <AddCirclePanel
            onCreateCircle={handleCreateCircle}
            onClose={() => setShowAddCircle(false)}
          />
        </div>
      )}

      {!loading && activeCircle && (
        <>
          <section className="circle-info-bar" aria-label="Circle Details">
            {editingCircleInfo ? (
              <div className="circle-info-edit">
                <label>
                  <span>Count Date</span>
                  <input
                    type="text"
                    placeholder="e.g. 2026-12-19"
                    value={editCountDate}
                    onChange={(e) => setEditCountDate(e.target.value)}
                  />
                </label>
                <label>
                  <span>Compiler Name</span>
                  <input
                    type="text"
                    placeholder="Compiler name"
                    value={editCompilerName}
                    onChange={(e) => setEditCompilerName(e.target.value)}
                  />
                </label>
                <label>
                  <span>Compiler Email</span>
                  <input
                    type="text"
                    placeholder="compiler@example.com"
                    value={editCompilerEmail}
                    onChange={(e) => setEditCompilerEmail(e.target.value)}
                  />
                </label>
                <div className="row-actions" style={{ alignSelf: 'flex-end' }}>
                  <button type="button" className="btn-primary" onClick={() => void handleSaveCircleInfo()}>
                    Save Info
                  </button>
                  <button type="button" onClick={() => setEditingCircleInfo(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="circle-info-items">
                  <span>
                    <strong>Count Date:</strong> {activeCircle.count_date || 'Not set'}
                  </span>
                  <span>
                    <strong>Compiler:</strong>{' '}
                    {activeCircle.compiler_name || 'Not set'}
                    {activeCircle.compiler_email ? ` (${activeCircle.compiler_email})` : ''}
                  </span>
                  {activeCircle.audubon_url && (
                    <a href={activeCircle.audubon_url} target="_blank" rel="noreferrer">
                      Audubon CBC Page &rarr;
                    </a>
                  )}
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn-subtle"
                    disabled={refreshingAudubon}
                    title="Pull the count date and compiler from the circle's Audubon page. Works only when you run the app on your own computer."
                    onClick={() => void handleRefreshFromAudubon()}
                  >
                    {refreshingAudubon ? 'Refreshing...' : 'Refresh from Audubon'}
                  </button>
                  <button
                    type="button"
                    className="btn-subtle"
                    title="Set the count date and compiler by hand. Awaiting Results starts on the count date."
                    onClick={startEditCircleInfo}
                  >
                    Edit Circle Info
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="stats-grid" aria-label="Circle Overview">
            <div
              className="stat-card stat-violet stat-clickable"
              role="button"
              tabIndex={0}
              title="Areas marked as counted this season. Click to see every area."
              onClick={() => setTab('areas')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setTab('areas');
              }}
            >
              <div className="stat-label">Counted Areas</div>
              <div className="stat-value">{countedAreas.length}</div>
              <div className="stat-sub">Click to view all</div>
            </div>
            <div className="stat-card" title="People who are confirmed or undecided for this season">
              <div className="stat-label">Active Counters</div>
              <div className="stat-value">{assignments.length}</div>
              <div className="stat-sub">Confirmed or undecided</div>
            </div>
            <div
              className="stat-card stat-amber stat-clickable"
              role="button"
              tabIndex={0}
              title="Counted areas with no confirmed field counter yet. Feeder watchers don't count as coverage. Click to see them."
              onClick={() => setTab('open')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setTab('open');
              }}
            >
              <div className="stat-label">Open Areas</div>
              <div className="stat-value">{openAreas.length}</div>
              <div className="stat-sub">Need field coverage</div>
            </div>
            <div
              className="stat-card stat-amber stat-clickable"
              role="button"
              tabIndex={0}
              title="From count day on, counted areas whose results you haven't checked off yet. Click to follow up."
              onClick={() => setTab('results')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setTab('results');
              }}
            >
              <div className="stat-label">Awaiting Results</div>
              {resultsDue ? (
                <>
                  <div className="stat-value">{awaitingResultsAreas.length}</div>
                  <div className="stat-sub">
                    of {countedAreas.length} counted areas &middot; Click to follow up
                  </div>
                </>
              ) : (
                <>
                  <div className="stat-value">&mdash;</div>
                  <div className="stat-sub">Starts on count day, {activeCircle.count_date}</div>
                </>
              )}
            </div>
          </section>
        </>
      )}

      <nav className="tabs">
        <button
          className={activeNavTab === 'map' ? 'active' : ''}
          title="The circle on a map with your area outlines, plus eBird hotspots and recent sightings"
          onClick={() => setTab('map')}
        >
          Map &amp; eBird Scout
        </button>
        <button
          className={activeNavTab === 'areas' ? 'active' : ''}
          title="Every area in this circle, with its counters and results status"
          onClick={() => setTab('areas')}
        >
          All Areas ({areas.length})
        </button>
        <button
          className={tab === 'assignments' ? 'active' : ''}
          title="Who is counting where this season. Change a person's area here."
          onClick={() => setTab('assignments')}
        >
          Assignments ({assignments.length})
        </button>
        <button
          className={tab === 'outreach' ? 'active' : ''}
          title="Who still needs a reminder, and who you may have missed"
          onClick={() => setTab('outreach')}
        >
          Reminders &amp; Outreach ({reminders.length + outreach.length})
        </button>
        <button
          className={tab === 'import' ? 'active' : ''}
          title="Import people from a spreadsheet or Audubon list, or export the roster to Excel or CSV"
          onClick={() => setTab('import')}
        >
          Import / Export Participants
        </button>
        <button
          className={tab === 'help' ? 'active' : ''}
          title="How to get a free eBird API key, and what each map source is"
          onClick={() => setTab('help')}
        >
          Help &amp; API Keys
        </button>
      </nav>

      {toast && <div className="toast">{toast}</div>}
      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="card">Booting local PostgreSQL (PGlite)...</div>
      ) : (
        <main>
          {tab === 'assignments' && (
            <div className="card">
              <h2>
                {activeCircle ? `${activeCircle.code} — ` : ''}Current Season Assignments
              </h2>
              <table>
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Counter</th>
                    <th>Email</th>
                    <th>Type</th>
                    <th>RSVP</th>
                    <th>Active / Pinned Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        No assignments yet for {activeCircle?.code}. Import a spreadsheet or add participants.
                      </td>
                    </tr>
                  ) : (
                    assignments.map((row) => (
                      <tr key={row.participation_id}>
                        <td>
                          <select
                            value={row.area ?? ''}
                            onChange={(e) => void handleReassign(row.participation_id, e.target.value)}
                          >
                            <option value="">Unassigned</option>
                            {countedAreas.map((a) => (
                              <option key={a.code} value={a.code}>
                                {a.code} {a.cities ? `(${a.cities})` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button type="button" className="link-btn" onClick={() => setHistoryPersonId(row.person_id)}>
                            <strong>{row.full_name}</strong>
                          </button>
                          {row.is_area_leader && <span className="badge">Leader</span>}
                          <span className="muted person-since">
                            {countingSince(row.first_year_participated, row.seasons_counted)}
                          </span>
                        </td>
                        <td>{row.email ?? '—'}</td>
                        <td>
                          {row.counter_type ? (
                            <span className={`pill ${row.counter_type === 'home_feeders' ? 'pill-feeder' : 'pill-field'}`}>
                              {row.counter_type.replace('_', ' ')}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <span className={`pill ${row.rsvp_status === 'confirmed' ? 'pill-confirmed' : 'pill-undecided'}`}>
                            {row.rsvp_status}
                          </span>
                        </td>
                        <td className="notes-cell">{row.active_notes || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'open' && (
            <div className="stack">
              <div className="card">
                <h2>
                  {activeCircle ? `${activeCircle.code} — ` : ''}Open Areas (0 Confirmed Field Counters)
                </h2>
                <table>
                  <thead>
                    <tr>
                      <th>Area</th>
                      <th>Cities</th>
                      <th>Notable Spots</th>
                      <th>Feeder-Only</th>
                      <th>Active Restrictions</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openAreas.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted">
                          No open areas for {activeCircle?.code}.
                        </td>
                      </tr>
                    ) : (
                      openAreas.map((a) => (
                        <tr key={a.area}>
                          <td><strong>{a.area}</strong></td>
                          <td>{a.cities ?? '—'}</td>
                          <td>{a.notable_spots ?? '—'}</td>
                          <td>{a.feeder_only_counters}</td>
                          <td>{a.active_restrictions ?? '—'}</td>
                          <td>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="btn-subtle"
                                title="Skip this area this season. It stays on the map in gray but leaves Open Areas and assignments."
                                onClick={() => void handleToggleAreaCounted(a.area, false)}
                              >
                                Not Counted
                              </button>
                              <button
                                type="button"
                                className="btn-danger-ghost"
                                title="Delete this area from the circle and unassign its counters. A map outline stays on the map."
                                onClick={() => void handleDeleteArea(a.area)}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {notCountedAreas.length > 0 && (
                <div className="card">
                  <h2>Not Counted / Excluded Areas ({notCountedAreas.length})</h2>
                  <p className="muted">
                    Shown in muted gray on the map for reference, but excluded from Open Areas and counter assignments.
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Area</th>
                        <th>Cities</th>
                        <th>Notable Spots</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notCountedAreas.map((a) => (
                        <tr key={a.code}>
                          <td><strong>{a.code}</strong></td>
                          <td>{a.cities ?? '—'}</td>
                          <td>{a.notable_spots ?? '—'}</td>
                          <td>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="btn-subtle"
                                title="Count this area again. It shows up in Open Areas and assignments."
                                onClick={() => void handleToggleAreaCounted(a.code, true)}
                              >
                                Restore to Counted
                              </button>
                              <button
                                type="button"
                                className="btn-danger-ghost"
                                title="Delete this area from the circle and unassign its counters. A map outline stays on the map."
                                onClick={() => void handleDeleteArea(a.code)}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'outreach' && (
            <div className="stack">
              <div className="card">
                <div className="card-header">
                  <h2>Needs a Reminder ({reminders.length})</h2>
                  <button
                    className="btn-primary"
                    disabled={reminders.length === 0}
                    title="Copy these emails, separated by commas, to paste into the BCC line of one email"
                    onClick={() =>
                      copyBcc(reminders.map((r) => r.email).filter((e): e is string => Boolean(e)), 'reminder')
                    }
                  >
                    Copy BCC List
                  </button>
                </div>
                <p className="muted">
                  Active people on your current list with no answer yet for this season. Until you mark a current list
                  when you import, this shows every active person with no answer.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Last Year Counted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reminders.map((r) => (
                      <tr key={r.person_id}>
                        <td>{r.full_name}</td>
                        <td>{r.email ?? '—'}</td>
                        <td>{r.last_year_counted ?? 'Never'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2>Possible Outreach ({outreach.length})</h2>
                  <button
                    className="btn-primary"
                    disabled={notOnListEmails.length === 0}
                    title="Copy the emails of people on the Audubon list who aren't on your current list, for the BCC line. Old-email rows are left out."
                    onClick={() => copyBcc(notOnListEmails, 'not-on-list')}
                  >
                    Copy BCC: Not on Your List ({notOnListEmails.length})
                  </button>
                </div>
                <p className="muted">
                  People on the Audubon list who are not on your current list, and people on your current list who also
                  have an email that is not on it. Mark your current list when you import it. Only active and inactive
                  people are shown.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Why</th>
                      <th>Status</th>
                      <th>Last Counted</th>
                      <th>Warnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outreach.map((o) => (
                      <tr key={o.person_id}>
                        <td>
                          <button type="button" className="link-btn" onClick={() => setHistoryPersonId(o.person_id)}>
                            {o.full_name}
                          </button>
                        </td>
                        <td>{o.email ?? '—'}</td>
                        <td>
                          {o.reason === 'not_on_list'
                            ? 'On Audubon, not on your list'
                            : `Old email? ${o.old_emails ?? ''}`}
                        </td>
                        <td>{o.roster_status}</td>
                        <td>{o.last_year_counted ?? '—'}</td>
                        <td>{o.warnings || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
              onCenterChange={(lat, lng) => void handleCenterChange(lat, lng)}
              onSelectArea={(code, label) => openArea(code, label, 'map')}
              onImportBoundaries={handleImportBoundaries}
              onClearBoundaries={handleClearBoundaries}
              onSaveScoutedCircle={handleCreateCircle}
              onOpenHelp={() => setTab('help')}
            />
          )}

          {tab === 'area' && activeCircle && selectedArea && (
            <AreaDetailPage
              circleCode={activeCircle.code}
              areaCode={selectedArea.code}
              areaLabel={selectedArea.label}
              isCounted={!notCountedAreas.some((a) => a.code.toUpperCase() === selectedArea.code.toUpperCase())}
              resultsReceived={Boolean(areas.find((a) => a.code.toUpperCase() === selectedArea.code.toUpperCase())?.results_received)}
              areaInfo={areas.find((a) => a.code.toUpperCase() === selectedArea.code.toUpperCase()) ?? null}
              allAreas={countedAreas}
              assignments={assignments}
              backLabel={AREA_RETURN_LABELS[selectedArea.from]}
              onBack={() => setTab(selectedArea.from)}
              onOpenPerson={setHistoryPersonId}
              onReassign={handleReassign}
              onCopyBcc={copyBcc}
              onToggleCounted={handleToggleAreaCounted}
              onToggleResultsReceived={handleToggleResultsReceived}
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
              onToggleResultsReceived={handleToggleResultsReceived}
              onSelectArea={(code) => openArea(code, null, 'results')}
              onCopyBcc={copyBcc}
            />
          )}

          {tab === 'import' && <SpreadsheetImporter circleCode={activeCircle?.code} assignments={assignments} areas={areas} onImport={handleImport} onClearRoster={handleClearRoster} />}
          {tab === 'help' && <HelpPage />}
        </main>
      )}

      <PersonHistoryDialog db={db} personId={historyPersonId} onClose={() => setHistoryPersonId(null)} />

      <ConfirmDialog
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
        onExportBackup={handleBackup}
      />
    </div>
  );
}
