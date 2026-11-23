import { useState } from 'react';
import {
  searchAudubonCircles,
  withAudubonPageDetails,
  type AudubonCircleResult,
} from '../../services/audubonCircles.ts';
import type { ScoutTarget } from './types.ts';

interface ScoutingOptions {
  readonly setStatus: (message: string | null) => void;
  readonly clearEbirdResults: () => void;
}

export function useScouting({ setStatus, clearEbirdResults }: ScoutingOptions) {
  const [target, setTarget] = useState<ScoutTarget | null>(null);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<AudubonCircleResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  function exit() {
    setTarget(null);
    setResults([]);
    setError(null);
    clearEbirdResults();
    setStatus(null);
  }

  function clearTarget() {
    setTarget(null);
  }

  function movePin(lat: number, lng: number) {
    setTarget((prev) => (prev ? { ...prev, lat, lng } : prev));
  }

  async function search() {
    if (query.trim().length < 2) {
      setError('Enter a circle name, code, or town (e.g. Isabella, MN or Duluth, MN).');
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      const found = await searchAudubonCircles(query);
      setResults(found);
      if (found.length === 0) {
        setError('No matching circles or places found. Try adding a state (e.g. "Isabella, MN").');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSearching(false);
    }
  }

  async function preview(result: AudubonCircleResult) {
    setIsSearching(true);
    try {
      const r = await withAudubonPageDetails(result);
      setTarget({
        code: r.code,
        name: r.name,
        state: r.state,
        lat: r.lat,
        lng: r.lng,
        compilerName: r.compilerName,
        compilerEmail: r.compilerEmail,
        countDate: r.countDate,
        audubonUrl: r.source === 'audubon' ? r.joinUrl : undefined,
      });
      setResults([]);
      setQuery('');
      clearEbirdResults();
      setStatus(
        `Scouting ${r.code} — ${r.name}. Drag the red pin to test new circle placements, then click "Load Hotspots & Sightings".`
      );
    } finally {
      setIsSearching(false);
    }
  }

  function scoutMyLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setTarget({
          code: 'SCOUT',
          name: 'My Current Location',
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        });
        setResults([]);
        clearEbirdResults();
        setStatus('Scouting 15-mile circle at your current location. Drag the red pin or click "Load Hotspots & Sightings".');
      },
      (err) => setError(`Location error: ${err.message}`)
    );
  }

  return {
    target,
    query,
    setQuery,
    isSearching,
    results,
    error,
    exit,
    clearTarget,
    movePin,
    search,
    preview,
    scoutMyLocation,
  };
}
