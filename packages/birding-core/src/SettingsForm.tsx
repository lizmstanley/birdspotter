import { DISTANCE_UNITS } from './distanceUnit.ts';
import {
  RADIUS_CHOICES,
  radiusText,
  REFRESH_MINUTE_CHOICES,
  refreshIntervalText,
  withDistanceUnit,
  type BirdingSettings,
} from './settings.ts';

interface SettingsFormProps {
  readonly appName: string;
  readonly settings: BirdingSettings;
  /** False when the browser blocked saving the last change. */
  readonly isSaved: boolean;
  /** Shows the search radius, for an app that searches around the person with no area of its own. */
  readonly isRadiusShown: boolean;
  readonly onChange: (settings: BirdingSettings) => void;
}

const UNIT_LABELS = { mi: 'Miles', km: 'Kilometers' } as const;

export function SettingsForm({ appName, settings, isSaved, isRadiusShown, onChange }: SettingsFormProps) {
  const radiusChoices = RADIUS_CHOICES[settings.distanceUnit];

  function pickRefresh(value: string): void {
    const refreshMinutes = REFRESH_MINUTE_CHOICES.find((choice) => String(choice) === value);
    if (refreshMinutes !== undefined) onChange({ ...settings, refreshMinutes });
  }

  function pickUnit(value: string): void {
    const distanceUnit = DISTANCE_UNITS.find((unit) => unit === value);
    if (distanceUnit !== undefined) onChange(withDistanceUnit(settings, distanceUnit));
  }

  function pickRadius(value: string): void {
    const radius = radiusChoices.find((choice) => String(choice) === value);
    if (radius !== undefined) onChange({ ...settings, radius });
  }

  return (
    <div className="birding-settings">
      <label htmlFor="birding-refresh">Check eBird for new sightings</label>
      <select id="birding-refresh" value={settings.refreshMinutes} onChange={(event) => pickRefresh(event.target.value)}>
        {REFRESH_MINUTE_CHOICES.map((minutes) => (
          <option key={minutes} value={minutes}>
            {refreshIntervalText(minutes)}
          </option>
        ))}
      </select>
      <p>Checking less often uses less data and battery.</p>
      <label htmlFor="birding-unit">Show distances in</label>
      <select id="birding-unit" value={settings.distanceUnit} onChange={(event) => pickUnit(event.target.value)}>
        {DISTANCE_UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {UNIT_LABELS[unit]}
          </option>
        ))}
      </select>
      {isRadiusShown && (
        <>
          <label htmlFor="birding-radius">Search radius</label>
          <select id="birding-radius" value={settings.radius} onChange={(event) => pickRadius(event.target.value)}>
            {radiusChoices.map((radius) => (
              <option key={radius} value={radius}>
                {radiusText(radius, settings.distanceUnit)}
              </option>
            ))}
          </select>
          <p>A wider search lists more places and uses more data.</p>
        </>
      )}
      {!isSaved && (
        <p className="birding-settings-error" role="alert">
          Your browser blocked saving settings. They work until you close {appName}.
        </p>
      )}
    </div>
  );
}
