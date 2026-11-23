interface Props {
  circleCode: string;
  currentSeason: number;
  nextSeason: number;
  onStart: () => void;
  onDismiss: () => void;
}

export function SeasonRolloverBanner({ circleCode, currentSeason, nextSeason, onStart, onDismiss }: Props) {
  return (
    <div className="status-banner season-banner" role="status">
      <span>
        {circleCode} is still on the {currentSeason} season. Move it to {nextSeason}? Your people, areas, and
        notes stay, and {currentSeason} stays on record.
      </span>
      <span className="row-actions">
        <button type="button" className="btn-primary" onClick={onStart}>
          Move to {nextSeason}
        </button>
        <button type="button" onClick={onDismiss}>
          Not now
        </button>
      </span>
    </div>
  );
}
