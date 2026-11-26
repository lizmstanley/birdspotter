import { NeedsEbirdKey } from './NeedsEbirdKey.tsx';

interface EbirdControlsProps {
  readonly hasKey: boolean;
  readonly backDays: number;
  readonly isBusy: boolean;
  readonly onBackDaysChange: (days: number) => void;
  readonly onLoad: () => void;
  readonly onExportKml: () => void;
}

export function EbirdControls({
  hasKey,
  backDays,
  isBusy,
  onBackDaysChange,
  onLoad,
  onExportKml,
}: EbirdControlsProps) {
  return (
    <div className="ebird-bar">
      <NeedsEbirdKey hasKey={hasKey}>
        <select
          value={backDays}
          disabled={!hasKey}
          title="How far back to look for recent sightings"
          onChange={(e) => onBackDaysChange(Number(e.target.value))}
        >
          <option value={3}>Last 3 days</option>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </NeedsEbirdKey>
      <NeedsEbirdKey hasKey={hasKey}>
        <button
          className="btn-primary"
          disabled={isBusy || !hasKey}
          title="Ask eBird for hotspots and recent sightings inside the circle"
          onClick={onLoad}
        >
          {isBusy ? 'Fetching eBird...' : 'Load Hotspots & Sightings'}
        </button>
      </NeedsEbirdKey>
      <button
        type="button"
        title="Download the layers shown on the map, with eBird hotspots and sightings, as a KML file for Google Earth or My Maps"
        onClick={onExportKml}
      >
        Export Map as KML
      </button>
    </div>
  );
}
