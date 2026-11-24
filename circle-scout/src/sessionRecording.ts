import type { GeolocateControl } from 'maplibre-gl';
import type { LocationFix } from './countSession.ts';
import { startTracking } from './locationTracking.ts';

/**
 * Turns on the control's location watch and reports each fix, and each break in recording: the page hidden,
 * or the watch stopped by an error or by the person.
 * @param control a control already added to the map
 * @returns a function that stops recording
 */
export function recordFromLocationControl(
  control: GeolocateControl,
  onFix: (fix: LocationFix) => void,
  onBreak: () => void
): () => void {
  function handleLocation(position: GeolocationPosition): void {
    const { longitude, latitude, accuracy } = position.coords;
    onFix({ lng: longitude, lat: latitude, time: position.timestamp, accuracy });
  }

  function handleEnd(): void {
    // MapLibre also fires this when the person pans away; fixes keep coming then.
    if (control._watchState !== 'BACKGROUND') onBreak();
  }

  function handleVisibility(): void {
    if (document.visibilityState === 'hidden') onBreak();
  }

  control.on('geolocate', handleLocation);
  control.on('trackuserlocationend', handleEnd);
  control.on('error', onBreak);
  document.addEventListener('visibilitychange', handleVisibility);
  startTracking(control);

  return () => {
    control.off('geolocate', handleLocation);
    control.off('trackuserlocationend', handleEnd);
    control.off('error', onBreak);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}
