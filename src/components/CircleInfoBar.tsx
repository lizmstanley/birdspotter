import { useState } from 'react';
import type { SavedCircle } from '../db/pgliteDb';

export interface CircleInfoInput {
  compiler_name: string;
  compiler_email: string;
  count_date: string;
}

interface Props {
  circle: SavedCircle;
  isRefreshing: boolean;
  onRefreshFromAudubon: () => void;
  /** @returns true when the info was saved */
  onSave: (info: CircleInfoInput) => Promise<boolean>;
}

export function CircleInfoBar({ circle, isRefreshing, onRefreshFromAudubon, onSave }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [compilerName, setCompilerName] = useState('');
  const [compilerEmail, setCompilerEmail] = useState('');
  const [countDate, setCountDate] = useState('');

  function startEditing() {
    setCompilerName(circle.compiler_name ?? '');
    setCompilerEmail(circle.compiler_email ?? '');
    setCountDate(circle.count_date ?? '');
    setIsEditing(true);
  }

  async function save() {
    const isSaved = await onSave({ compiler_name: compilerName, compiler_email: compilerEmail, count_date: countDate });
    if (isSaved) setIsEditing(false);
  }

  return (
    <section className="circle-info-bar" aria-label="Circle Details">
      {isEditing ? (
        <div className="circle-info-edit">
          <label>
            <span>Count Date</span>
            <input
              type="text"
              placeholder="e.g. 2026-12-19"
              value={countDate}
              onChange={(e) => setCountDate(e.target.value)}
            />
          </label>
          <label>
            <span>Compiler Name</span>
            <input
              type="text"
              placeholder="Compiler name"
              value={compilerName}
              onChange={(e) => setCompilerName(e.target.value)}
            />
          </label>
          <label>
            <span>Compiler Email</span>
            <input
              type="text"
              placeholder="compiler@example.com"
              value={compilerEmail}
              onChange={(e) => setCompilerEmail(e.target.value)}
            />
          </label>
          <div className="row-actions" style={{ alignSelf: 'flex-end' }}>
            <button type="button" className="btn-primary" onClick={() => void save()}>
              Save Info
            </button>
            <button type="button" onClick={() => setIsEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="circle-info-items">
            <span>
              <strong>Count Date:</strong> {circle.count_date || 'Not set'}
            </span>
            <span>
              <strong>Compiler:</strong> {circle.compiler_name || 'Not set'}
              {circle.compiler_email ? ` (${circle.compiler_email})` : ''}
            </span>
            {circle.audubon_url && (
              <a href={circle.audubon_url} target="_blank" rel="noreferrer">
                Audubon CBC Page &rarr;
              </a>
            )}
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn-subtle"
              disabled={isRefreshing}
              title="Pull the count date and compiler from the circle's Audubon page. Works only when you run the app on your own computer."
              onClick={onRefreshFromAudubon}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh from Audubon'}
            </button>
            <button
              type="button"
              className="btn-subtle"
              title="Set the count date and compiler by hand. Awaiting Results starts on the count date."
              onClick={startEditing}
            >
              Edit Circle Info
            </button>
          </div>
        </>
      )}
    </section>
  );
}
