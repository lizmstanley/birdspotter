import { useMemo } from 'react';
import { AreaLinkTooLargeError, buildAreaLink, type AreaLink, type AreaLinkData } from '../services/areaLink';
import { describeError } from '../services/describeError';
import { qrCodeDataUrl } from '../services/qrCode';
import { CIRCLE_SCOUT_URL } from '../services/shareApp';

interface Props {
  title: string;
  linkData: AreaLinkData;
  onShareLink: (title: string, url: string) => void;
  onCopyLink: (url: string) => void;
}

type LinkResult = { status: 'ok'; link: AreaLink; qrImageUrl: string } | { status: 'error'; message: string };

function makeLink(linkData: AreaLinkData): LinkResult {
  try {
    const link = buildAreaLink(CIRCLE_SCOUT_URL, linkData);
    return { status: 'ok', link, qrImageUrl: qrCodeDataUrl(link.url) };
  } catch (err) {
    if (err instanceof AreaLinkTooLargeError) {
      return { status: 'error', message: 'This outline is too detailed to fit in a link, even simplified.' };
    }
    return { status: 'error', message: `Could not make the link: ${describeError(err)}` };
  }
}

function leaderSummary(count: number): string {
  if (count === 0) return 'No area leader is set, so the link has no contact.';
  return count === 1 ? "Includes the area leader's contact." : `Includes contact for ${count} area leaders.`;
}

export function ShareAreaPanel({ title, linkData, onShareLink, onCopyLink }: Props) {
  const result = useMemo(() => makeLink(linkData), [linkData]);
  const canShare = typeof navigator.share === 'function';

  if (result.status === 'error') {
    return <div className="error-box share-area-panel">{result.message}</div>;
  }
  const { link, qrImageUrl } = result;

  return (
    <div className="share-area-panel">
      <p className="muted">
        Send this link to the area&apos;s counters. It opens the area in Circle Scout.{' '}
        {leaderSummary(linkData.leaders.length)}
      </p>
      <div className="row-actions">
        {canShare && (
          <button type="button" className="btn-primary" onClick={() => onShareLink(title, link.url)}>
            Share Link
          </button>
        )}
        <button type="button" className={canShare ? undefined : 'btn-primary'} onClick={() => onCopyLink(link.url)}>
          Copy Link
        </button>
      </div>
      {link.pointsKept < link.pointsIn && (
        <p className="muted">
          The outline was simplified to fit: {link.pointsKept} of {link.pointsIn} points kept.
        </p>
      )}
      <p className="muted">Or print this QR code, or show it on screen, for counters in person.</p>
      <img className="share-area-qr" src={qrImageUrl} alt={`QR code for the ${title} link`} />
    </div>
  );
}
