import { EBIRD_SITE_URL } from '@birdspotter/birding-core/ebird.ts';
import { BINOCULARS_SVG, BIRD_SVG } from './mapIcons.ts';

interface LayerToggle {
  readonly isShown: boolean;
  readonly toggle: () => void;
}

interface LayerLegendProps {
  readonly isScouting: boolean;
  readonly areaCount: number;
  readonly hotspotCount: number;
  readonly sightingCount: number;
  readonly circle: LayerToggle;
  readonly areas: LayerToggle;
  readonly hotspots: LayerToggle;
  readonly sightings: LayerToggle;
}

function toggleClass({ isShown }: LayerToggle): string {
  return `legend-item legend-toggle${isShown ? '' : ' is-off'}`;
}

export function LayerLegend({
  isScouting,
  areaCount,
  hotspotCount,
  sightingCount,
  circle,
  areas,
  hotspots,
  sightings,
}: LayerLegendProps) {
  return (
    <div className="map-legend" role="group" aria-label="Show or hide map layers">
      {!isScouting && (
        <button
          type="button"
          className={toggleClass(circle)}
          aria-pressed={circle.isShown}
          title="Show or hide the 15-mile circle and its center pin. Drag the pin to move the circle's center."
          onClick={circle.toggle}
        >
          <span className="legend-dot dot-center" /> Circle &amp; Center (draggable)
        </button>
      )}
      {!isScouting && (
        <button
          type="button"
          className={toggleClass(areas)}
          aria-pressed={areas.isShown}
          title="Show or hide your imported area outlines"
          onClick={areas.toggle}
        >
          <span className="legend-dot dot-area" /> Imported Areas ({areaCount})
        </button>
      )}
      <button
        type="button"
        className={toggleClass(hotspots)}
        aria-pressed={hotspots.isShown}
        title="Show or hide eBird hotspots"
        onClick={hotspots.toggle}
      >
        <span className="legend-icon marker-hotspot" dangerouslySetInnerHTML={{ __html: BINOCULARS_SVG }} />
        eBird Hotspot ({hotspotCount})
      </button>
      <button
        type="button"
        className={toggleClass(sightings)}
        aria-pressed={sightings.isShown}
        title="Show or hide recent eBird sightings"
        onClick={sightings.toggle}
      >
        <span className="legend-icon marker-sighting" dangerouslySetInnerHTML={{ __html: BIRD_SVG }} />
        Recent Sighting ({sightingCount})
      </button>
      <span className="legend-item">
        Bird data:
        <a href={EBIRD_SITE_URL} target="_blank" rel="noreferrer">
          eBird.org
        </a>
      </span>
    </div>
  );
}
