import { useEffect, useRef, useState, type ReactNode } from 'react';

const SCREENS = ['ebird-key', 'settings'] as const;
export type Screen = (typeof SCREENS)[number];

const SCREEN_TITLES: Readonly<Record<Screen, string>> = {
  'ebird-key': 'eBird key',
  settings: 'Settings',
};

const MENU_ID = 'scout-menu';

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

/** The top bar, with a menu that opens each screen. */
export function ScoutBar({ onOpen }: { onOpen: (screen: Screen) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const barRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setIsOpen(false);
    }
    function closeOnTapOutside(event: PointerEvent): void {
      if (event.target instanceof Node && !barRef.current?.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnTapOutside);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnTapOutside);
    };
  }, [isOpen]);

  function open(screen: Screen): void {
    setIsOpen(false);
    onOpen(screen);
  }

  return (
    <header ref={barRef} className="scout-bar">
      <button
        type="button"
        className="scout-bar-menu"
        aria-label="Menu"
        aria-expanded={isOpen}
        aria-controls={MENU_ID}
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
      >
        <MenuIcon />
      </button>
      <span className="scout-bar-title">CBC Scout</span>
      <nav id={MENU_ID} className="scout-menu" hidden={!isOpen} aria-label="Menu">
        <ul>
          {SCREENS.map((screen) => (
            <li key={screen}>
              <button type="button" onClick={() => open(screen)}>
                {SCREEN_TITLES[screen]}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

interface ScoutScreenProps {
  readonly screen: Screen;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/** A full screen over the map, which stays mounted beneath it. */
export function ScoutScreen({ screen, onClose, children }: ScoutScreenProps) {
  const backRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // The menu item that opened the screen is hidden now, so focus would otherwise fall to the page.
    backRef.current?.focus();
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <section className="scout-screen" aria-labelledby="scout-screen-title">
      <header className="scout-bar">
        <button ref={backRef} type="button" onClick={onClose}>
          Back to map
        </button>
        <h1 id="scout-screen-title" className="scout-bar-title">
          {SCREEN_TITLES[screen]}
        </h1>
      </header>
      <div className="scout-screen-body">{children}</div>
    </section>
  );
}
