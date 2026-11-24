import * as maplibregl from 'maplibre-gl';
import { showStatus } from './readout.ts';

export interface Fix {
  readonly lat: number;
  readonly lng: number;
}

interface LastUpdate {
  readonly fix: Fix;
  readonly accuracyMeters: number;
  readonly receivedAt: number;
}

const FRESH_UPDATE_SECONDS = 15;
const POSITION_TIMEOUT_MS = 20_000;
const RECENT_FIX_MAX_AGE_MS = 60_000;
const READOUT_REFRESH_MS = 1000;

export class LocationUnavailableError extends Error {
  readonly code: number | null;

  constructor(code: number | null) {
    super('location: the phone did not return a position');
    this.name = 'LocationUnavailableError';
    this.code = code;
  }
}

function secondsSince(time: number): number {
  return Math.round((Date.now() - time) / 1000);
}

/**
 * Adds a tracking location dot to the map and keeps the readout current.
 * @returns a reader for the newest fix, or null before the first one
 */
export function startLiveLocation(map: maplibregl.Map, statusEl: HTMLElement): () => Fix | null {
  const control = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true, timeout: POSITION_TIMEOUT_MS },
    trackUserLocation: true,
    showAccuracyCircle: true,
  });
  map.addControl(control, 'top-right');

  let updateCount = 0;
  let firstUpdateAt: number | null = null;
  let last: LastUpdate | null = null;
  let errorDetail: string | null = null;

  function render(): void {
    if (errorDetail) return showStatus(statusEl, 'fail', errorDetail);
    if (!last || firstUpdateAt === null) {
      return showStatus(statusEl, 'waiting', 'Tap the location button on the map, allow location, then walk. No updates yet.');
    }
    const sinceLast = secondsSince(last.receivedAt);
    const trackingMinutes = Math.floor(secondsSince(firstUpdateAt) / 60);
    const detail =
      `${updateCount} updates, last accuracy ${Math.round(last.accuracyMeters)} m, ` +
      `${sinceLast} s since last update, tracking ${trackingMinutes} min`;
    if (sinceLast > FRESH_UPDATE_SECONDS) {
      return showStatus(statusEl, 'waiting', `${detail}. Phones can pause updates while you stand still.`);
    }
    showStatus(statusEl, updateCount >= 2 ? 'pass' : 'waiting', detail);
  }

  control.on('geolocate', (position: GeolocationPosition) => {
    const now = Date.now();
    updateCount += 1;
    firstUpdateAt ??= now;
    errorDetail = null;
    last = {
      fix: { lat: position.coords.latitude, lng: position.coords.longitude },
      accuracyMeters: position.coords.accuracy,
      receivedAt: now,
    };
    render();
  });
  control.on('error', (error: GeolocationPositionError) => {
    errorDetail = `Location error ${error.code}: ${error.message}`;
    render();
  });
  map.once('load', () => control.trigger());
  // Runs for the life of the page so the seconds-since readout keeps counting.
  setInterval(render, READOUT_REFRESH_MS);
  render();

  return () => last?.fix ?? null;
}

/** @throws LocationUnavailableError when the phone has no location or the tester refuses it */
export function requestFix(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new LocationUnavailableError(null));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => reject(new LocationUnavailableError(error.code)),
      { enableHighAccuracy: true, timeout: POSITION_TIMEOUT_MS, maximumAge: RECENT_FIX_MAX_AGE_MS }
    );
  });
}
