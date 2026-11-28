import { useEffect, useRef, useState } from 'react';
import type { Feature, Polygon } from 'geojson';
import type { GeolocateControl } from 'maplibre-gl';
import type { AreaLinkData } from '@birdspotter/cbc-manager/services/areaLink.ts';
import type { AreaStatus } from './areaStatus.ts';
import { createEdgeCuePlayer, type EdgeCuePlayer } from './edgeCue.ts';
import { followSettledStatus } from './settledStatus.ts';

interface SettledAreaStatusOptions {
  readonly control: GeolocateControl | null;
  readonly area: AreaLinkData | null;
  /** The circle polygon drawn on the map */
  readonly circle: Feature<Polygon> | null;
  readonly isTracking: boolean;
  readonly isCueOn: boolean;
}

/**
 * Settles the counter's area status from the location watch and cues each change once it holds. It starts over when
 * the area changes or tracking stops, so the first fix after either gives no cue.
 * @returns the settled status, or null before the first fix good enough to trust
 */
export function useSettledAreaStatus({
  control,
  area,
  circle,
  isTracking,
  isCueOn,
}: SettledAreaStatusOptions): AreaStatus | null {
  const [settled, setSettled] = useState<AreaStatus | null>(null);
  const playerRef = useRef<EdgeCuePlayer | null>(null);

  useEffect(() => {
    if (!isCueOn) return;
    const player = createEdgeCuePlayer();
    playerRef.current = player;
    return () => {
      player.close();
      playerRef.current = null;
    };
  }, [isCueOn]);

  useEffect(() => {
    if (!control || !area || !circle || !isTracking) return;
    const stop = followSettledStatus(control, area, circle, setSettled, (crossing) => playerRef.current?.play(crossing));
    return () => {
      stop();
      setSettled(null);
    };
  }, [control, area, circle, isTracking]);

  return settled;
}
