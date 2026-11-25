import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { notFound } from '../errors';
import { attachmentDisposition, type SignedUrlOptions, type StorageDriver } from './types';

export interface S3StorageOptions {
  bucket: string;
  region: string;
  /** Custom endpoint for S3-compatible stores such as MinIO. Omit for AWS. */
  endpoint?: string;
  /** Endpoint written into signed URLs, when browsers reach the store at a different address. */
  publicEndpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** MinIO needs path-style URLs (http://host/bucket/key). */
  forcePathStyle?: boolean;
}

/** Works with AWS S3 and anything that speaks its API: MinIO, Cloudflare R2, DigitalOcean Spaces. */
export class S3Storage implements StorageDriver {
  readonly name = 's3';
  private readonly bucket: string;
  private readonly client: S3Client;
  private readonly signer: S3Client;

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket;

    const createClient = (endpoint?: string) =>
      new S3Client({
        region: options.region,
        endpoint,
        forcePathStyle: options.forcePathStyle,
        // Without explicit keys the SDK falls back to its default chain (IAM role, env, profile).
        credentials:
          options.accessKeyId && options.secretAccessKey
            ? { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey }
            : undefined,
      });

    this.client = createClient(options.endpoint);
    this.signer = options.publicEndpoint ? createClient(options.publicEndpoint) : this.client;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const { Body } = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!Body) throw notFound('File not found in storage', 'file_missing');
    return Buffer.from(await Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  signedUrl(key: string, { expiresIn, downloadName }: SignedUrlOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: downloadName ? attachmentDisposition(downloadName) : undefined,
    });
    return getSignedUrl(this.signer, command, { expiresIn });
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
