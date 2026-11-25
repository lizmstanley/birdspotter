import type { GeolocateControl } from 'maplibre-gl';

type WatchState = GeolocateControl['_watchState'];
type Handler = (payload?: unknown) => void;

/** Moves between watch states and fires events in the order MapLibre's GeolocateControl does. */
export class FakeLocationControl {
  _watchState: WatchState | undefined = 'OFF';
  triggerCount = 0;
  private readonly handlers = new Map<string, Set<Handler>>();

  on(type: string, handler: Handler): void {
    const set = this.handlers.get(type) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(type, set);
  }

  off(type: string, handler: Handler): void {
    this.handlers.get(type)?.delete(handler);
  }

  trigger(): boolean {
    this.triggerCount += 1;
    if (this._watchState === 'OFF') this.moveTo('WAITING_ACTIVE', 'trackuserlocationstart');
    else if (this._watchState === 'BACKGROUND') this.moveTo('ACTIVE_LOCK', 'trackuserlocationstart');
    else this.moveTo('OFF', 'trackuserlocationend');
    return true;
  }

  panAway(): void {
    this.moveTo('BACKGROUND', 'trackuserlocationend');
  }

  locate(lng: number, lat: number, timestamp = 0, accuracy = 10): void {
    if (this._watchState === 'WAITING_ACTIVE') this._watchState = 'ACTIVE_LOCK';
    this.fire('geolocate', { coords: { longitude: lng, latitude: lat, accuracy }, timestamp });
  }

  fail(code: number): void {
    this._watchState = code === 1 ? 'OFF' : 'ACTIVE_ERROR';
    this.fire('error', { code });
  }

  private moveTo(state: WatchState, event: string): void {
    this._watchState = state;
    this.fire(event);
  }

  private fire(type: string, payload?: unknown): void {
    for (const handler of this.handlers.get(type) ?? []) handler(payload);
  }
}
