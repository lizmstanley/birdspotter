import { REFRESH_MINUTE_CHOICES, refreshIntervalText, type BirdingSettings } from './settings.ts';

interface SettingsFormProps {
  readonly appName: string;
  readonly settings: BirdingSettings;
  /** False when the browser blocked saving the last change. */
  readonly isSaved: boolean;
  readonly onChange: (settings: BirdingSettings) => void;
}

export function SettingsForm({ appName, settings, isSaved, onChange }: SettingsFormProps) {
  function pickRefresh(value: string): void {
    const refreshMinutes = REFRESH_MINUTE_CHOICES.find((choice) => String(choice) === value);
    if (refreshMinutes !== undefined) onChange({ ...settings, refreshMinutes });
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
      {!isSaved && (
        <p className="birding-settings-error" role="alert">
          Your browser blocked saving settings. They work until you close {appName}.
        </p>
      )}
      <p>Checking less often uses less data and battery.</p>
    </div>
  );
}
