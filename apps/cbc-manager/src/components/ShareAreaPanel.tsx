import { useMemo, useState } from 'react';
import {
  AREA_NOTE_MAX_LENGTH,
  AreaLinkTooLargeError,
  AreaNoteTooLongError,
  buildAreaLink,
  type AreaLink,
  type AreaLinkData,
} from '../services/areaLink';
import { describeError } from '../services/describeError';
import { qrCodeDataUrl } from '../services/qrCode';
import { CBC_SCOUT_URL } from '../services/shareApp';

interface Props {
  title: string;
  linkData: AreaLinkData;
  onShareLink: (title: string, url: string) => void;
  onCopyLink: (url: string) => void;
}

// The densest code on record as scanning well on a phone held a 429-byte link at QR version 16, which tops out
// at 450 bytes at medium error correction. Raise this after a phone scan test of a denser code.
const EASY_SCAN_MAX_BYTES = 450;

type LinkResult = { status: 'ok'; link: AreaLink; qrImageUrl: string } | { status: 'error'; message: string };

function makeLink(linkData: AreaLinkData): LinkResult {
  try {
    const link = buildAreaLink(CBC_SCOUT_URL, linkData);
    return { status: 'ok', link, qrImageUrl: qrCodeDataUrl(link.url) };
  } catch (err) {
    if (err instanceof AreaLinkTooLargeError) {
      return { status: 'error', message: 'This outline is too detailed to fit in a link, even simplified.' };
    }
    if (err instanceof AreaNoteTooLongError) {
      return {
        status: 'error',
        message: `The note for counters is ${err.length} characters. Shorten it to ${AREA_NOTE_MAX_LENGTH} or fewer to share the area.`,
      };
    }
    return { status: 'error', message: `Could not make the link: ${describeError(err)}` };
  }
}

function leaderSummary(count: number, isPhoneLeftOut: boolean): string {
  if (count === 0) return 'No area leader is set, so the link has no contact.';
  const contact = isPhoneLeftOut ? 'name and email' : 'contact';
  return count === 1 ? `Includes the area leader's ${contact}.` : `Includes the ${contact} of ${count} area leaders.`;
}

function withoutPhones(linkData: AreaLinkData): AreaLinkData {
  const leaders = linkData.leaders.map(({ name, email }) => (email ? { name, email } : { name }));
  return { ...linkData, leaders };
}

export function ShareAreaPanel({ title, linkData, onShareLink, onCopyLink }: Props) {
  const [isPhoneLeftOut, setIsPhoneLeftOut] = useState(false);
  const result = useMemo(
    () => makeLink(isPhoneLeftOut ? withoutPhones(linkData) : linkData),
    [linkData, isPhoneLeftOut]
  );
  const canShare = typeof navigator.share === 'function';

  if (result.status === 'error') {
    return <div className="error-box share-area-panel">{result.message}</div>;
  }
  const { link, qrImageUrl } = result;

  return (
    <div className="share-area-panel">
      <p className="muted">
        Send this link to the area&apos;s counters. It opens the area in CBC Scout.{' '}
        {leaderSummary(linkData.leaders.length, isPhoneLeftOut)}
        {linkData.note && ' Includes the note for counters.'}
      </p>
      {linkData.leaders.some((leader) => leader.phone) && (
        <label className="share-area-option">
          <input type="checkbox" checked={isPhoneLeftOut} onChange={(e) => setIsPhoneLeftOut(e.target.checked)} />
          <span>Leave out phone numbers, for a link or code you post in public</span>
        </label>
      )}
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
      {link.bytes > EASY_SCAN_MAX_BYTES && (
        <p className="muted">
          This QR code is dense and may be hard for some phones to scan. Share Link or Copy Link sends the same area.
        </p>
      )}
      <img className="share-area-qr" src={qrImageUrl} alt={`QR code for the ${title} link`} />
    </div>
  );
}
