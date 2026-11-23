interface Props {
  onAddCircle: () => void;
}

export function FirstCircleCard({ onAddCircle }: Props) {
  return (
    <div className="card first-circle-card">
      <h2>Add your first circle to get started</h2>
      <p>
        A circle is one Christmas Bird Count. Add yours by its Audubon code (like <code>MNBL</code>) or a town name,
        from a KML file of your count areas, or by entering the center coordinates.
      </p>
      <p className="muted">
        Then import your participant list on the <strong>Import / Export Participants</strong> tab. Already used the
        app somewhere else? Use <strong>Restore Backup</strong> at the top instead.
      </p>
      <button type="button" className="btn-primary" onClick={onAddCircle}>
        + Add Circle
      </button>
    </div>
  );
}
