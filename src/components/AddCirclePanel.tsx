import { useState, type ChangeEvent } from 'react';
import {
  searchAudubonCircles,
  withAudubonPageDetails,
  type AudubonCircleResult,
} from '../services/audubonCircles';
import {
  computeCollectionCenter,
  parseGeoJsonText,
  parseKmlText,
  parseKmzBuffer,
  type ParsedAreaBoundary,
} from '../services/kmlParser';

export interface NewCirclePayload {
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
  initialBoundaries?: ParsedAreaBoundary[];
}

interface Props {
  onCreateCircle: (payload: NewCirclePayload) => Promise<void>;
  onClose: () => void;
}

export function AddCirclePanel({ onCreateCircle, onClose }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AudubonCircleResult[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [addingCode, setAddingCode] = useState<string | null>(null);

  // KML / KMZ circle creation state
  const [kmlCode, setKmlCode] = useState('');
  const [kmlName, setKmlName] = useState('');
  const [kmlBusy, setKmlBusy] = useState(false);

  // Manual coordinates state
  const [manualCode, setManualCode] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

  async function handleSearch() {
    if (searchQuery.trim().length < 2) {
      setStatus('Enter at least 2 characters (e.g. Isabella, MN or MNBL or Hastings).');
      return;
    }
    setSearching(true);
    setStatus(null);
    try {
      const res = await searchAudubonCircles(searchQuery);
      setSearchResults(res);
      if (res.length === 0) {
        setStatus('No matching circles or places found. Try adding a state (e.g. "Isabella, MN"), import a KML/KMZ, or enter coordinates below.');
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }

  async function handleKmlCreate(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setKmlBusy(true);
    setStatus(null);
    try {
      const lower = file.name.toLowerCase();
      let parsed: ParsedAreaBoundary[];
      if (lower.endsWith('.kmz')) {
        parsed = parseKmzBuffer(await file.arrayBuffer());
      } else if (lower.endsWith('.kml')) {
        parsed = parseKmlText(await file.text());
      } else {
        parsed = parseGeoJsonText(await file.text());
      }

      if (parsed.length === 0) {
        setStatus('No polygons or lines found in that KML/KMZ/GeoJSON file.');
        return;
      }

      const center = computeCollectionCenter(parsed);
      if (!center) {
        setStatus('Could not compute center coordinates from that file.');
        return;
      }

      const baseFileName = file.name.replace(/\.(kml|kmz|geojson|json)$/i, '').trim();
      const derivedName = kmlName.trim() || baseFileName || 'Imported Circle';
      const derivedCode =
        kmlCode.trim().toUpperCase() ||
        baseFileName.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() ||
        'KML1';

      await onCreateCircle({
        code: derivedCode,
        name: derivedName,
        center_lat: center[1],
        center_lng: center[0],
        radius_miles: 7.5,
        initialBoundaries: parsed,
      });
      onClose();
    } catch (err) {
      setStatus(`KML/KMZ import error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setKmlBusy(false);
      e.target.value = '';
    }
  }

  async function handleAddSearchResult(result: AudubonCircleResult) {
    setAddingCode(result.code);
    setStatus(null);
    try {
      const c = await withAudubonPageDetails(result);
      await onCreateCircle({
        code: c.code,
        name: c.name,
        state_province: c.state || null,
        center_lat: c.lat,
        center_lng: c.lng,
        radius_miles: 7.5,
        compiler_name: c.compilerName ?? null,
        compiler_email: c.compilerEmail ?? null,
        count_date: c.countDate ?? null,
        audubon_url: c.source === 'audubon' ? c.joinUrl : null,
      });
      onClose();
    } finally {
      setAddingCode(null);
    }
  }

  async function handleManualCreate() {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (!manualCode.trim() || !manualName.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setStatus('Enter a Circle Code, Name, and valid Latitude / Longitude.');
      return;
    }
    await onCreateCircle({
      code: manualCode.trim().toUpperCase(),
      name: manualName.trim(),
      center_lat: lat,
      center_lng: lng,
      radius_miles: 7.5,
    });
    onClose();
  }

  return (
    <div className="card add-circle-panel">
      <div className="card-header">
        <h2>Add a Circle to &ldquo;My Circles&rdquo;</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>

      {status && <p className="status-banner">{status}</p>}

      {/* Option 1: Search Audubon / OSM */}
      <div className="add-section">
        <h3>1. Search by Circle Code or Place Name</h3>
        <p className="muted">
          Searches Audubon&apos;s ArcGIS CBC layer, then OpenStreetMap places. Adding an Audubon circle
          pulls its count date and compiler from its Audubon circle page. Reference:{' '}
          <a href="https://cbc.audubon.org/en/join" target="_blank" rel="noreferrer">
            cbc.audubon.org/en/join
          </a>
        </p>
        <div className="ebird-bar">
          <input
            type="text"
            placeholder="e.g. Isabella, MN or MNBL or Hastings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSearch();
            }}
          />
          <button className="btn-primary" disabled={searching} onClick={() => void handleSearch()}>
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Source</th>
                <th>Center</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map((c, idx) => (
                <tr key={`${c.code}-${idx}`}>
                  <td><strong>{c.code}</strong></td>
                  <td>{c.name}</td>
                  <td>{c.source === 'audubon' ? 'Audubon CBC' : 'OSM Place'}</td>
                  <td><code>{c.lat.toFixed(4)}, {c.lng.toFixed(4)}</code></td>
                  <td>
                    <button
                      className="btn-primary"
                      disabled={addingCode !== null}
                      onClick={() => void handleAddSearchResult(c)}
                    >
                      {addingCode === c.code ? 'Adding...' : 'Add & Select'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Option 2: Create Circle Directly from KML / KMZ / GeoJSON */}
      <div className="add-section">
        <h3>2. Create Circle by Importing a KML / KMZ / GeoJSON File</h3>
        <p className="muted">
          Automatically calculates the circle center from your polygons and imports all areas into the new circle.
        </p>
        <div className="ebird-bar">
          <input
            type="text"
            placeholder="Circle Code (optional, e.g. MNIS)"
            value={kmlCode}
            onChange={(e) => setKmlCode(e.target.value)}
          />
          <input
            type="text"
            placeholder="Circle Name (optional, defaults to filename)"
            value={kmlName}
            onChange={(e) => setKmlName(e.target.value)}
          />
          <label className="btn-primary file-btn">
            {kmlBusy ? 'Importing...' : 'Choose .kml / .kmz / .geojson'}
            <input
              type="file"
              accept=".kml,.kmz,.geojson,.json"
              style={{ display: 'none' }}
              disabled={kmlBusy}
              onChange={(e) => void handleKmlCreate(e)}
            />
          </label>
        </div>
      </div>

      {/* Option 3: Manual Coordinates */}
      <div className="add-section">
        <h3>3. Enter Exact Coordinates Manually</h3>
        <div className="ebird-bar">
          <input
            type="text"
            placeholder="Code (e.g. MNIS)"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
          />
          <input
            type="text"
            placeholder="Name (e.g. Isabella, MN)"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Lat (e.g. 47.6186)"
            value={manualLat}
            onChange={(e) => setManualLat(e.target.value)}
          />
          <input
            type="text"
            placeholder="Lng (e.g. -91.3564)"
            value={manualLng}
            onChange={(e) => setManualLng(e.target.value)}
          />
          <button type="button" onClick={() => void handleManualCreate()}>
            Save Circle
          </button>
        </div>
      </div>
    </div>
  );
}
