import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { useLatest } from '../../src/hooks/useLatest.ts';
import { describeError } from '../../src/services/describeError.ts';

const SCAN_TIMEOUT_MS = 120_000;
// Dense codes need enough pixels per module; larger frames cost more time per decode.
const SCAN_MAX_WIDTH_PX = 1280;
const TIMEOUT_MESSAGE = 'No code found in 2 minutes. Try again, or use Paste link.';

function cameraProblem(err: unknown): string {
  if (err instanceof DOMException && err.name === 'NotAllowedError') {
    return "CBC Scout may not use the camera. Allow the camera for this site in the phone's settings, or use Paste link.";
  }
  if (err instanceof DOMException && err.name === 'NotFoundError') return 'No camera found. Use Paste link instead.';
  return `The camera did not start: ${describeError(err)}. Use Paste link instead.`;
}

function readCode(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  const { videoWidth, videoHeight } = video;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!videoWidth || !videoHeight || !context) return null;
  const scale = Math.min(1, SCAN_MAX_WIDTH_PX / videoWidth);
  canvas.width = Math.round(videoWidth * scale);
  canvas.height = Math.round(videoHeight * scale);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

interface ScanHandlers {
  readonly onRead: (text: string) => void;
  readonly onProblem: (message: string) => void;
}

/**
 * Starts the rear camera in `video` and reads frames until a QR code is found, the scan times out, or it is stopped.
 * @returns a function that stops the camera
 */
function startScan(video: HTMLVideoElement, { onRead, onProblem }: ScanHandlers): () => void {
  const canvas = document.createElement('canvas');
  let stream: MediaStream | null = null;
  let frameRequest = 0;
  let startedAt = 0;
  let isStopped = false;

  function stop(): void {
    isStopped = true;
    cancelAnimationFrame(frameRequest);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
  }

  function scanFrame(): void {
    if (isStopped) return;
    if (Date.now() - startedAt > SCAN_TIMEOUT_MS) {
      stop();
      onProblem(TIMEOUT_MESSAGE);
      return;
    }
    const text = readCode(video, canvas);
    if (text === null) {
      frameRequest = requestAnimationFrame(scanFrame);
      return;
    }
    stop();
    onRead(text);
  }

  async function start(): Promise<void> {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 } },
        audio: false,
      });
      // The scanner may have closed while the permission prompt was open.
      if (isStopped) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = media;
      video.srcObject = media;
      await video.play();
      startedAt = Date.now();
      scanFrame();
    } catch (err) {
      if (isStopped) return;
      stop();
      onProblem(cameraProblem(err));
    }
  }

  void start();
  return stop;
}

interface AreaScannerProps {
  readonly onRead: (text: string) => void;
  readonly onClose: () => void;
}

/** Runs the rear camera while mounted and hands the first QR code it reads to `onRead`. */
export function AreaScanner({ onRead, onClose }: AreaScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const onReadRef = useLatest(onRead);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    return startScan(video, { onRead: (text) => onReadRef.current(text), onProblem: setProblem });
  }, [onReadRef]);

  return (
    <div className="scout-scanner">
      <video ref={videoRef} muted playsInline hidden={problem !== null} />
      <p role="status">{problem ?? 'Point the camera at the area code.'}</p>
      <button type="button" onClick={onClose}>
        {problem ? 'Close' : 'Stop scanning'}
      </button>
    </div>
  );
}
