import { useEffect, useState } from 'react';
import { describeError } from '../../src/services/describeError.ts';
import type { CountSession, TravelMode } from './countSession.ts';
import { MODE_COLORS } from './routeLayers.ts';
import { sessionTotals, type SessionTotals, type Stretch } from './sessionStretches.ts';
import { formatAmount, formatTime, MODE_LABELS, sessionSummaryText, type StoppedSession } from './sessionSummary.ts';

const CLOCK_TICK_MS = 15_000;

interface SessionPanelProps {
  readonly session: CountSession | null;
  readonly stretches: readonly Stretch[];
  readonly isScreenLockable: boolean;
  readonly isLocationOff: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onDiscard: () => void;
  readonly onSetMode: (stretch: Stretch, mode: TravelMode) => void;
  readonly setError: (message: string | null) => void;
  readonly setNotice: (message: string | null) => void;
}

function elapsedText(hours: number): string {
  const minutes = Math.floor(hours * 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

function StretchList({ stretches, onSetMode }: Pick<SessionPanelProps, 'stretches' | 'onSetMode'>) {
  if (stretches.length === 0) return null;
  return (
    <details className="scout-stretches">
      <summary>Route stretches ({stretches.length})</summary>
      <ul>
        {stretches.map((stretch) => {
          const span = `${formatTime(stretch.startTime)} to ${formatTime(stretch.endTime)}`;
          return (
            <li key={stretch.startTime}>
              <span className="scout-swatch" style={{ background: MODE_COLORS[stretch.mode] }} aria-hidden="true" />
              <span>
                {span}, {formatAmount(stretch.miles)} mi{stretch.isGap && ', gap'}
              </span>
              <select
                aria-label={`Mode from ${span}`}
                value={stretch.mode}
                onChange={(event) => onSetMode(stretch, event.target.value === 'car' ? 'car' : 'foot')}
              >
                <option value="foot">{MODE_LABELS.foot}</option>
                <option value="car">{MODE_LABELS.car}</option>
              </select>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function TotalsTable({ totals }: { readonly totals: SessionTotals }) {
  return (
    <table className="scout-totals">
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col">Hours</th>
          <th scope="col">Miles</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">{MODE_LABELS.foot}</th>
          <td>{formatAmount(totals.footHours)}</td>
          <td>{formatAmount(totals.footMiles)}</td>
        </tr>
        <tr>
          <th scope="row">{MODE_LABELS.car}</th>
          <td>{formatAmount(totals.carHours)}</td>
          <td>{formatAmount(totals.carMiles)}</td>
        </tr>
        <tr>
          <th scope="row">Total</th>
          <td>{formatAmount(totals.totalHours)}</td>
          <td>{formatAmount(totals.footMiles + totals.carMiles)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** @returns the current time, updated on a timer while the count runs so the elapsed time moves */
function useClock(isTicking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isTicking) return;
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, [isTicking]);
  return now;
}

export function SessionPanel(props: SessionPanelProps) {
  const { session, stretches, isScreenLockable, isLocationOff, onStart, onStop, onDiscard, onSetMode } = props;
  const { setError, setNotice } = props;
  const now = useClock(session !== null && session.stopTime === null);

  if (!session) {
    return (
      <section className="scout-session" aria-label="Count">
        <div className="scout-actions">
          <button type="button" onClick={onStart}>
            Start count
          </button>
        </div>
        <p>Records your party's hours and miles on foot and by car while Circle Scout is open.</p>
      </section>
    );
  }

  const totals = sessionTotals(session, stretches, now);
  if (session.stopTime === null) {
    return (
      <section className="scout-session" aria-label="Count">
        <div className="scout-actions">
          <p className="scout-session-status" role="status">
            Count running {elapsedText(totals.totalHours)}, {formatAmount(totals.footMiles + totals.carMiles)} mi
          </p>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Stop the count? Hours stop adding up, and a stopped count cannot restart.')) onStop();
            }}
          >
            Stop count
          </button>
        </div>
        {isLocationOff && <p>Recording paused: location is off. Tap the location button on the map to resume.</p>}
        {isScreenLockable && (
          <p>This browser cannot keep the screen on. Recording pauses while the screen is locked.</p>
        )}
        <StretchList stretches={stretches} onSetMode={onSetMode} />
      </section>
    );
  }

  const stopped: StoppedSession = { ...session, stopTime: session.stopTime };

  async function handleShare(): Promise<void> {
    const text = sessionSummaryText(stopped, totals);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Count totals', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setNotice('Totals copied. Paste them into a message to your compiler.');
    } catch (err) {
      // Closing the share sheet is not an error.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(`Could not share the totals: ${describeError(err)}`);
    }
  }

  function handleNew(): void {
    if (window.confirm('Start a new count? These totals are removed from this phone.')) onStart();
  }

  function handleDiscard(): void {
    if (window.confirm('Remove these totals from this phone?')) onDiscard();
  }

  return (
    <section className="scout-session" aria-label="Count">
      <h2>
        Count totals, {formatTime(session.startTime)} to {formatTime(session.stopTime)}
      </h2>
      <TotalsTable totals={totals} />
      <p>{formatAmount(totals.gapMiles)} of the miles are straight lines across gaps in the route.</p>
      <div className="scout-actions">
        <button type="button" onClick={() => void handleShare()}>
          Share totals
        </button>
        <button type="button" onClick={handleNew}>
          New count
        </button>
        <button type="button" onClick={handleDiscard}>
          Remove
        </button>
      </div>
      <StretchList stretches={stretches} onSetMode={onSetMode} />
    </section>
  );
}
