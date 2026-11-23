export function HelpPage() {
  return (
    <div className="stack">
      <div className="card">
        <h2>API Keys &amp; Setup Guide</h2>
        <p className="muted">
          CBC Circle Manager runs 100% inside your browser with no central server. Only{' '}
          <strong>one free API key</strong> (eBird) is needed to load live hotspots and recent
          sightings.
        </p>

        <h3>1. eBird API Key (Required for Hotspots &amp; Recent Sightings)</h3>
        <ol className="help-steps">
          <li>
            Sign in to your free eBird / Cornell Lab account and open the{' '}
            <a href="https://ebird.org/api/keygen" target="_blank" rel="noreferrer">
              eBird API Key Request Page (ebird.org/api/keygen)
            </a>
            .
          </li>
          <li>
            Fill out the brief form (for <em>Project / Intended Use</em>, enter something like{' '}
            <code>Personal Christmas Bird Count circle scouting and hotspot mapping</code>).
          </li>
          <li>
            Cornell Lab issues your personal key immediately. Copy the key, open the{' '}
            <strong>Map &amp; eBird Scout</strong> tab, and paste it into the{' '}
            <strong>Your eBird API Key</strong> box.
          </li>
          <li>
            Your key is saved only in your browser&apos;s <code>localStorage</code> and sent
            directly from your browser to <code>api.ebird.org</code>.
          </li>
        </ol>
      </div>

      <div className="card">
        <h3>2. Map Basemaps &amp; Audubon Circle Search (No API Keys Needed)</h3>
        <ul className="help-list">
          <li>
            <strong>Street Map (OpenStreetMap):</strong> Uses keyless OpenStreetMap raster tiles—no
            registration required.
          </li>
          <li>
            <strong>Satellite Imagery (Esri World Imagery):</strong> Uses keyless Esri satellite
            tiles—no registration required.
          </li>
          <li>
            <strong>Audubon Circle Lookup:</strong> Searches Audubon&apos;s public ArcGIS CBC layer by
            circle code (e.g., <code>MNBL</code>) or name (e.g., <code>Bloomington</code>). The count
            date and compiler come from the circle&apos;s Audubon page. That needs the app&apos;s own
            server (<code>npm run dev</code> or <code>npm run preview</code>). For official compiler
            registration details, visit{' '}
            <a href="https://cbc.audubon.org/en/join" target="_blank" rel="noreferrer">
              cbc.audubon.org/en/join
            </a>
            .
          </li>
        </ul>
      </div>

      <div className="card">
        <h3>3. Privacy, Local Storage &amp; Backups</h3>
        <ul className="help-list">
          <li>
            <strong>Zero server storage:</strong> Your volunteer roster, notes, and favorite
            circles are stored in a local PostgreSQL database (PGlite) inside your browser&apos;s
            IndexedDB.
          </li>
          <li>
            <strong>Back up regularly:</strong> Because browser data can be cleared if you wipe site
            storage or switch laptops, use <strong>Export Backup</strong> in the top bar after
            importing or updating your roster.
          </li>
        </ul>
      </div>
    </div>
  );
}
