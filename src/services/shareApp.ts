import type { Flash, SetError } from '../hooks/useNotices';
import { describeError } from './describeError';

// Shared links always point at the hosted copy, even from a copy running on someone's own computer.
const HOSTED_APP_URL = 'https://lizmstanley.github.io/cbc-circle-manager/';

export async function shareApp(flash: Flash, setError: SetError): Promise<void> {
  const shareData = {
    title: 'CBC Circle Manager',
    text: 'A free, browser-only tool for Christmas Bird Count compilers.',
    url: HOSTED_APP_URL,
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    await navigator.clipboard.writeText(HOSTED_APP_URL);
    flash('Link to the app copied. Paste it anywhere to share it.');
  } catch (err) {
    // Closing the share sheet is not an error.
    if (err instanceof DOMException && err.name === 'AbortError') return;
    setError(`Could not share the link: ${describeError(err)}`);
  }
}
