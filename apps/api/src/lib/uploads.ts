import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { SECURITY } from '@bossbyte/shared';
import { fileTypeFromBuffer } from 'file-type';
import multer from 'multer';
import sharp from 'sharp';
import { badRequest } from './errors';

/**
 * Multipart parsing. Files are held in memory — bounded by the size limit —
 * so they can be inspected and transformed before anything is stored.
 *
 * @example
 *   router.post('/', upload.single('file'), handler);
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SECURITY.uploads.maxFileSizeBytes, files: 1, fields: 10 },
});

const ALLOWED_MIME_TYPES: readonly string[] = SECURITY.uploads.allowedMimeTypes;

const IMAGE_MAX_DIMENSION = 2048;

export interface ProcessedUpload {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width: number | null;
  height: number | null;
}

/** CSV has no magic number, so it is recognised by extension plus a check that it is plain text. */
function looksLikeCsv(buffer: Buffer, originalName: string): boolean {
  return extname(originalName).toLowerCase() === '.csv' && !buffer.includes(0);
}

/**
 * Works out what a file really is from its content. The `Content-Type` and
 * file name sent by the client are attacker-controlled and never trusted.
 */
export async function detectFileType(
  buffer: Buffer,
  originalName: string,
): Promise<{ mimeType: string; extension: string }> {
  const detected = await fileTypeFromBuffer(buffer);
  const type = detected
    ? { mimeType: detected.mime as string, extension: detected.ext as string }
    : looksLikeCsv(buffer, originalName)
      ? { mimeType: 'text/csv', extension: 'csv' }
      : undefined;

  if (!type || !ALLOWED_MIME_TYPES.includes(type.mimeType)) {
    throw badRequest('That file type is not allowed', 'unsupported_file_type');
  }
  return type;
}

/**
 * Normalises an image: applies the EXIF orientation, caps the dimensions and
 * re-encodes as WebP. Re-encoding drops all metadata (GPS position, device
 * details) and anything hidden after the image data.
 */
export async function processImage(buffer: Buffer): Promise<ProcessedUpload> {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({
      width: IMAGE_MAX_DIMENSION,
      height: IMAGE_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true })
    .catch(() => {
      throw badRequest('The image could not be read', 'invalid_image');
    });

  return {
    buffer: data,
    mimeType: 'image/webp',
    extension: 'webp',
    width: info.width,
    height: info.height,
  };
}

/** Validates an uploaded file and prepares it for storage. */
export async function processUpload(
  buffer: Buffer,
  originalName: string,
): Promise<ProcessedUpload> {
  const type = await detectFileType(buffer, originalName);
  if (type.mimeType.startsWith('image/')) return processImage(buffer);
  return { buffer, ...type, width: null, height: null };
}

/** Storage keys are generated here; nothing supplied by the client is ever part of a key. */
export function createStorageKey(extension: string, now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `uploads/${year}/${month}/${randomUUID()}.${extension}`;
}

/**
 * The name a stored file downloads under: the name it was uploaded with, but
 * with the extension of what is actually stored. Images are re-encoded, so
 * `photo.png` comes back as `photo.webp` rather than as WebP data named .png.
 */
export function downloadFileName(originalName: string, storageKey: string): string {
  const stored = extname(storageKey);
  const original = extname(originalName);
  if (!stored || original.toLowerCase() === stored.toLowerCase()) return originalName;
  return `${originalName.slice(0, originalName.length - original.length)}${stored}`;
}
