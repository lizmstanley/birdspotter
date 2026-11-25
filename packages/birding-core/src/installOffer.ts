export type InstallOffer = 'install-button' | 'ios-steps' | 'none';

export interface InstallContext {
  readonly isRunningInstalled: boolean;
  readonly hasInstallPrompt: boolean;
  readonly userAgent: string;
  readonly maxTouchPoints: number;
}

export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  // iPadOS Safari reports a Mac user agent; only the touch screen tells it apart.
  return userAgent.includes('Macintosh') && maxTouchPoints > 1;
}

/** Picks how to offer installing: Chrome's own prompt, the iOS share-sheet steps, or nothing. */
export function chooseInstallOffer(context: InstallContext): InstallOffer {
  if (context.isRunningInstalled) return 'none';
  if (context.hasInstallPrompt) return 'install-button';
  if (isAppleMobile(context.userAgent, context.maxTouchPoints)) return 'ios-steps';
  return 'none';
}

/** True when opened from the home screen rather than a browser tab. */
export function isRunningInstalled(win: Window): boolean {
  if (win.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari reports home-screen launches only through this non-standard flag.
  return (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
}
