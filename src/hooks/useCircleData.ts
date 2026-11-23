import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AreaBoundaryRow,
  AreaOption,
  AssignmentRow,
  LocalCbcDb,
  OpenAreaRow,
  PossibleOutreachRow,
  ReminderRow,
  SavedCircle,
} from '../db/pgliteDb';
import { describeError } from '../services/describeError';
import type { SetError } from './useNotices';

interface ActiveCircleData {
  assignments: AssignmentRow[];
  openAreas: OpenAreaRow[];
  reminders: ReminderRow[];
  outreach: PossibleOutreachRow[];
  areas: AreaOption[];
  areaBoundaries: AreaBoundaryRow[];
}

const NO_CIRCLE_DATA: ActiveCircleData = {
  assignments: [],
  openAreas: [],
  reminders: [],
  outreach: [],
  areas: [],
  areaBoundaries: [],
};

export function pickActiveCircle(circles: readonly SavedCircle[]): SavedCircle | null {
  return circles.find((c) => c.is_active) ?? circles[0] ?? null;
}

async function loadActiveCircleData(db: LocalCbcDb, code: string): Promise<ActiveCircleData> {
  const [assignments, openAreas, reminders, outreach, areas, areaBoundaries] = await Promise.all([
    db.getAssignments(code),
    db.getOpenAreas(code),
    db.getNeedsReminder(code),
    db.getPossibleOutreach(code),
    db.getAreas(code),
    db.getCircleBoundaries(code),
  ]);
  return { assignments, openAreas, reminders, outreach, areas, areaBoundaries };
}

/** @param onSettled runs after every load, whether it worked or not */
export function useCircleData(db: LocalCbcDb, setError: SetError, onSettled: () => void) {
  const [savedCircles, setSavedCircles] = useState<SavedCircle[]>([]);
  const [data, setData] = useState<ActiveCircleData>(NO_CIRCLE_DATA);
  const [loading, setLoading] = useState(true);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
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
  }, [db, setError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...data, savedCircles, activeCircle: pickActiveCircle(savedCircles), loading, reload };
}
