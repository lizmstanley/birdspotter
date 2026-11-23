import { useRef, type ChangeEvent } from 'react';
import {
  parseGeoJsonText,
  parseKmlText,
  parseKmzBuffer,
  type ParsedAreaBoundary,
} from '../../services/kmlParser.ts';

interface AreaImportBarProps {
  readonly activeCode: string;
  readonly areaCount: number;
  readonly setStatus: (message: string | null) => void;
  readonly onImportBoundaries?: (boundaries: ParsedAreaBoundary[]) => Promise<{ saved: number }>;
  readonly onClearBoundaries?: () => Promise<void>;
}

async function parseBoundaryFile(file: File): Promise<ParsedAreaBoundary[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.kmz')) return parseKmzBuffer(await file.arrayBuffer());
  if (lower.endsWith('.kml')) return parseKmlText(await file.text());
  return parseGeoJsonText(await file.text());
}

export function AreaImportBar({
  activeCode,
  areaCount,
  setStatus,
  onImportBoundaries,
  onClearBoundaries,
}: AreaImportBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus(null);
    try {
      const parsed = await parseBoundaryFile(file);
      if (parsed.length === 0) {
        setStatus('No polygons or lines found in that file.');
        return;
      }
      if (!onImportBoundaries) return;
      const res = await onImportBoundaries(parsed);
      setStatus(
        `Imported ${res.saved} area boundaries for ${activeCode} from ${file.name}. Hover any area to highlight it, or click to view its assigned counters.`
      );
    } catch (err) {
      setStatus(`KML/KMZ import error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="kml-bar">
      <input
        ref={fileInputRef}
        type="file"
        accept=".kml,.kmz,.geojson,.json"
        style={{ display: 'none' }}
        onChange={(e) => void handleFileChange(e)}
      />
      <button
        type="button"
        title="Add area outlines from a KML, KMZ, or GeoJSON file, for example one exported from Google My Maps. The app can't draw areas itself."
        onClick={() => fileInputRef.current?.click()}
      >
        Import KML / KMZ / GeoJSON Areas
      </button>
      {areaCount > 0 && onClearBoundaries && (
        <button
          type="button"
          title="Remove all imported area outlines from the map. Your areas and people stay."
          onClick={() => void onClearBoundaries()}
        >
          Clear Areas ({areaCount})
        </button>
      )}
      <span className="muted">
        Hover any area to highlight; click an area to view its assigned counters.
      </span>
    </div>
  );
}
