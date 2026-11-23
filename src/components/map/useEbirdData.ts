import { useState } from 'react';
import { describeError } from '../../services/describeError.ts';
import {
  fetchHotspotsInCircle,
  fetchRecentSightingsInCircle,
  type EbirdHotspot,
  type EbirdObservation,
} from '../../services/ebird.ts';

interface EbirdDataOptions {
  readonly ebirdApiKey: string;
  readonly radiusMiles: number;
  readonly setStatus: (message: string | null) => void;
}

export function useEbirdData({ ebirdApiKey, radiusMiles, setStatus }: EbirdDataOptions) {
  const [backDays, setBackDays] = useState(7);
  const [hotspots, setHotspots] = useState<EbirdHotspot[]>([]);
  const [sightings, setSightings] = useState<EbirdObservation[]>([]);
  const [busy, setBusy] = useState(false);

  function clear() {
    setHotspots([]);
    setSightings([]);
  }

  async function load(circleCode: string, lat: number, lng: number) {
    if (!ebirdApiKey) {
      setStatus('Add your free eBird API key on the Help & API Keys tab first.');
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const [hs, obs] = await Promise.all([
        fetchHotspotsInCircle(ebirdApiKey, lat, lng, radiusMiles),
        fetchRecentSightingsInCircle(ebirdApiKey, lat, lng, radiusMiles, backDays),
      ]);
      setHotspots(hs);
      setSightings(obs);
      setStatus(
        `Found ${hs.length} hotspots and ${obs.length} recent species inside ${circleCode}. Hover any icon for details or click to open in eBird.`
      );
    } catch (err) {
      setStatus(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return { backDays, setBackDays, hotspots, sightings, busy, clear, load };
}
