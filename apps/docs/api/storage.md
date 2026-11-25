# File storage

Uploaded files go to object storage; PostgreSQL keeps only their metadata. Downloads never pass
through the API: it hands out short-lived signed URLs and the browser fetches from the bucket
directly.

| File                          | Role                                                |
| ----------------------------- | --------------------------------------------------- |
| `apps/api/src/lib/storage/`   | The `StorageDriver` interface and its two drivers   |
| `apps/api/src/lib/uploads.ts` | Multipart parsing, type detection, image processing |
| `apps/api/src/modules/files/` | The `/api/v1/files` routes and service              |

## Choosing a driver

Set `STORAGE_DRIVER` to `s3` (the default) or `gcs`. Application code calls `getStorage()` and
depends only on the interface, so switching is a configuration change.

### S3 and S3-compatible stores

Uses the AWS SDK v3. It works with AWS S3 and anything that speaks the same protocol: MinIO,
Cloudflare R2, DigitalOcean Spaces.

**Local development (MinIO)** — what `npm run setup` writes:

```ini
STORAGE_DRIVER=s3
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=bossbyte
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

`npm run docker:up` starts MinIO and creates the `bossbyte` bucket. The MinIO console is at
http://localhost:9001 (`minioadmin` / `minioadmin`).

**AWS S3:**

```ini
STORAGE_DRIVER=s3
S3_REGION=ap-southeast-1
S3_BUCKET=my-bucket
```

Leave `S3_ENDPOINT` unset. Leave the two key variables unset as well to use the SDK's default
credential chain (an instance role, ECS task role or environment credentials), which is better
than long-lived keys.

**`S3_PUBLIC_ENDPOINT`** is for the case where the API and the browser reach the bucket at
different addresses. Inside Docker Compose the API talks to `http://minio:9000`, but a signed URL
with that host is useless to a browser, so URLs are signed for
`S3_PUBLIC_ENDPOINT=http://localhost:9000` instead. Uploads and deletes still use `S3_ENDPOINT`.

### Google Cloud Storage

```ini
STORAGE_DRIVER=gcs
GCS_BUCKET=my-bucket
GCS_PROJECT_ID=my-project
```

`GCS_BUCKET` is required with this driver. Authentication uses Application Default Credentials:
the service account attached to Cloud Run or GCE, or `gcloud auth application-default login` on
your machine.

