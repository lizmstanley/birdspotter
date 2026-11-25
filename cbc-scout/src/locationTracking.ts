import type { Dispatch, SetStateAction } from 'react';
import type { GeolocateControl } from 'maplibre-gl';
import { LOCATION_UNAVAILABLE_MESSAGE, locationDeniedMessage } from './locationHelp.ts';
import type { AreaStorage } from './savedAreas.ts';

export const TRACKING_STORAGE_KEY = 'cbc_scout_tracking';
const TRACKING_ON = 'on';
const PERMISSION_DENIED = 1;

export interface LiveLocation {
  /** [longitude, latitude] of the latest fix, or null before the first one */
  readonly position: readonly [number, number] | null;
  readonly isTracking: boolean;
  readonly error: string | null;
}

export const NOT_TRACKING: LiveLocation = { position: null, isTracking: false, error: null };

type WatchState = GeolocateControl['_watchState'];

/** States with no working location watch; the error states come from a timeout or lost signal. */
const STOPPED_STATES: ReadonlySet<WatchState> = new Set(['OFF', 'ACTIVE_ERROR', 'BACKGROUND_ERROR']);

function readTrackingFlag(storage: AreaStorage | null): boolean {
  try {
    return storage?.getItem(TRACKING_STORAGE_KEY) === TRACKING_ON;
  } catch {
    return false;
  }
}

function writeTrackingFlag(storage: AreaStorage | null, isOn: boolean): void {
  try {
    if (isOn) storage?.setItem(TRACKING_STORAGE_KEY, TRACKING_ON);
    else storage?.removeItem(TRACKING_STORAGE_KEY);
  } catch {
    // Blocked storage: tracking works now and is not restored on the next start. The areas already report blocked storage.
  }
}

function deniedMessage(): string {
  return locationDeniedMessage(navigator.userAgent, navigator.maxTouchPoints);
}

/** Starts the control's location watch unless one is running or the control is still setting up. */
export function startTracking(control: GeolocateControl): void {
  const state = control._watchState;
  if (state === undefined || !STOPPED_STATES.has(state)) return;
  // From an error state the first press turns tracking off; the next starts a fresh watch.
  if (state !== 'OFF') control.trigger();
  control.trigger();
}

/**
 * Follows the control's location watch, restores tracking on start, and restarts a stopped watch when the page is shown again.
 * @param control a control already added to the map
 * @returns a function that stops following
 */
export function followLocationControl(
  control: GeolocateControl,
  storage: AreaStorage | null,
  setLive: Dispatch<SetStateAction<LiveLocation>>
): () => void {
  // MapLibre has no public getter for the tracking state. It is undefined until the control's setup finishes.
  const watchState = (): WatchState | undefined => control._watchState;
  const startState = watchState();
  let wantsTracking = startState !== undefined && !STOPPED_STATES.has(startState);
  let isFollowing = true;

  function setWantsTracking(isOn: boolean): void {
    wantsTracking = isOn;
    writeTrackingFlag(storage, isOn);
  }

  function handleStart(): void {
    setWantsTracking(true);
    setLive((current) => ({ ...current, isTracking: true }));
  }

  function handleEnd(): void {
    // MapLibre also fires this when the person pans away; the dot and its updates stay on then.
    if (watchState() === 'BACKGROUND') return;
    setWantsTracking(false);
    setLive(NOT_TRACKING);
  }

  function handleLocation(position: GeolocationPosition): void {
    setLive({ position: [position.coords.longitude, position.coords.latitude], isTracking: true, error: null });
  }

  function handleError(error: GeolocationPositionError): void {
    if (error.code !== PERMISSION_DENIED) {
      setLive((current) => ({ ...current, error: LOCATION_UNAVAILABLE_MESSAGE }));
      return;
    }
    // Cleared so a reopen does not ask again for a permission the person refused.
    setWantsTracking(false);
    setLive({ ...NOT_TRACKING, error: deniedMessage() });
  }

  function restartIfStopped(): void {
    if (document.visibilityState !== 'visible' || !wantsTracking) return;
    startTracking(control);
  }

  control.on('trackuserlocationstart', handleStart);
  control.on('trackuserlocationend', handleEnd);
  control.on('geolocate', handleLocation);
  control.on('error', handleError);
  document.addEventListener('visibilitychange', restartIfStopped);
  if (!wantsTracking && readTrackingFlag(storage)) control.trigger();
  // A permission denied earlier disables the location button with no error event, so the help would not show again.
  navigator.permissions
    ?.query({ name: 'geolocation' })
    .then((status) => {
      if (isFollowing && status.state === 'denied') setLive({ ...NOT_TRACKING, error: deniedMessage() });
    })
    .catch(() => {
      // iOS 16 rejects this query; a denial then shows through the error event once the person taps the button.
    });

  return () => {
    isFollowing = false;
    control.off('trackuserlocationstart', handleStart);
    control.off('trackuserlocationend', handleEnd);
    control.off('geolocate', handleLocation);
    control.off('error', handleError);
    document.removeEventListener('visibilitychange', restartIfStopped);
  };
}
