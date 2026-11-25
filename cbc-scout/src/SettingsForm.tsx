import { REFRESH_MINUTE_CHOICES, refreshIntervalText, type ScoutSettings } from './scoutSettings.ts';

interface SettingsFormProps {
  readonly settings: ScoutSettings;
  /** False when the browser blocked saving the last change. */
  readonly isSaved: boolean;
  readonly onChange: (settings: ScoutSettings) => void;
}

export function SettingsForm({ settings, isSaved, onChange }: SettingsFormProps) {
  function pickRefresh(value: string): void {
    const refreshMinutes = REFRESH_MINUTE_CHOICES.find((choice) => String(choice) === value);
    if (refreshMinutes !== undefined) onChange({ ...settings, refreshMinutes });
  }

  return (
    <div className="scout-settings">
      <label htmlFor="scout-refresh">Check eBird for new sightings</label>
      <select id="scout-refresh" value={settings.refreshMinutes} onChange={(event) => pickRefresh(event.target.value)}>
        {REFRESH_MINUTE_CHOICES.map((minutes) => (
          <option key={minutes} value={minutes}>
            {refreshIntervalText(minutes)}
          </option>
        ))}
      </select>
      {!isSaved && (
        <p className="scout-settings-error" role="alert">
          Your browser blocked saving settings. They work until you close CBC Scout.
        </p>
      )}
      <p>Checking less often uses less data and battery.</p>
    </div>
  );
}
