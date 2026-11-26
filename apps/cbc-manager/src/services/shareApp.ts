import type { Flash, SetError } from '../hooks/useNotices';
import { describeError } from './describeError';

// Shared links always point at the hosted copy, even from a copy running on someone's own computer.
const HOSTED_SITE_URL = 'https://lizstanley.com/birdspotter/';
const CIRCLE_MANAGER_URL = `${HOSTED_SITE_URL}cbc/manager/`;
export const CBC_SCOUT_URL = `${HOSTED_SITE_URL}cbc/scout/`;
export const BIRDSPOTTER_URL = `${HOSTED_SITE_URL}app/`;

/** Opens the device's share sheet, or copies the link where the browser has none. */
export async function shareLink(
  shareData: ShareData & { url: string },
  copiedMessage: string,
  flash: Flash,
  setError: SetError
): Promise<void> {
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    await navigator.clipboard.writeText(shareData.url);
    flash(copiedMessage);
  } catch (err) {
    // Closing the share sheet is not an error.
    if (err instanceof DOMException && err.name === 'AbortError') return;
    setError(`Could not share the link: ${describeError(err)}`);
  }
}

export async function copyLink(url: string, copiedMessage: string, flash: Flash, setError: SetError): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    flash(copiedMessage);
  } catch (err) {
    setError(`Could not copy the link: ${describeError(err)}`);
  }
}

export function shareApp(flash: Flash, setError: SetError): Promise<void> {
  return shareLink(
    {
      title: 'CBC Circle Manager',
      text: 'A free, browser-only tool for Christmas Bird Count compilers.',
      url: CIRCLE_MANAGER_URL,
    },
    'Link to the app copied. Paste it anywhere to share it.',
    flash,
    setError
  );
}
