import type { GeoJsonGeometry } from '../../services/kmlParser.ts';

export interface AreaBoundaryItem {
  code: string;
  label?: string | null;
  boundary_geojson: GeoJsonGeometry;
}

export interface ScoutTarget {
  code: string;
  name: string;
  state?: string;
  lat: number;
  lng: number;
  compilerName?: string;
  compilerEmail?: string;
  countDate?: string;
  audubonUrl?: string;
}

export interface ScoutedCircleDraft {
  code: string;
  name: string;
  state_province?: string | null;
  center_lat: number;
  center_lng: number;
  radius_miles?: number;
  compiler_name?: string | null;
  compiler_email?: string | null;
  count_date?: string | null;
  audubon_url?: string | null;
}
