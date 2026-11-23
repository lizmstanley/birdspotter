import type { AreaOption, OpenAreaRow } from '../db/pgliteDb';

interface Props {
  circleCode: string;
  openAreas: readonly OpenAreaRow[];
  notCountedAreas: readonly AreaOption[];
  onToggleCounted: (areaCode: string, isCounted: boolean) => void;
  onDeleteArea: (areaCode: string) => void;
}

const REMOVE_AREA_TITLE =
  'Delete this area from the circle and unassign its counters. A map outline stays on the map.';

export function OpenAreasTab({ circleCode, openAreas, notCountedAreas, onToggleCounted, onDeleteArea }: Props) {
  return (
    <div className="stack">
      <div className="card">
        <h2>{circleCode} — Open Areas (0 Confirmed Field Counters)</h2>
        <table>
          <thead>
            <tr>
              <th>Area</th>
              <th>Cities</th>
              <th>Notable Spots</th>
              <th>Feeder-Only</th>
              <th>Active Restrictions</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {openAreas.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No open areas for {circleCode}.
                </td>
              </tr>
            ) : (
              openAreas.map((a) => (
                <tr key={a.area}>
                  <td><strong>{a.area}</strong></td>
                  <td>{a.cities ?? '—'}</td>
                  <td>{a.notable_spots ?? '—'}</td>
                  <td>{a.feeder_only_counters}</td>
                  <td>{a.active_restrictions ?? '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn-subtle"
                        title="Skip this area this season. It stays on the map in gray but leaves Open Areas and assignments."
                        onClick={() => onToggleCounted(a.area, false)}
                      >
                        Not Counted
                      </button>
                      <button
                        type="button"
                        className="btn-danger-ghost"
                        title={REMOVE_AREA_TITLE}
                        onClick={() => onDeleteArea(a.area)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {notCountedAreas.length > 0 && (
        <div className="card">
          <h2>Not Counted / Excluded Areas ({notCountedAreas.length})</h2>
          <p className="muted">
            Shown in muted gray on the map for reference, but excluded from Open Areas and counter assignments.
          </p>
          <table>
            <thead>
              <tr>
                <th>Area</th>
                <th>Cities</th>
                <th>Notable Spots</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {notCountedAreas.map((a) => (
                <tr key={a.code}>
                  <td><strong>{a.code}</strong></td>
                  <td>{a.cities ?? '—'}</td>
                  <td>{a.notable_spots ?? '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn-subtle"
                        title="Count this area again. It shows up in Open Areas and assignments."
                        onClick={() => onToggleCounted(a.code, true)}
                      >
                        Restore to Counted
                      </button>
                      <button
                        type="button"
                        className="btn-danger-ghost"
                        title={REMOVE_AREA_TITLE}
                        onClick={() => onDeleteArea(a.code)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
