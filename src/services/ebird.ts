/**
 * Client-side eBird API v2 scouting helpers + Turf.js geodesic circle builder.
 * Zero dependency on PGlite or CBC roster state—reusable directly in Aviscout.
 */
import { circle } from '@turf/circle';
import { EbirdKeyRejectedError, EbirdRequestError } from './errors.ts';

const EBIRD_KEY_REJECTED_STATUS = 403;

export interface EbirdHotspot {
  locId: string;
  locName: string;
  lat: number;
  lng: number;
  numSpeciesAllTime?: number;
  latestObsDt?: string;
}

export interface EbirdObservation {
  speciesCode: string;
  comName: string;
  sciName: string;
  locId: string;
  locName: string;
  obsDt: string;
  howMany?: number;
  lat: number;
  lng: number;
  subId: string;
}

export function buildCirclePolygon(lng: number, lat: number, radiusMiles = 7.5) {
  return circle([lng, lat], radiusMiles, {
    steps: 96,
    units: 'miles',
  });
}

export async function fetchHotspotsInCircle(
  apiKey: string,
  lat: number,
  lng: number,
  radiusMiles = 7.5
): Promise<EbirdHotspot[]> {
  const distKm = Math.min(50, Math.max(1, radiusMiles * 1.609344));
  const url =
    `https://api.ebird.org/v2/ref/hotspot/geo?lat=${encodeURIComponent(lat)}` +
    `&lng=${encodeURIComponent(lng)}&dist=${distKm.toFixed(2)}&fmt=json`;

  const res = await fetch(url, {
    headers: { 'X-eBirdApiToken': apiKey.trim() },
  });
  if (res.status === EBIRD_KEY_REJECTED_STATUS) throw new EbirdKeyRejectedError('hotspots');
  if (!res.ok) throw new EbirdRequestError('hotspots', res.status, await res.text());
  return (await res.json()) as EbirdHotspot[];
}

export async function fetchRecentSightingsInCircle(
  apiKey: string,
  lat: number,
  lng: number,
  radiusMiles = 7.5,
  backDays = 7
): Promise<EbirdObservation[]> {
  const distKm = Math.min(50, Math.max(1, radiusMiles * 1.609344));
  const clampedDays = Math.min(30, Math.max(1, backDays));
  const url =
    `https://api.ebird.org/v2/data/obs/geo/recent?lat=${encodeURIComponent(lat)}` +
    `&lng=${encodeURIComponent(lng)}&dist=${distKm.toFixed(2)}&back=${clampedDays}&fmt=json`;

  const res = await fetch(url, {
    headers: { 'X-eBirdApiToken': apiKey.trim() },
  });
  if (res.status === EBIRD_KEY_REJECTED_STATUS) throw new EbirdKeyRejectedError('sightings');
  if (!res.ok) throw new EbirdRequestError('sightings', res.status, await res.text());
  return (await res.json()) as EbirdObservation[];
}
