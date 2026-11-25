import { Storage, type Bucket } from '@google-cloud/storage';
import { attachmentDisposition, type SignedUrlOptions, type StorageDriver } from './types';

export interface GcsStorageOptions {
  bucket: string;
  projectId?: string;
}

/**
 * Google Cloud Storage. Credentials come from Application Default
 * Credentials: the service account attached to Cloud Run, or
 * GOOGLE_APPLICATION_CREDENTIALS when running elsewhere.
 */
export class GcsStorage implements StorageDriver {
  readonly name = 'gcs';
  private readonly bucket: Bucket;

  constructor(options: GcsStorageOptions) {
    this.bucket = new Storage({ projectId: options.projectId }).bucket(options.bucket);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.bucket.file(key).save(body, { contentType, resumable: false });
  }

  async get(key: string): Promise<Buffer> {
    const [contents] = await this.bucket.file(key).download();
    return contents;
  }

  async delete(key: string): Promise<void> {
    await this.bucket.file(key).delete({ ignoreNotFound: true });
  }

  async signedUrl(key: string, { expiresIn, downloadName }: SignedUrlOptions): Promise<string> {
    const [url] = await this.bucket.file(key).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresIn * 1000,
      responseDisposition: downloadName ? attachmentDisposition(downloadName) : undefined,
    });
    return url;
  }

  async ping(): Promise<void> {
    // Listing needs only object permissions. Reading the bucket's metadata would
    // need storage.buckets.get, which roles/storage.objectAdmin does not include.
    await this.bucket.getFiles({ maxResults: 1, autoPaginate: false });
  }
}
