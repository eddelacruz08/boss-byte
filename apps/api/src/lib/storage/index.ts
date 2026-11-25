import { env } from '../../config/env';
import { GcsStorage } from './gcs';
import { S3Storage } from './s3';
import type { StorageDriver } from './types';

export type { SignedUrlOptions, StorageDriver } from './types';

function createStorage(): StorageDriver {
  if (env.STORAGE_DRIVER === 'gcs') {
    if (!env.GCS_BUCKET) throw new Error('GCS_BUCKET is required when STORAGE_DRIVER=gcs');
    return new GcsStorage({ bucket: env.GCS_BUCKET, projectId: env.GCS_PROJECT_ID });
  }

  return new S3Storage({
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
}

let driver: StorageDriver | undefined;

/** The object store selected by STORAGE_DRIVER, created on first use. */
export function getStorage(): StorageDriver {
  driver ??= createStorage();
  return driver;
}

/** Swaps the driver, for tests. Pass `undefined` to restore the configured one. */
export function setStorage(replacement: StorageDriver | undefined): void {
  driver = replacement;
}
