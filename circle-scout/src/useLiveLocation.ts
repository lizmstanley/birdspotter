import { useEffect, useState } from 'react';
import type { GeolocateControl } from 'maplibre-gl';
import { followLocationControl, NOT_TRACKING, type LiveLocation } from './locationTracking.ts';
import type { AreaStorage } from './savedAreas.ts';

/** @param control a control already added to a loaded map */
export function useLiveLocation(control: GeolocateControl | null, storage: AreaStorage | null): LiveLocation {
  const [live, setLive] = useState(NOT_TRACKING);

  useEffect(() => {
    if (!control) return;
    return followLocationControl(control, storage, setLive);
  }, [control, storage]);

  return live;
}
