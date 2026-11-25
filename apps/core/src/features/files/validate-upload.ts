import { formatBytes, SECURITY } from '@bossbyte/shared';

const { allowedMimeTypes, maxFileSizeBytes } = SECURITY.uploads;

/** For the file input's `accept` attribute, so the picker only offers usable files. */
export const UPLOAD_ACCEPT = allowedMimeTypes.join(',');

export const UPLOAD_HINT = `JPEG, PNG, WebP, PDF, CSV or Excel, up to ${formatBytes(maxFileSizeBytes)}.`;

/**
 * Checks a file against the same limits the API enforces (`SECURITY.uploads`),
 * so the user hears about a problem before waiting for an upload. Returns the
 * message to show, or `null` when the file is fine.
 *
 * The API still validates every upload; this only saves a round trip.
 *
 * @example
 *   const problem = validateUpload(file);
 *   if (problem) return setError(problem);
 */
export function validateUpload(file: Pick<File, 'size' | 'type'>): string | null {
  if (file.size === 0) return 'That file is empty.';
  if (!(allowedMimeTypes as readonly string[]).includes(file.type)) {
    return 'That file type is not supported. Upload a JPEG, PNG, WebP, PDF, CSV or Excel file.';
  }
  if (file.size > maxFileSizeBytes) {
    return `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxFileSizeBytes)}.`;
  }
  return null;
}
