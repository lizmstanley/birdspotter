import { useState } from 'react';

interface Props {
  circleCode: string;
  currentSeason: number;
  nextSeason: number;
  onClose: () => void;
  onConfirm: (carryAssignments: boolean) => Promise<void>;
}

export function SeasonRolloverDialog({ circleCode, currentSeason, nextSeason, onClose, onConfirm }: Props) {
  const [carryAssignments, setCarryAssignments] = useState(true);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(carryAssignments);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="season-rollover-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="season-rollover-title">
            Move {circleCode} to the {nextSeason} season?
          </h2>
        </div>
        <p className="modal-message">
          People, areas, pinned notes, and everything from {currentSeason} stay. Results received start empty for{' '}
          {nextSeason}, and the count date is cleared so you can set the new one from Audubon.
        </p>
        <label className="modal-type-confirm">
          <span>
            <input
              type="checkbox"
              checked={carryAssignments}
              disabled={busy}
              onChange={(e) => setCarryAssignments(e.target.checked)}
            />{' '}
            Keep last season&apos;s area assignments. Confirmed and undecided people who had an area keep it, with
            their RSVP set back to no response.
          </span>
        </label>
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Working...' : `Move to ${nextSeason}`}
          </button>
        </div>
      </div>
    </div>
  );
}
