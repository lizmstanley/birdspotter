/** CBC Scout's own Help sections, after the ones every app shares. */
export function ScoutHelp() {
  return (
    <>
      <h2>Your areas</h2>
      <p>
        Your compiler sends your count area as a link or a QR code. Open the link, or open{' '}
        <strong>Your areas</strong> from the menu and tap <strong>Paste link</strong> and paste it, or tap{' '}
        <strong>Scan QR code</strong> and point the camera at the QR code. The area can come with a note from your
        compiler, such as where to meet or which feeders you may visit. It shows on the <strong>Notes</strong> tab under the map, and on <strong>Your areas</strong>.
      </p>
      <p>
        CBC Scout keeps every area it loads, with one active at a time. With more than one, tap <strong>Make active</strong> on
        <strong>Your areas</strong>. <strong>Remove area</strong> takes that area off the phone.
      </p>
      <p>
        With an area loaded, the map shows the count circle and the area&apos;s outline. <strong>Sightings</strong>{' '}
        and <strong>Hotspots</strong> list only what is in your area, and the map shows only those places. With a route
        line instead of a shape, both cover the whole circle.
      </p>

      <h2>The street map with no signal</h2>
      <p>
        The street map needs a signal to draw, unless you save it first. With a signal, open{' '}
        <strong>Your areas</strong> and tap <strong>Save street map</strong> on the active area. CBC Scout saves the
        map over your area and says when it is done. With no signal the map then shows streets, water, and labels
        across your area, at every zoom. <strong>Remove street map</strong> takes it off the phone, and so does{' '}
        <strong>Remove area</strong>.
      </p>

      <h2>The count session</h2>
      <p>
        Tap <strong>Start count</strong> to record your party&apos;s hours and miles. While CBC Scout stays open on
        screen, it keeps the screen on, draws your route, and sorts each stretch into travel by vehicle or by foot. You
        can change any stretch&apos;s mode, and enter the number of participants and any feeder watching hours.
      </p>
      <p>
        After <strong>Stop count</strong>, <strong>Share totals</strong> sends your party&apos;s line of the count
        sheet as text, to wherever you send it. The last line, the party code, holds the same totals as a code.
      </p>
      <p>
        The phone also keeps the saved areas and the count session with its route. With an area loaded, the place
        sent to eBird is the circle&apos;s center, not your location.
      </p>
    </>
  );
}
