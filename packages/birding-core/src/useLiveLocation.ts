import { useEffect, useState } from 'react';
import type { GeolocateControl } from 'maplibre-gl';
import type { BirdingApp } from './birdingApp.ts';
import { followLocationControl, NOT_TRACKING, type LiveLocation } from './locationTracking.ts';
import type { KeyValueStorage } from './storage.ts';

/** @param control a control already added to a loaded map */
export function useLiveLocation(
  control: GeolocateControl | null,
  storage: KeyValueStorage | null,
  app: BirdingApp
): LiveLocation {
  const [live, setLive] = useState(NOT_TRACKING);

  useEffect(() => {
    if (!control) return;
    return followLocationControl(control, storage, app, setLive);
  }, [control, storage, app]);

  return live;
}
