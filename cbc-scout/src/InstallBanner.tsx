import { useSyncExternalStore } from 'react';
import { chooseInstallOffer, isRunningInstalled } from './installOffer.ts';
import type { InstallPromptStore } from './installPrompt.ts';

export function InstallBanner({ installPrompt }: { installPrompt: InstallPromptStore }) {
  const hasInstallPrompt = useSyncExternalStore(installPrompt.subscribe, installPrompt.hasPrompt);
  const offer = chooseInstallOffer({
    isRunningInstalled: isRunningInstalled(window),
    hasInstallPrompt,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  });

  if (offer === 'install-button') {
    return (
      <div className="scout-install">
        <span>Install CBC Scout on this device.</span>
        <button type="button" onClick={() => void installPrompt.install()}>
          Install
        </button>
      </div>
    );
  }
  if (offer === 'ios-steps') {
    return (
      <p className="scout-install">
        To install, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
      </p>
    );
  }
  return null;
}
