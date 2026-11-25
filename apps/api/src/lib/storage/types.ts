export interface SignedUrlOptions {
  /** Seconds until the URL stops working. */
  expiresIn: number;
  /** When set, browsers download the object under this file name instead of displaying it. */
  downloadName?: string;
}

/**
 * The contract every object store implements. Application code depends on
 * this interface only, so swapping S3 for Google Cloud Storage (or adding a
 * third backend) is a configuration change.
 */
export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** A time-limited URL the browser can fetch directly, without going through the API. */
  signedUrl(key: string, options: SignedUrlOptions): Promise<string>;
  /** Resolves when the bucket is reachable; reported by the readiness probe. */
  ping(): Promise<void>;
}

/** RFC 6266 Content-Disposition value that survives non-ASCII file names. */
export function attachmentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
