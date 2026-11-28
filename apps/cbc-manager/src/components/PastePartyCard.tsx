import { useEffect, useMemo, useState } from 'react';
import type { MultiLineString } from 'geojson';
import { useLatest } from '@birdspotter/birding-core/useLatest.ts';
import type { AreaOption, Party, SeasonParty } from '../db/pgliteDb';
import { describeError } from '../services/describeError';
import { isoDay } from '../services/countDay';
import { clockTime } from '../services/partyForm';
import type { PartyEffort } from '../services/partyCode';
import { partyFromEffort, readPastedParty, routeFromEffort } from '../services/pastedParty';

interface Props {
  circleCode: string;
  /** Counted and not counted, so a party can go into any of the circle's areas */
  areas: AreaOption[];
  /** Newest first */
  seasons: number[];
  onFindParty: (partyId: string) => Promise<SeasonParty | null>;
  onSave: (season: number, party: Party, route: MultiLineString | null) => Promise<boolean>;
}

function amount(value: number): string {
  return value.toFixed(2);
}

function when(party: Pick<Party, 'start_time' | 'stop_time'>): string {
  return `${isoDay(new Date(party.start_time))}, ${clockTime(party.start_time)} to ${clockTime(party.stop_time)}`;
}

/** Reads a party from a pasted CBC Scout message and saves it after the compiler checks it. */
export function PastePartyCard({ circleCode, areas, seasons, onFindParty, onSave }: Props) {
  const [text, setText] = useState('');
  const areaCodes = useMemo(() => areas.map((a) => a.code), [areas]);
  const read = useMemo(
    () => (text.trim() === '' ? null : readPastedParty(text, circleCode, areaCodes, seasons)),
    [text, circleCode, areaCodes, seasons]
  );

  return (
    <div className="card">
      <h2>Add Party From CBC Scout</h2>
      <p className="muted">
        Paste the whole message a party sent with <strong>Share totals</strong> in CBC Scout. Check what it says, then
        save it. Pasting the same party again replaces it.
      </p>
      <textarea
        className="paste-party-text"
        aria-label="CBC Scout message"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Christmas Bird Count party effort ... Party code: ..."
      />
      {read?.status === 'failed' && (
        <div className="error-box" role="alert">
          {read.message}
        </div>
      )}
      {read?.status === 'read' && (
        <PastedPartyPreview
          key={text}
          effort={read.effort}
          matchedArea={read.areaCode}
          datedSeason={read.season}
          areas={areas}
          seasons={seasons}
          onFindParty={onFindParty}
          onSave={async (season, party, route) => {
            if (await onSave(season, party, route)) setText('');
          }}
          onCancel={() => setText('')}
        />
      )}
    </div>
  );
}

interface PreviewProps {
  effort: PartyEffort;
  matchedArea: string | null;
  datedSeason: number | null;
  areas: AreaOption[];
  seasons: number[];
  onFindParty: (partyId: string) => Promise<SeasonParty | null>;
  onSave: (season: number, party: Party, route: MultiLineString | null) => Promise<void>;
  onCancel: () => void;
}

type SavedLookup = { status: 'loading' } | { status: 'failed'; message: string } | { status: 'done'; party: SeasonParty | null };

function PastedPartyPreview({
  effort,
  matchedArea,
  datedSeason,
  areas,
  seasons,
  onFindParty,
  onSave,
  onCancel,
}: PreviewProps) {
  const [pickedArea, setPickedArea] = useState('');
  const [pickedSeason, setPickedSeason] = useState('');
  const [saved, setSaved] = useState<SavedLookup>({ status: 'loading' });
  const [isSaving, setIsSaving] = useState(false);
  const findPartyRef = useLatest(onFindParty);

  useEffect(() => {
    let isCurrent = true;
    findPartyRef.current(effort.partyId).then(
      (party) => {
        if (isCurrent) setSaved({ status: 'done', party });
      },
      (err: unknown) => {
        if (isCurrent) setSaved({ status: 'failed', message: describeError(err) });
      }
    );
    return () => {
      isCurrent = false;
    };
  }, [effort.partyId, findPartyRef]);

  const areaCode = matchedArea ?? pickedArea;
  const season = datedSeason ?? (pickedSeason === '' ? null : Number(pickedSeason));
  const canSave = !isSaving && saved.status === 'done' && areaCode !== '' && season !== null;

  async function save() {
    if (!canSave || season === null) return;
    setIsSaving(true);
    await onSave(season, partyFromEffort(effort, areaCode), routeFromEffort(effort));
    setIsSaving(false);
  }

  return (
    <div className="party-form">
      <h3>Party Read From the Message</h3>
      <dl className="paste-party-values">
        <dt>Date</dt>
        <dd>{when({ start_time: effort.startTime, stop_time: effort.stopTime })}</dd>
        <dt>Participants</dt>
        <dd>{effort.participants}</dd>
        <dt>Hours</dt>
        <dd>
          {amount(effort.carHours)} by car, {amount(effort.footHours)} on foot, {amount(effort.feederHours)} feeder
        </dd>
        <dt>Miles</dt>
        <dd>
          {amount(effort.carMiles)} by car, {amount(effort.footMiles)} on foot
        </dd>
        <dt>Area</dt>
        <dd>{matchedArea ?? <AreaPicker effort={effort} areas={areas} value={pickedArea} onChange={setPickedArea} />}</dd>
        <dt>Season</dt>
        <dd>
          {datedSeason ?? <SeasonPicker seasons={seasons} value={pickedSeason} onChange={setPickedSeason} />}
        </dd>
      </dl>
      {saved.status === 'failed' && (
        <div className="error-box" role="alert">
          {saved.message}
        </div>
      )}
      {saved.status === 'done' && saved.party && (
        <div className="status-banner" role="status">
          This party is already saved in &ldquo;{saved.party.area_code}&rdquo; for the {saved.party.count_year} season,{' '}
          {when(saved.party)}. Saving replaces it with these values.
        </div>
      )}
      <div className="row-actions">
        <button type="button" className="btn-primary" disabled={!canSave} onClick={() => void save()}>
          {saved.status === 'done' && saved.party ? 'Replace Party' : 'Save Party'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function AreaPicker({
  effort,
  areas,
  value,
  onChange,
}: {
  effort: PartyEffort;
  areas: AreaOption[];
  value: string;
  onChange: (code: string) => void;
}) {
  const reason = effort.area
    ? `The message names area "${effort.area.areaCode}", which this circle does not have.`
    : 'The message names no area.';
  return (
    <label>
      {reason} Choose the area:{' '}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose an area</option>
        {areas.map((a) => (
          <option key={a.code} value={a.code}>
            {a.code} {a.cities ? `(${a.cities})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function SeasonPicker({
  seasons,
  value,
  onChange,
}: {
  seasons: number[];
  value: string;
  onChange: (season: string) => void;
}) {
  if (seasons.length === 0) return <span>This circle has no season to save a party in.</span>;
  return (
    <label>
      The date is not in a count window this circle has. Choose the season:{' '}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a season</option>
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
