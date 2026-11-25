interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallPromptStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly hasPrompt: () => boolean;
  readonly install: () => Promise<void>;
}

/**
 * Holds Chrome's deferred install prompt. Start it before the first render: Chrome can fire
 * `beforeinstallprompt` before React mounts, and it fires only once per page load.
 */
export function watchInstallPrompt(win: Window): InstallPromptStore {
  let deferred: BeforeInstallPromptEvent | null = null;
  const listeners = new Set<() => void>();

  function setDeferred(next: BeforeInstallPromptEvent | null): void {
    deferred = next;
    for (const listener of listeners) listener();
  }

  win.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    setDeferred(event as BeforeInstallPromptEvent);
  });
  win.addEventListener('appinstalled', () => setDeferred(null));

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hasPrompt: () => deferred !== null,
    async install() {
      const prompt = deferred;
      if (!prompt) return;
      // A prompt event can be shown only once, accepted or not.
      setDeferred(null);
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch (err) {
        // Nothing to retry: Chrome offers a fresh prompt on a later page load.
        console.warn('CBC Scout: install prompt failed', err);
      }
    },
  };
}
