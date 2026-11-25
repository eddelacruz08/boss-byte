import type { Readable } from 'node:stream';
import { ZipArchive } from 'archiver';

export interface ZipEntry {
  /** Path of the entry inside the archive, e.g. "reports/users.csv". */
  name: string;
  content: Buffer | string | Readable;
}

/**
 * Creates a zip archive as a stream (archiver). Pipe it to a response to send
 * large archives without buffering them.
 *
 * @example
 *   createZipStream([{ name: 'users.csv', content: csv }]).pipe(res);
 */
export function createZipStream(entries: ZipEntry[]): Readable {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  for (const entry of entries) archive.append(entry.content, { name: entry.name });
  void archive.finalize();
  return archive;
}

export async function buildZip(entries: ZipEntry[]): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of createZipStream(entries)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
