import QRCode from 'qrcode';

const OPTIONS = { errorCorrectionLevel: 'M', margin: 2, width: 240 } as const;

/** A QR code as a `data:image/png;base64,…` URL, ready for an `<img src>`. */
export function qrCodeDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, OPTIONS);
}

/** A QR code as PNG bytes, for embedding in PDFs or sending as a file. */
export function qrCodePng(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, { ...OPTIONS, type: 'png' });
}
