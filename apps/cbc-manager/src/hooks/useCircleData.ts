import { useCallback, useEffect, useState } from 'react';
import type {
  AreaBoundaryRow,
  AreaOption,
  AreaPartyTotals,
  AssignmentRow,
  LocalCbcDb,
  OpenAreaRow,
  Party,
  PartyRoute,
  PossibleOutreachRow,
  ReminderRow,
  SavedCircle,
} from '../db/pgliteDb';
import { describeError } from '../services/describeError';
import { useLatest } from '@birdspotter/birding-core/useLatest.ts';
import type { SetError } from './useNotices';

export interface ActiveCircleData {
  assignments: AssignmentRow[];
  openAreas: OpenAreaRow[];
  reminders: ReminderRow[];
  outreach: PossibleOutreachRow[];
  areas: AreaOption[];
  areaBoundaries: AreaBoundaryRow[];
  parties: Party[];
  /** The current season's parties that have a route */
  partyRoutes: PartyRoute[];
  partyTotals: AreaPartyTotals[];
  /** The circle's seasons, newest first */
  seasons: number[];
}

const NO_CIRCLE_DATA: ActiveCircleData = {
  assignments: [],
  openAreas: [],
  reminders: [],
  outreach: [],
  areas: [],
  areaBoundaries: [],
  parties: [],
  partyRoutes: [],
  partyTotals: [],
  seasons: [],
};

export function pickActiveCircle(circles: readonly SavedCircle[]): SavedCircle | null {
  return circles.find((c) => c.is_active) ?? circles[0] ?? null;
}

async function loadActiveCircleData(db: LocalCbcDb, code: string): Promise<ActiveCircleData> {
  const [assignments, openAreas, reminders, outreach, areas, areaBoundaries, parties, partyRoutes, partyTotals, seasons] =
    await Promise.all([
      db.getAssignments(code),
      db.getOpenAreas(code),
      db.getNeedsReminder(code),
      db.getPossibleOutreach(code),
      db.getAreas(code),
      db.getCircleBoundaries(code),
      db.getCurrentParties(code),
      db.getCurrentPartyRoutes(code),
      db.getCurrentPartyTotals(code),
      db.getSeasons(code),
    ]);
  return {
    assignments,
    openAreas,
    reminders,
    outreach,
    areas,
    areaBoundaries,
    parties,
    partyRoutes,
    partyTotals,
    seasons,
  };
}

/** @param onSettled runs after every load, whether it worked or not */
export function useCircleData(db: LocalCbcDb, setError: SetError, onSettled: () => void) {
  const [savedCircles, setSavedCircles] = useState<SavedCircle[]>([]);
  const [data, setData] = useState<ActiveCircleData>(NO_CIRCLE_DATA);
  const [loading, setLoading] = useState(true);
  const onSettledRef = useLatest(onSettled);

  const load = useCallback(async () => {
    try {
      await db.init();
      const circles = await db.getSavedCircles();
      const current = pickActiveCircle(circles);
      setSavedCircles(circles);
      setData(current ? await loadActiveCircleData(db, current.code) : NO_CIRCLE_DATA);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
      onSettledRef.current();
    }
  }, [db, setError, onSettledRef]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    await load();
  }, [load, setError]);

  // State starts as loading with no error, so the first load skips reload's resets.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load sets state only after awaiting the database.
    void load();
  }, [load]);

  return { ...data, savedCircles, activeCircle: pickActiveCircle(savedCircles), loading, reload };
}
