import qrcode from 'qrcode-generator';
import {
  computeCollectionCenter,
  computeGeometryCenter,
  parseBoundaryFile,
  type ParsedAreaBoundary,
} from '../../src/services/kmlParser.ts';
import { describeError } from '../../src/services/describeError.ts';
import { buildOutlineLink, countPoints, OutlineTooLargeError, type OutlineGeometry } from './outlinePayload.ts';
import { canvasContext, showStatus } from './readout.ts';

interface QrMakeElements {
  readonly fileInput: HTMLInputElement;
  readonly outlinePick: HTMLSelectElement;
  readonly canvas: HTMLCanvasElement;
  readonly link: HTMLAnchorElement;
  readonly statusEl: HTMLElement;
}

interface OutlineChoice {
  readonly name: string;
  readonly isOuterCircle: boolean;
  readonly geometry: OutlineGeometry;
}

const QR_QUIET_ZONE_MODULES = 4;
const QR_MAX_CANVAS_PX = 600;

function toOutlineGeometry(boundary: ParsedAreaBoundary): OutlineGeometry | null {
  const { type, coordinates } = boundary.geometry;
  // The parser has already checked the coordinates against the geometry type.
  if (type === 'Polygon') return { type, coordinates: coordinates as number[][][] };
  if (type === 'MultiPolygon') return { type, coordinates: coordinates as number[][][][] };
  if (type === 'LineString') return { type, coordinates: coordinates as number[][] };
  return null;
}

function circleCenter(boundaries: readonly ParsedAreaBoundary[]): [number, number] | null {
  const outerCircle = boundaries.find((boundary) => boundary.isOuterCircle);
  if (outerCircle) return computeGeometryCenter(outerCircle.geometry);
  return computeCollectionCenter([...boundaries]);
}

function outlineChoices(boundaries: readonly ParsedAreaBoundary[]): OutlineChoice[] {
  return boundaries.flatMap((boundary) => {
    const geometry = toOutlineGeometry(boundary);
    return geometry ? [{ name: boundary.name, isOuterCircle: boundary.isOuterCircle ?? false, geometry }] : [];
  });
}

/** Area outlines rank above the outer circle, then larger outlines first, since the largest is the hardest to fit. */
function defaultChoiceIndex(choices: readonly OutlineChoice[]): number {
  let best = 0;
  let bestScore = -1;
  choices.forEach((choice, index) => {
    const score = choice.isOuterCircle ? 0 : countPoints(choice.geometry);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

/** @returns the QR version drawn */
function drawQr(canvas: HTMLCanvasElement, text: string): number {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const moduleCount = qr.getModuleCount();
  const sideModules = moduleCount + QR_QUIET_ZONE_MODULES * 2;
  const cellPx = Math.max(1, Math.floor(QR_MAX_CANVAS_PX / sideModules));
  canvas.width = sideModules * cellPx;
  canvas.height = sideModules * cellPx;
  const ctx = canvasContext(canvas);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (!qr.isDark(row, col)) continue;
      ctx.fillRect((col + QR_QUIET_ZONE_MODULES) * cellPx, (row + QR_QUIET_ZONE_MODULES) * cellPx, cellPx, cellPx);
    }
  }
  return (moduleCount - 17) / 4;
}

export function setUpQrMake(els: QrMakeElements, pageUrl: string): void {
  let choices: OutlineChoice[] = [];
  let center: [number, number] | null = null;
  showStatus(els.statusEl, 'waiting', 'Pick a boundary file.');

  function showChoice(index: number): void {
    const choice = choices[index];
    if (!choice || !center) return;
    try {
      const link = buildOutlineLink(pageUrl, { center, geometry: choice.geometry });
      const version = drawQr(els.canvas, link.url);
      els.link.href = link.url;
      els.link.hidden = false;
      showStatus(
        els.statusEl,
        'pass',
        `${link.bytes} bytes, QR version ${version}, ${link.pointsKept} of ${link.pointsIn} points kept, ` +
          `simplified at ${link.toleranceDegrees} degrees.`
      );
    } catch (err) {
      els.link.hidden = true;
      const detail = err instanceof OutlineTooLargeError ? `${err.message} (${err.bytes} bytes)` : describeError(err);
      showStatus(els.statusEl, 'fail', detail);
    }
  }

  els.fileInput.addEventListener('change', async () => {
    const file = els.fileInput.files?.[0];
    if (!file) return;
    try {
      const boundaries = await parseBoundaryFile(file);
      choices = outlineChoices(boundaries);
      center = circleCenter(boundaries);
      if (choices.length === 0 || !center) return showStatus(els.statusEl, 'fail', 'No outlines in this file.');
      els.outlinePick.replaceChildren(...choices.map((choice) => new Option(choice.name)));
      els.outlinePick.disabled = false;
      const index = defaultChoiceIndex(choices);
      els.outlinePick.selectedIndex = index;
      showChoice(index);
    } catch (err) {
      showStatus(els.statusEl, 'fail', describeError(err));
    }
  });

  els.outlinePick.addEventListener('change', () => showChoice(els.outlinePick.selectedIndex));
}
