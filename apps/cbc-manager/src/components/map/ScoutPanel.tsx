import type { useScouting } from './useScouting.ts';
import type { ScoutedCircleDraft } from './types.ts';

interface ScoutPanelProps {
  readonly scouting: ReturnType<typeof useScouting>;
  readonly activeCode: string;
  readonly radiusMiles: number;
  readonly onSaveScoutedCircle?: (circle: ScoutedCircleDraft) => Promise<boolean>;
}

export function ScoutPanel({ scouting, activeCode, radiusMiles, onSaveScoutedCircle }: ScoutPanelProps) {
  const { target, results, error, isSearching } = scouting;

  function saveScoutedCircle() {
    if (!target || !onSaveScoutedCircle) return;
    void onSaveScoutedCircle({
      code: target.code,
      name: target.name,
      state_province: target.state ?? null,
      center_lat: target.lat,
      center_lng: target.lng,
      radius_miles: radiusMiles,
      compiler_name: target.compilerName ?? null,
      compiler_email: target.compilerEmail ?? null,
      count_date: target.countDate ?? null,
      audubon_url: target.audubonUrl ?? null,
    }).then((isAdded) => {
      if (isAdded) scouting.clearTarget();
    });
  }

  return (
    <div className="card scout-bar-card">
      <div className="card-header" style={{ marginBottom: 4 }}>
        <div>
          <h2>Scout Any Circle or Potential New Location</h2>
          <p className="muted">
            Preview a 15-mile circle and check eBird hotspots &amp; sightings anywhere—without adding it to &ldquo;My Circles&rdquo;.
          </p>
        </div>
        {target && (
          <div className="row-actions">
            {onSaveScoutedCircle && (
              <button
                type="button"
                className="btn-primary"
                title="Add this circle, at the pin's current spot, to My Circles"
                onClick={saveScoutedCircle}
              >
                Save to My Circles
              </button>
            )}
            <button type="button" onClick={scouting.exit}>
              &larr; Back to {activeCode}
            </button>
          </div>
        )}
      </div>

      <div className="ebird-bar" style={{ marginBottom: 4 }}>
        <input
          type="text"
          placeholder="Scout any CBC circle or town (e.g. Isabella, MN or Duluth, MN or St. Paul)..."
          value={scouting.query}
          onChange={(e) => scouting.setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void scouting.search();
          }}
        />
        <button
          type="button"
          className="btn-primary"
          disabled={isSearching}
          title="Look at any circle or town on the map without adding it to My Circles. Loading its hotspots and sightings needs an eBird key."
          onClick={() => void scouting.search()}
        >
          {isSearching ? 'Searching...' : 'Scout Location'}
        </button>
        <button
          type="button"
          title="Center a scouting circle on where you are now. Your browser asks for permission first."
          onClick={scouting.scoutMyLocation}
        >
          Use My Location
        </button>
      </div>

      {error && <p className="status-banner">{error}</p>}

      {results.length > 0 && (
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Location</th>
              <th>Source</th>
              <th>Center</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, idx) => (
              <tr key={`${r.code}-${idx}`}>
                <td><strong>{r.code}</strong></td>
                <td>{r.name}</td>
                <td>{r.source === 'audubon' ? 'Audubon CBC' : 'OSM Place'}</td>
                <td><code>{r.lat.toFixed(4)}, {r.lng.toFixed(4)}</code></td>
                <td>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={isSearching}
                    onClick={() => void scouting.preview(r)}
                  >
                    Preview on Map
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
