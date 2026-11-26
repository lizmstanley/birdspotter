import qrcode from 'qrcode-generator';

const CELL_PX = 4;
const QUIET_ZONE_MODULES = 4;

/** @returns an image data URL of `text` as a byte-mode QR code at medium error correction, with a quiet zone */
export function qrCodeDataUrl(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  return qr.createDataURL(CELL_PX, QUIET_ZONE_MODULES * CELL_PX);
}
