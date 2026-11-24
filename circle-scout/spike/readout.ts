export type CheckStatus = 'pass' | 'fail' | 'waiting';

const STATUS_LABELS: Record<CheckStatus, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  waiting: 'WAITING',
};

export function showStatus(el: HTMLElement, status: CheckStatus, detail: string): void {
  el.dataset.status = status;
  el.textContent = `${STATUS_LABELS[status]}: ${detail}`;
}

export class MissingElementError extends Error {
  readonly elementId: string;

  constructor(elementId: string) {
    super('spike page: an element the script needs is missing from the page');
    this.name = 'MissingElementError';
    this.elementId = elementId;
  }
}

/** @throws MissingElementError when the page has no element of that type with that id */
export function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new MissingElementError(id);
  return el;
}

export class CanvasUnavailableError extends Error {
  constructor() {
    super('spike page: the browser gave no 2D canvas drawing context');
    this.name = 'CanvasUnavailableError';
  }
}

/** @throws CanvasUnavailableError when the browser cannot draw 2D on a canvas */
export function canvasContext(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings
): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', options);
  if (!ctx) throw new CanvasUnavailableError();
  return ctx;
}
