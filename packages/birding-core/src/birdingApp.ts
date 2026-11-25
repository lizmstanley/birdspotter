/** What an app tells the core about itself. Apps share one origin, so each keeps its own state under its own keys. */
export interface BirdingApp {
  /** Shown in text such as how to allow location. */
  readonly name: string;
  /** Where the app saves whether location tracking was on, so tracking restarts on the next start. */
  readonly trackingStorageKey: string;
  /** Where the app saves its Settings screen. */
  readonly settingsStorageKey: string;
}
