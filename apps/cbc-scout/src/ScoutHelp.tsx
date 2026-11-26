/** CBC Scout's own Help sections, after the ones every app shares. */
export function ScoutHelp() {
  return (
    <>
      <h2>Your areas</h2>
      <p>
        Your compiler sends your count area as a link or a QR code. Open the link, or open{' '}
        <strong>Your areas</strong> from the menu and tap <strong>Paste link</strong> and paste it, or tap{' '}
        <strong>Scan area code</strong> and point the camera at the QR code.
      </p>
      <p>
        CBC Scout keeps every area it loads, with one active at a time. With more than one, pick the active area from
        the list on <strong>Your areas</strong>. <strong>Remove area</strong> takes the active area off the phone.
      </p>
      <p>
        With an area loaded, the map shows the count circle and the area&apos;s outline. <strong>Nearby</strong>{' '}
        covers the whole circle, with places in your area first. <strong>Hotspots to visit</strong> lists only the
        hotspots in your area. When the outline is a shape, not a route line, <strong>Suggestions</strong> also shows{' '}
        <strong>Birds to look for</strong>, species whose latest report is outside your area.
      </p>

      <h2>The count session</h2>
      <p>
        Tap <strong>Start count</strong> to record your party&apos;s hours and miles. While CBC Scout stays open on
        screen, it keeps the screen on, draws your route, and sorts each stretch into travel by vehicle or by foot. You
        can change any stretch&apos;s mode, and enter the number of participants and any feeder watching hours.
      </p>
      <p>
        After <strong>Stop count</strong>, <strong>Share totals</strong> sends your party&apos;s line of the count
        sheet as text, to wherever you send it.
      </p>
      <p>
        The phone also keeps the saved areas and the count session with its route. With an area loaded, the place
        sent to eBird is the circle&apos;s center, not your location.
      </p>
    </>
  );
}
