import { isAppleMobile } from './installOffer.ts';
import type { Place } from './nearby.ts';

/** Links to directions from the person's current location: Apple Maps on iPhone and iPad, else Google Maps. */
export function directionsUrl(place: Place, userAgent: string, maxTouchPoints: number): string {
  const destination = `${place.lat},${place.lng}`;
  if (isAppleMobile(userAgent, maxTouchPoints)) {
    return `https://maps.apple.com/?${new URLSearchParams({ daddr: destination })}`;
  }
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination })}`;
}