Signed URLs are V4. On Cloud Run there is no private key file, so signing goes through the IAM
API, and the runtime service account needs `roles/iam.serviceAccountTokenCreator` **on itself**,
plus `roles/storage.objectAdmin` on the bucket. The one-time setup is in
[Google Cloud Run](/deployment/cloud-run#one-time-setup).

## The files API

All routes need a signed-in user. Paths are relative to `/api/v1/files`.

| Method and path | Permission     | Result                                                 |
| --------------- | -------------- | ------------------------------------------------------ |
| `GET /`         | `files:read`   | Paginated list, newest first                           |
| `POST /`        | `files:write`  | 201 with the stored file. Multipart, field name `file` |
| `GET /:id/url`  | `files:read`   | `{ url, expiresIn: 300 }`                              |
| `DELETE /:id`   | `files:delete` | 204                                                    |

```bash
curl http://localhost:4000/api/v1/files \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F 'file=@./photo.jpg'
```

```json
{
  "id": "5a3c6f0e-2a1b-4d0c-9f5e-0c1d2e3f4a5b",
  "originalName": "photo.jpg",
  "mimeType": "image/webp",
  "sizeBytes": 48211,
  "width": 2048,
  "height": 1365,
  "uploadedBy": "0d9b0e3a-6f4f-4f0f-8a53-0f1f0a4c2b1d",
  "createdAt": "2026-11-23T08:15:00.000Z"
}
```

Note `mimeType`: the JPEG was stored as WebP. Read on.

## The upload pipeline

Nothing the client says about a file is trusted. `storeUpload` in
`src/modules/files/files.service.ts` runs these steps:

1. **Parse** — Multer reads the multipart body into memory, with hard limits: one file, 10 MB,
   at most 10 other fields. A larger file is rejected with `413 file_too_large` before the handler
   runs.
2. **Detect the real type** — `detectFileType` uses the `file-type` package to read the file's
   magic bytes. The `Content-Type` header and the file extension are ignored. CSV has no magic
   number, so a file counts as CSV when its name ends in `.csv` and it contains no NUL bytes.
3. **Check the allow-list** — the detected type must be one of
   `SECURITY.uploads.allowedMimeTypes`: JPEG, PNG, WebP, PDF, CSV or XLSX. Anything else is
   `400 unsupported_file_type`. A renamed executable fails here.
4. **Normalise images** — images go through `sharp`: the EXIF orientation is applied, the image
   is scaled down to fit 2048 × 2048 (never up), and it is re-encoded as WebP at quality 82.
   Re-encoding drops all metadata, including GPS position and device details, and anything
   hidden after the image data. An image that cannot be decoded is `400 invalid_image`.
   Documents are stored as they are.
5. **Generate the key** — `createStorageKey` builds `uploads/YYYY/MM/<uuid>.<ext>`. No part of the
   key comes from the client. The original file name is kept only as metadata.
6. **Store, then record** — the object is written first, then the database row. If the insert
   fails, the object is deleted so nothing is left orphaned.

| Code                    | Status | Cause                                   |
| ----------------------- | ------ | --------------------------------------- |
| `file_required`         | 400    | No `file` field in the request          |
| `unsupported_file_type` | 400    | Detected type is not on the allow-list  |
| `invalid_image`         | 400    | Looks like an image but will not decode |
| `file_too_large`        | 413    | Over 10 MB                              |
| `invalid_upload`        | 400    | Any other multipart problem             |
| `file_not_found`        | 404    | No file with that id                    |

### Changing the limits

The size limit and the allow-list are in `SECURITY.uploads`
(`packages/shared/src/constants/security.ts`). The dashboard reads the same constants to validate
before uploading, so one edit changes both sides.

If you raise the size limit, also raise `client_max_body_size` in
`docker/nginx/default.conf.template` (12 MB by default), and remember that uploads are buffered
in memory. For files in the hundreds of megabytes, have the browser upload straight to the bucket
with a pre-signed PUT instead.

To accept a new type, add its MIME type to the list. It must be one `file-type` can recognise
from content; otherwise add a check like `looksLikeCsv` in `src/lib/uploads.ts`.

### Reusing the pipeline

In your own module, use the same pieces:

```ts
import { getStorage } from '../../lib/storage';
import { createStorageKey, processUpload, upload } from '../../lib/uploads';

router.post('/:id/photo', authorize('customers:write'), upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Attach a file in the "file" field', 'file_required');

  const processed = await processUpload(req.file.buffer, req.file.originalname);
  const key = createStorageKey(processed.extension);
  await getStorage().put(key, processed.buffer, processed.mimeType);
  // …save `key` on your row…
  res.status(201).json({ ok: true });
});
```

## Signed URLs

Buckets stay private. To let a user download a file, the API signs a URL that works for a limited
time:

```ts
const url = await getStorage().signedUrl(row.storageKey, {
  expiresIn: 300,
  downloadName: downloadFileName(row.originalName, row.storageKey),
});
```

`downloadName` sets a `Content-Disposition: attachment` header on the response, so the browser
saves the file instead of displaying it. That matters for security as well as convenience:
user-uploaded content is never rendered from your storage origin.

`downloadFileName` (`src/lib/uploads.ts`) keeps the name the file was uploaded with but gives it
the extension of what is stored, so `photo.png`, which was re-encoded, downloads as `photo.webp`.

`GET /files/:id/url` returns URLs valid for 5 minutes. Ask for one when the user clicks, not when
the list loads.

Anyone holding the URL can download the file until it expires. The permission check happens when
the URL is issued.

## The driver interface

```ts
export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, options: SignedUrlOptions): Promise<string>;
  ping(): Promise<void>;
}
```

To add a backend (Azure Blob Storage, a local disk for an appliance), implement this interface in
`src/lib/storage/`, add a value to `STORAGE_DRIVER` in `src/config/env.ts`, and return your class
from `createStorage()` in `src/lib/storage/index.ts`.

## In tests

Integration tests replace the driver with an in-memory one, so they need no bucket:

```ts
import { storage } from './helpers';

expect(storage.objects.size).toBe(1);
const [key, object] = [...storage.objects][0]!;
expect(object.contentType).toBe('image/webp');
```

`setStorage(replacement)` swaps the driver and `setStorage(undefined)` restores the configured
one. See [Testing](/testing#in-memory-storage).

## Production checklist

- Keep the bucket private. Do not enable public access.
- Turn on server-side encryption in the bucket. The API does not encrypt file contents.
- Add a lifecycle rule to expire the `exports/` prefix, where the worker writes report exports.
- If browsers will fetch from the bucket with `fetch()` rather than by navigation, configure CORS
  on the bucket for your dashboard's origin.
- Deleting a file removes its row first and its object second. If the second step fails you are
  left with an unreferenced object, never a broken download.
