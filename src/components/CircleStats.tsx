import type { ReactNode } from 'react';
import type { Tab } from '../tabs';

interface Props {
  countedAreaCount: number;
  activeCounterCount: number;
  openAreaCount: number;
  awaitingResultsCount: number;
  countedAreaTotal: number;
  areResultsDue: boolean;
  countDate: string | null;
  onOpenTab: (tab: Tab) => void;
}

interface ClickableCardProps {
  className: string;
  title: string;
  target: Tab;
  onOpenTab: (tab: Tab) => void;
  children: ReactNode;
}

function ClickableCard({ className, title, target, onOpenTab, children }: ClickableCardProps) {
  return (
    <div
      className={`stat-card ${className} stat-clickable`}
      role="button"
      tabIndex={0}
      title={title}
      onClick={() => onOpenTab(target)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpenTab(target);
      }}
    >
      {children}
    </div>
  );
}

export function CircleStats({
  countedAreaCount,
  activeCounterCount,
  openAreaCount,
  awaitingResultsCount,
  countedAreaTotal,
  areResultsDue,
  countDate,
  onOpenTab,
}: Props) {
  return (
    <section className="stats-grid" aria-label="Circle Overview">
      <ClickableCard
        className="stat-violet"
        title="Areas marked as counted this season. Click to see every area."
        target="areas"
        onOpenTab={onOpenTab}
      >
        <div className="stat-label">Counted Areas</div>
        <div className="stat-value">{countedAreaCount}</div>
        <div className="stat-sub">Click to view all</div>
      </ClickableCard>
      <div className="stat-card" title="People who are confirmed or undecided for this season">
        <div className="stat-label">Active Counters</div>
        <div className="stat-value">{activeCounterCount}</div>
        <div className="stat-sub">Confirmed or undecided</div>
      </div>
      <ClickableCard
        className="stat-amber"
        title="Counted areas with no confirmed field counter yet. Feeder watchers don't count as coverage. Click to see them."
        target="open"
        onOpenTab={onOpenTab}
      >
        <div className="stat-label">Open Areas</div>
        <div className="stat-value">{openAreaCount}</div>
        <div className="stat-sub">Need field coverage</div>
      </ClickableCard>
      <ClickableCard
        className="stat-amber"
        title="From count day on, counted areas whose results you haven't checked off yet. Click to follow up."
        target="results"
        onOpenTab={onOpenTab}
      >
        <div className="stat-label">Awaiting Results</div>
        {areResultsDue ? (
          <>
            <div className="stat-value">{awaitingResultsCount}</div>
            <div className="stat-sub">of {countedAreaTotal} counted areas &middot; Click to follow up</div>
          </>
        ) : (
          <>
            <div className="stat-value">&mdash;</div>
            <div className="stat-sub">Starts on {countDate ? `count day, ${countDate}` : 'Dec 14, when the count window opens'}</div>
          </>
        )}
      </ClickableCard>
    </section>
  );
}
