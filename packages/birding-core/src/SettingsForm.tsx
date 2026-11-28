import type { ReactNode } from 'react';
import {
  RADIUS_MILE_CHOICES,
  radiusText,
  REFRESH_MINUTE_CHOICES,
  refreshIntervalText,
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
  /** An app's own settings, after the shared ones. */
  readonly children?: ReactNode;
}

export function SettingsForm({ appName, settings, isSaved, isRadiusShown, onChange, children }: SettingsFormProps) {
  function pickRefresh(value: string): void {
    const refreshMinutes = REFRESH_MINUTE_CHOICES.find((choice) => String(choice) === value);
    if (refreshMinutes !== undefined) onChange({ ...settings, refreshMinutes });
  }

  function pickRadius(value: string): void {
    const radiusMiles = RADIUS_MILE_CHOICES.find((choice) => String(choice) === value);
    if (radiusMiles !== undefined) onChange({ ...settings, radiusMiles });
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
      {isRadiusShown && (
        <>
          <label htmlFor="birding-radius">Search radius</label>
          <select id="birding-radius" value={settings.radiusMiles} onChange={(event) => pickRadius(event.target.value)}>
            {RADIUS_MILE_CHOICES.map((miles) => (
              <option key={miles} value={miles}>
                {radiusText(miles)}
              </option>
            ))}
          </select>
          <p>A wider search lists more places and uses more data.</p>
        </>
      )}
      {children}
      {!isSaved && (
        <p className="birding-settings-error" role="alert">
          Your browser blocked saving settings. They work until you close {appName}.
        </p>
      )}
    </div>
  );
}
