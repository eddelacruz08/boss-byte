import type { FileList, FileUrl, PaginationQuery, StoredFile } from '@bossbyte/shared';
import { buildPaginationMeta, paginationOffset } from '@bossbyte/shared';
import { count, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { files, type FileRow } from '../../db/schema';
import { badRequest, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { getStorage } from '../../lib/storage';
import { createStorageKey, downloadFileName, processUpload } from '../../lib/uploads';

const SIGNED_URL_TTL_SECONDS = 300;

export function toFileDto(row: FileRow): StoredFile {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

async function getFileRow(id: string): Promise<FileRow> {
  const [row] = await db.select().from(files).where(eq(files.id, id));
  if (!row) throw notFound('File not found', 'file_not_found');
  return row;
}

export async function listFiles(query: PaginationQuery): Promise<FileList> {
  const [rows, [totals]] = await Promise.all([
    db
      .select()
      .from(files)
      .orderBy(desc(files.createdAt), desc(files.id))
      .limit(query.pageSize)
      .offset(paginationOffset(query.page, query.pageSize)),
    db.select({ total: count() }).from(files),
  ]);
  return {
    data: rows.map(toFileDto),
    meta: buildPaginationMeta(totals?.total ?? 0, query.page, query.pageSize),
  };
}

export async function storeUpload(
  file: { buffer: Buffer; originalname: string } | undefined,
  uploadedBy: string,
): Promise<StoredFile> {
  if (!file) throw badRequest('Attach a file in the "file" field', 'file_required');

  const processed = await processUpload(file.buffer, file.originalname);
  const storageKey = createStorageKey(processed.extension);
  const storage = getStorage();
  await storage.put(storageKey, processed.buffer, processed.mimeType);

  try {
    const [row] = await db
      .insert(files)
      .values({
        storageKey,
        originalName: file.originalname.slice(0, 255),
        mimeType: processed.mimeType,
        sizeBytes: processed.buffer.length,
        width: processed.width,
        height: processed.height,
        uploadedBy,
      })
      .returning();
    return toFileDto(row!);
  } catch (error) {
    // Do not leave an object behind that no row points to.
    await storage.delete(storageKey).catch((cleanupError: unknown) => {
      logger.warn({ err: cleanupError, storageKey }, 'Failed to remove orphaned upload');
    });
    throw error;
  }
}

export async function getFileUrl(id: string): Promise<FileUrl> {
  const row = await getFileRow(id);
  const url = await getStorage().signedUrl(row.storageKey, {
    expiresIn: SIGNED_URL_TTL_SECONDS,
    downloadName: downloadFileName(row.originalName, row.storageKey),
  });
  return { url, expiresIn: SIGNED_URL_TTL_SECONDS };
}

export async function deleteFile(id: string): Promise<void> {
  const row = await getFileRow(id);
  // Row first: a dangling object is harmless, a row without its object is a broken download.
  await db.delete(files).where(eq(files.id, id));
  await getStorage().delete(row.storageKey);
}
