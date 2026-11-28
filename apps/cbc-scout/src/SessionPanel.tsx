import { useEffect, useState } from 'react';
import { describeError } from '@birdspotter/birding-core/describeError.ts';
import { isFeederHours, isParticipantCount, type CountSession, type TravelMode } from './countSession.ts';
import { MODE_COLORS } from './routeLayers.ts';
import { sessionTotals, type SessionTotals, type Stretch } from './sessionStretches.ts';
import { DISTANCE_UNIT_NAMES, type DistanceUnit } from '@birdspotter/birding-core/distanceUnit.ts';
import {
  DISTANCE_LABELS,
  formatAmount,
  formatDistanceAmount,
  formatTime,
  gapNote,
  MODE_LABELS,
  sessionSummaryText,
  type StoppedSession,
} from './sessionSummary.ts';

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
  readonly onSetParticipants: (participants: number) => void;
  readonly onSetFeederHours: (hours: number) => void;
  readonly setError: (message: string | null) => void;
  readonly setNotice: (message: string | null) => void;
  readonly distanceUnit: DistanceUnit;
}

function elapsedText(hours: number): string {
  const minutes = Math.floor(hours * 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

type StretchListProps = Pick<SessionPanelProps, 'stretches' | 'onSetMode' | 'distanceUnit'>;

function StretchList({ stretches, onSetMode, distanceUnit }: StretchListProps) {
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
                {span}, {formatDistanceAmount(stretch.miles, distanceUnit)} {distanceUnit}{stretch.isGap && ', gap'}
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

interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly inputMode: 'numeric' | 'decimal';
  readonly step: number;
  readonly min: number;
  readonly isValid: (value: number) => boolean;
  readonly onChange: (value: number) => void;
}

/**
 * Keeps the typed text, so a field can be cleared while typing, and passes on only values that pass `isValid`.
 * Leaving the field puts back the saved value, so the field never shows a number the shared totals do not use.
 */
function NumberField({ label, value, inputMode, step, min, isValid, onChange }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const isTextValid = (candidate: string) => candidate.trim() !== '' && isValid(Number(candidate));
  return (
    <label>
      {label}
      <input
        type="number"
        inputMode={inputMode}
        step={step}
        min={min}
        value={text}
        aria-invalid={!isTextValid(text)}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (isTextValid(next)) onChange(Number(next));
        }}
        onBlur={() => setText(String(value))}
      />
    </label>
  );
}

type PartyFieldsProps = Pick<SessionPanelProps, 'onSetParticipants' | 'onSetFeederHours'> & {
  readonly session: CountSession;
};

function PartyFields({ session, onSetParticipants, onSetFeederHours }: PartyFieldsProps) {
  return (
    <div className="scout-party">
      <NumberField
        label="Participants"
        value={session.participants}
        inputMode="numeric"
        step={1}
        min={1}
        isValid={isParticipantCount}
        onChange={onSetParticipants}
      />
      <NumberField
        label="Feeder watching hours"
        value={session.feederHours}
        inputMode="decimal"
        step={0.25}
        min={0}
        isValid={isFeederHours}
        onChange={onSetFeederHours}
      />
    </div>
  );
}

interface TotalsTableProps {
  readonly totals: SessionTotals;
  readonly feederHours: number;
  readonly distanceUnit: DistanceUnit;
}

function TotalsTable({ totals, feederHours, distanceUnit }: TotalsTableProps) {
  return (
    <table className="scout-totals">
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col">Hours</th>
          <th scope="col">{DISTANCE_LABELS[distanceUnit]}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">{MODE_LABELS.car}</th>
          <td>{formatAmount(totals.carHours)}</td>
          <td>{formatDistanceAmount(totals.carMiles, distanceUnit)}</td>
        </tr>
        <tr>
          <th scope="row">{MODE_LABELS.foot}</th>
          <td>{formatAmount(totals.footHours)}</td>
          <td>{formatDistanceAmount(totals.footMiles, distanceUnit)}</td>
        </tr>
        <tr>
          <th scope="row">Feeder watching</th>
          <td>{formatAmount(feederHours)}</td>
          <td />
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
  const { onSetParticipants, onSetFeederHours, setError, setNotice, distanceUnit } = props;
  const now = useClock(session !== null && session.stopTime === null);

  if (!session) {
    return (
      <section className="scout-session" aria-label="Count">
        <div className="scout-actions">
          <button type="button" onClick={onStart}>
            Start count
          </button>
        </div>
        <p>
          Records your party's hours and {DISTANCE_UNIT_NAMES[distanceUnit]} by vehicle and by foot while CBC Scout is
          open.
        </p>
      </section>
    );
  }

  const totals = sessionTotals(session, stretches, now);
  if (session.stopTime === null) {
    return (
      <section className="scout-session" aria-label="Count">
        <div className="scout-actions">
          <p className="scout-session-status" role="status">
            Count running {elapsedText(totals.totalHours)},{' '}
            {formatDistanceAmount(totals.footMiles + totals.carMiles, distanceUnit)} {distanceUnit}
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
        <PartyFields
          key={session.startTime}
          session={session}
          onSetParticipants={onSetParticipants}
          onSetFeederHours={onSetFeederHours}
        />
        <StretchList stretches={stretches} onSetMode={onSetMode} distanceUnit={distanceUnit} />
      </section>
    );
  }

  const stopped: StoppedSession = { ...session, stopTime: session.stopTime };

  async function handleShare(): Promise<void> {
    // iOS may not blur a field on tap, so an invalid entry would stay on screen beside the saved value that is sent.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const text = sessionSummaryText(stopped, totals, distanceUnit);
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
      <TotalsTable totals={totals} feederHours={session.feederHours} distanceUnit={distanceUnit} />
      {totals.gapMiles > 0 && <p>{gapNote(totals.gapMiles, distanceUnit)}</p>}
      <PartyFields
        key={session.startTime}
        session={session}
        onSetParticipants={onSetParticipants}
        onSetFeederHours={onSetFeederHours}
      />
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
      <StretchList stretches={stretches} onSetMode={onSetMode} distanceUnit={distanceUnit} />
    </section>
  );
}
