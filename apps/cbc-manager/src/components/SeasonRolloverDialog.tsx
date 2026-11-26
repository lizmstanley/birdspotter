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
  const [isBusy, setIsBusy] = useState(false);

  async function confirm() {
    setIsBusy(true);
    try {
      await onConfirm(carryAssignments);
      onClose();
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="season-rollover-title"
      onClick={() => {
        if (!isBusy) onClose();
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
              disabled={isBusy}
              onChange={(e) => setCarryAssignments(e.target.checked)}
            />{' '}
            Keep last season&apos;s area assignments. Confirmed and undecided people who had an area keep it, with
            their RSVP set back to no response.
          </span>
        </label>
        <div className="modal-actions">
          <button type="button" disabled={isBusy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={isBusy} onClick={() => void confirm()}>
            {isBusy ? 'Working...' : `Move to ${nextSeason}`}
          </button>
        </div>
      </div>
    </div>
  );
}
