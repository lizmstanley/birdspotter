import { useState } from 'react';
import { describeError } from '../../services/describeError.ts';
import {
  fetchHotspotsInCircle,
  fetchRecentSightingsInCircle,
  type EbirdHotspot,
  type EbirdObservation,
} from '@birdspotter/birding-core/ebird.ts';

interface EbirdDataOptions {
  readonly ebirdApiKey: string;
  readonly radiusMiles: number;
  readonly setStatus: (message: string | null) => void;
}

export function useEbirdData({ ebirdApiKey, radiusMiles, setStatus }: EbirdDataOptions) {
  const [backDays, setBackDays] = useState(7);
  const [hotspots, setHotspots] = useState<EbirdHotspot[]>([]);
  const [sightings, setSightings] = useState<EbirdObservation[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  function clear() {
    setHotspots([]);
    setSightings([]);
  }

  async function load(circleCode: string, lat: number, lng: number) {
    if (!ebirdApiKey) {
      setStatus('Add your free eBird API key on the Help & API Keys tab first.');
      return;
    }
    setIsBusy(true);
    setStatus(null);
    try {
      const [{ items: hs }, { items: obs }] = await Promise.all([
        fetchHotspotsInCircle(ebirdApiKey, lat, lng, radiusMiles),
        fetchRecentSightingsInCircle(ebirdApiKey, lat, lng, radiusMiles, backDays),
      ]);
      setHotspots(hs);
      setSightings(obs);
      setStatus(
        `Found ${hs.length} hotspots and ${obs.length} recent species inside ${circleCode}. Hover any icon for details or click to open in eBird. Data from eBird.org. Saved hotspots are kept for the day, sightings for 6 hours.`
      );
    } catch (err) {
      setStatus(describeError(err));
    } finally {
      setIsBusy(false);
    }
  }

  return { backDays, setBackDays, hotspots, sightings, isBusy, clear, load };
}
