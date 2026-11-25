/** A saved copy is from the last 6 hours, so the time of day alone is clear. */
export function fetchedTimeText(fetchedAt: number): string {
  return new Date(fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * What the lists show while eBird cannot be reached.
 * @param sightingsFetchedAt when eBird sent the sightings held, or null when none are held
 * @param hotspotsFetchedAt when eBird sent the hotspots held, or null when none are held
 */
export function noSignalText(sightingsFetchedAt: number | null, hotspotsFetchedAt: number | null): string {
  if (sightingsFetchedAt === null) {
    if (hotspotsFetchedAt === null) {
      return 'No signal, and no eBird data from the last 6 hours. The lists fill in when a signal returns.';
    }
    return `No signal. Showing hotspots fetched at ${fetchedTimeText(hotspotsFetchedAt)}. No sightings from the last 6 hours.`;
  }
  if (hotspotsFetchedAt === null) {
    return `No signal. Showing sightings fetched at ${fetchedTimeText(sightingsFetchedAt)}. No hotspots from the last 6 hours.`;
  }
  return (
    `No signal. Showing sightings fetched at ${fetchedTimeText(sightingsFetchedAt)} ` +
    `and hotspots fetched at ${fetchedTimeText(hotspotsFetchedAt)}.`
  );
}
