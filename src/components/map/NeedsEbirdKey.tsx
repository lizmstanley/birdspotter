import type { ReactNode } from 'react';

const NEEDS_KEY_TITLE = 'Add your free eBird API key on the Help & API Keys tab to use this.';

/**
 * Browsers show no tooltip on a disabled control, so without a key the control sits in a span
 * that carries the tooltip instead.
 */
export function NeedsEbirdKey({ hasKey, children }: { hasKey: boolean; children: ReactNode }) {
  if (hasKey) return <>{children}</>;
  return (
    <span className="needs-key" title={NEEDS_KEY_TITLE}>
      {children}
    </span>
  );
}
