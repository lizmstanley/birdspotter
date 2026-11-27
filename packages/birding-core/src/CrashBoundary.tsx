import { Component, type CSSProperties, type ReactNode } from 'react';

interface CrashBoundaryProps {
  readonly appName: string;
  readonly children: ReactNode;
}

interface CrashBoundaryState {
  readonly hasCrashed: boolean;
}

// Inline, because the circle manager loads no birding.css.
const SCREEN_STYLE: CSSProperties = {
  boxSizing: 'border-box',
  minHeight: '100vh',
  padding: '2rem 1rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1rem',
  textAlign: 'center',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '1.125rem',
  lineHeight: 1.4,
  color: '#1f2937',
  background: '#ffffff',
};

const BUTTON_STYLE: CSSProperties = {
  minHeight: '48px',
  padding: '0.75rem 2rem',
  font: 'inherit',
  fontWeight: 600,
  color: '#ffffff',
  background: '#1f2937',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
};

/**
 * Shows a message and a Reload button in place of a screen that threw while drawing.
 * React 19 reports the caught error with console.error. Touches no storage, so saved data survives the reload.
 */
export class CrashBoundary extends Component<CrashBoundaryProps, CrashBoundaryState> {
  state: CrashBoundaryState = { hasCrashed: false };

  static getDerivedStateFromError(): CrashBoundaryState {
    return { hasCrashed: true };
  }

  render(): ReactNode {
    if (!this.state.hasCrashed) return this.props.children;
    return (
      <main role="alert" style={SCREEN_STYLE}>
        <p style={{ margin: 0, maxWidth: '24rem' }}>{this.props.appName} hit a problem and stopped.</p>
        <button type="button" style={BUTTON_STYLE} onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    );
  }
}
