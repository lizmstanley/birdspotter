const SCREENS = ['ebird-key', 'settings', 'help', 'about'] as const;
export type Screen = (typeof SCREENS)[number];

const SCREEN_TITLES: Readonly<Record<Screen, string>> = {
  'ebird-key': 'eBird key',
  settings: 'Settings',
  help: 'Help',
  about: 'About',
};

/** A screen an app adds to the menu, with the title its menu item and heading show. */
export interface AppScreen<Id extends string> {
  readonly id: Id;
  readonly title: string;
}

export class UnknownScreenError extends Error {
  readonly screen: string;

  constructor(screen: string) {
    super(`birding-core: no screen titled for ${screen}`);
    this.name = 'UnknownScreenError';
    this.screen = screen;
  }
}

/** @returns the app's screens, then the core's, in menu order */
export function menuScreens<Id extends string>(
  appScreens: readonly AppScreen<Id>[]
): readonly AppScreen<Screen | Id>[] {
  return [...appScreens, ...SCREENS.map((id) => ({ id, title: SCREEN_TITLES[id] }))];
}

/** @throws UnknownScreenError when the screen is neither the core's nor in appScreens */
export function screenTitle<Id extends string>(screen: Screen | Id, appScreens: readonly AppScreen<Id>[]): string {
  const match = menuScreens(appScreens).find((item) => item.id === screen);
  if (!match) throw new UnknownScreenError(screen);
  return match.title;
}
