import { useEffect, useRef, useState } from 'react';
import type { GeolocateControl } from 'maplibre-gl';
import {
  isRunning,
  readCountSession,
  startSession,
  stopSession,
  withBreak,
  withCorrection,
  withFeederHours,
  withFix,
  withParticipants,
  writeCountSession,
  type CountSession,
  type SessionArea,
  type TravelMode,
} from './countSession.ts';
import type { AreaStorage } from './savedAreas.ts';
import { keepScreenOn } from './screenWakeLock.ts';
import { recordFromLocationControl } from './sessionRecording.ts';
import type { Stretch } from './sessionStretches.ts';

export const SESSION_UNREADABLE_MESSAGE = 'CBC Scout could not read the saved count, so it was cleared.';
export const SESSION_NOT_SAVED_MESSAGE =
  'Your browser is not letting CBC Scout save. This count is lost if CBC Scout closes.';

interface CountSessionOptions {
  readonly control: GeolocateControl | null;
  readonly storage: AreaStorage | null;
  readonly setError: (message: string | null) => void;
}

interface RestoredSession {
  readonly session: CountSession | null;
  readonly isUnreadable: boolean;
}

function restoreSession(storage: AreaStorage | null): RestoredSession {
  if (!storage) return { session: null, isUnreadable: false };
  try {
    const read = readCountSession(storage);
    if (read.status !== 'found') return { session: null, isUnreadable: read.status === 'unreadable' };
    // The app closed while the count ran, so recording stopped until now.
    return { session: withBreak(read.session), isUnreadable: false };
  } catch {
    return { session: null, isUnreadable: false };
  }
}

/** The count session: restored on start, saved on every change, and recorded from the map's location watch while it runs. */
export function useCountSession({ control, storage, setError }: CountSessionOptions) {
  const [restored] = useState(() => restoreSession(storage));
  const [session, setSession] = useState(restored.session);
  const [isScreenLockable, setIsScreenLockable] = useState(false);
  const hasWarnedUnsavedRef = useRef(false);
  const isSessionRunning = isRunning(session);

  useEffect(() => {
    if (restored.isUnreadable) setError(SESSION_UNREADABLE_MESSAGE);
  }, [restored, setError]);

  useEffect(() => {
    const isSaved = storage !== null && writeCountSession(storage, session);
    if (isSaved) hasWarnedUnsavedRef.current = false;
    if (isSaved || !session || hasWarnedUnsavedRef.current) return;
    hasWarnedUnsavedRef.current = true;
    setError(SESSION_NOT_SAVED_MESSAGE);
  }, [session, storage, setError]);

  useEffect(() => {
    if (!control || !isSessionRunning) return;
    return recordFromLocationControl(
      control,
      (fix) => setSession((current) => current && withFix(current, fix)),
      () => setSession((current) => current && withBreak(current))
    );
  }, [control, isSessionRunning]);

  useEffect(() => {
    if (!isSessionRunning) return;
    return keepScreenOn(() => setIsScreenLockable(true));
  }, [isSessionRunning]);

  return {
    session,
    isScreenLockable: isSessionRunning && isScreenLockable,
    start: (area: SessionArea | null) => {
      setIsScreenLockable(false);
      setSession(startSession(Date.now(), area));
    },
    stop: () => setSession((current) => current && stopSession(current, Date.now())),
    discard: () => setSession(null),
    setParticipants: (participants: number) =>
      setSession((current) => current && withParticipants(current, participants)),
    setFeederHours: (hours: number) => setSession((current) => current && withFeederHours(current, hours)),
    setStretchMode: (stretch: Stretch, mode: TravelMode) =>
      setSession(
        (current) => current && withCorrection(current, { from: stretch.startTime, to: stretch.endTime, mode })
      ),
  };
}
