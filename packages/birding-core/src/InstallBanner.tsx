import { useSyncExternalStore } from 'react';
import { chooseInstallOffer, isRunningInstalled } from './installOffer.ts';
import type { InstallPromptStore } from './installPrompt.ts';

interface InstallBannerProps {
  readonly appName: string;
  readonly installPrompt: InstallPromptStore;
}

export function InstallBanner({ appName, installPrompt }: InstallBannerProps) {
  const hasInstallPrompt = useSyncExternalStore(installPrompt.subscribe, installPrompt.hasPrompt);
  const offer = chooseInstallOffer({
    isRunningInstalled: isRunningInstalled(window),
    hasInstallPrompt,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  });

  if (offer === 'install-button') {
    return (
      <div className="birding-install">
        <span>Install {appName} on this device.</span>
        <button type="button" onClick={() => void installPrompt.install()}>
          Install
        </button>
      </div>
    );
  }
  if (offer === 'ios-steps') {
    return (
      <p className="birding-install">
        To install, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
      </p>
    );
  }
  return null;
}
