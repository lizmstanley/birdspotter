import { setWorkerUrl } from 'maplibre-gl';
import workerSource from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw';

// The phone apps' service workers save only the files index.html names, so a worker loaded as its own file would be
// missing offline. Built from source in the bundle, it opens wherever the page does.
const BUNDLED_WORKER_URL = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));

/** Points MapLibre at its worker. Call before building a map: under a bundler MapLibre cannot find the worker itself. */
export function setUpMapWorker(): void {
  setWorkerUrl(BUNDLED_WORKER_URL);
}
