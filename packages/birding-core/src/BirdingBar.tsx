import { useEffect, useRef, useState, type ReactNode } from 'react';

const SCREENS = ['ebird-key', 'settings', 'help', 'about'] as const;
export type Screen = (typeof SCREENS)[number];

const SCREEN_TITLES: Readonly<Record<Screen, string>> = {
  'ebird-key': 'eBird key',
  settings: 'Settings',
  help: 'Help',
  about: 'About',
};

const MENU_ID = 'birding-menu';

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

interface BirdingBarProps {
  readonly title: string;
  readonly onOpen: (screen: Screen) => void;
}

/** The top bar, with a menu that opens each screen. */
export function BirdingBar({ title, onOpen }: BirdingBarProps) {
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
    <header ref={barRef} className="birding-bar">
      <button
        type="button"
        className="birding-bar-menu"
        aria-label="Menu"
        aria-expanded={isOpen}
        aria-controls={MENU_ID}
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
      >
        <MenuIcon />
      </button>
      <span className="birding-bar-title">{title}</span>
      <nav id={MENU_ID} className="birding-menu" hidden={!isOpen} aria-label="Menu">
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

interface BirdingScreenProps {
  readonly screen: Screen;
  /** Names what closing returns to, such as the map. */
  readonly closeText: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/** A full screen over what opened it, which stays mounted beneath it. */
export function BirdingScreen({ screen, closeText, onClose, children }: BirdingScreenProps) {
  const backRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // The control that opened the screen is covered now, so focus would otherwise fall to the page.
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
    <section className="birding-screen" aria-labelledby="birding-screen-title">
      <header className="birding-bar">
        <button ref={backRef} type="button" onClick={onClose}>
          {closeText}
        </button>
        <h1 id="birding-screen-title" className="birding-bar-title">
          {SCREEN_TITLES[screen]}
        </h1>
      </header>
      <div className="birding-screen-body">{children}</div>
    </section>
  );
}
