import type { SavedCircle } from '../db/pgliteDb';
import type { useCircleActions } from '../hooks/useCircleActions';
import type { Tab } from '../tabs';
import { CircleInfoBar } from './CircleInfoBar';
import { CircleStats } from './CircleStats';
import { SeasonRolloverBanner } from './SeasonRolloverBanner';

interface Props {
  circle: SavedCircle;
  circleActions: ReturnType<typeof useCircleActions>;
  currentSeason: number | null;
  rolloverSeason: number | null;
  isRolloverDismissed: boolean;
  countedAreaCount: number;
  activeCounterCount: number;
  openAreaCount: number;
  awaitingResultsCount: number;
  areResultsDue: boolean;
  onStartRollover: () => void;
  onDismissRollover: () => void;
  onOpenTab: (tab: Tab) => void;
}

export function CircleOverview({
  circle,
  circleActions,
  currentSeason,
  rolloverSeason,
  isRolloverDismissed,
  countedAreaCount,
  activeCounterCount,
  openAreaCount,
  awaitingResultsCount,
  areResultsDue,
  onStartRollover,
  onDismissRollover,
  onOpenTab,
}: Props) {
  return (
    <>
      <CircleInfoBar
        circle={circle}
        isRefreshing={circleActions.refreshingAudubon}
        onRefreshFromAudubon={() => void circleActions.refreshFromAudubon()}
        onSave={circleActions.saveCircleInfo}
      />
      {rolloverSeason !== null && currentSeason !== null && !isRolloverDismissed && (
        <SeasonRolloverBanner
          circleCode={circle.code}
          currentSeason={currentSeason}
          nextSeason={rolloverSeason}
          onStart={onStartRollover}
          onDismiss={onDismissRollover}
        />
      )}
      <CircleStats
        countedAreaCount={countedAreaCount}
        activeCounterCount={activeCounterCount}
        openAreaCount={openAreaCount}
        awaitingResultsCount={awaitingResultsCount}
        countedAreaTotal={countedAreaCount}
        areResultsDue={areResultsDue}
        countDate={circle.count_date}
        onOpenTab={onOpenTab}
      />
    </>
  );
}
