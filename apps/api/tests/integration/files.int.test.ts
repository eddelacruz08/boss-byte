import { randomUUID } from 'node:crypto';
import { SECURITY } from '@bossbyte/shared';
import request from 'supertest';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { pool } from '../../src/db/client';
import { app, createTestUser, storage } from './helpers';

const png = (width = 64, height = 32) =>
  sharp({ create: { width, height, channels: 3, background: { r: 29, g: 78, b: 216 } } })
    .png()
    .toBuffer();

const upload = (authorization: string, content: Buffer, name: string) =>
  request(app)
    .post('/api/v1/files')
    .set('Authorization', authorization)
    .attach('file', content, name);

describe('uploading', () => {
  it('re-encodes an image, stores it and records it', async () => {
    const staff = await createTestUser({ role: 'staff' });

    const { body } = await upload(staff.authorization, await png(), 'holiday photo.png').expect(
      201,
    );
    expect(body).toMatchObject({
      originalName: 'holiday photo.png',
      mimeType: 'image/webp',
      width: 64,
      height: 32,
      uploadedBy: staff.id,
    });

    expect(storage.objects.size).toBe(1);
    const [key, object] = [...storage.objects][0]!;
    expect(key).toMatch(/^uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/);
    expect(object.contentType).toBe('image/webp');
    expect(object.body.length).toBe(body.sizeBytes);

    const { rows } = await pool.query(
      "SELECT metadata FROM audit_logs WHERE action = 'file.uploaded'",
    );
    expect(rows[0].metadata).toMatchObject({ fileId: body.id, mimeType: 'image/webp' });
  });

  it('keeps documents as they are', async () => {
    const staff = await createTestUser({ role: 'staff' });
    const csv = Buffer.from('name,email\nAda,ada@example.com\n');

    const { body } = await upload(staff.authorization, csv, 'people.csv').expect(201);
    expect(body).toMatchObject({
      mimeType: 'text/csv',
      width: null,
      height: null,
      sizeBytes: csv.length,
    });
  });

  it('rejects a disguised executable and stores nothing', async () => {
    const staff = await createTestUser({ role: 'staff' });
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(512)]);

    const { body } = await upload(staff.authorization, exe, 'invoice.pdf').expect(400);
    expect(body.error.code).toBe('unsupported_file_type');
    expect(storage.objects.size).toBe(0);
    expect((await pool.query('SELECT 1 FROM files')).rowCount).toBe(0);
  });

  it('rejects a request without a file, and one that is too large', async () => {
    const staff = await createTestUser({ role: 'staff' });

    const missing = await request(app)
      .post('/api/v1/files')
      .set('Authorization', staff.authorization)
      .field('note', 'no file here')
      .expect(400);
    expect(missing.body.error.code).toBe('file_required');

    const oversized = Buffer.alloc(SECURITY.uploads.maxFileSizeBytes + 1, 'a');
    const tooLarge = await upload(staff.authorization, oversized, 'big.csv').expect(413);
    expect(tooLarge.body.error.code).toBe('file_too_large');
  });

  it('is closed to viewers', async () => {
    const viewer = await createTestUser();
    await upload(viewer.authorization, await png(), 'photo.png').expect(403);
    expect(storage.objects.size).toBe(0);
  });
});

describe('listing, downloading and deleting', () => {
  it('lists files newest first', async () => {
    const staff = await createTestUser({ role: 'staff' });
    const viewer = await createTestUser();
    await upload(staff.authorization, await png(), 'first.png').expect(201);
    await upload(staff.authorization, await png(), 'second.png').expect(201);

    const { body } = await request(app)
      .get('/api/v1/files?pageSize=1')
      .set('Authorization', viewer.authorization)
      .expect(200);
    expect(body.data.map((file: { originalName: string }) => file.originalName)).toEqual([
      'second.png',
    ]);
    expect(body.meta).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
  });

  it('hands out a short-lived signed URL rather than the bytes', async () => {
    const staff = await createTestUser({ role: 'staff' });
    const { body: file } = await upload(staff.authorization, await png(), 'photo.png').expect(201);
    const [key] = [...storage.objects.keys()];

    const { body } = await request(app)
      .get(`/api/v1/files/${file.id}/url`)
      .set('Authorization', staff.authorization)
      .expect(200);
    expect(body).toEqual({ url: `https://storage.test/${key}?expires=300`, expiresIn: 300 });
  });

  it('deletes the record and the object', async () => {
    const staff = await createTestUser({ role: 'staff' });
    const manager = await createTestUser({ role: 'manager' });
    const { body: file } = await upload(staff.authorization, await png(), 'photo.png').expect(201);

    // Staff can upload but not delete.
    await request(app)
      .delete(`/api/v1/files/${file.id}`)
      .set('Authorization', staff.authorization)
      .expect(403);
    await request(app)
      .delete(`/api/v1/files/${file.id}`)
      .set('Authorization', manager.authorization)
      .expect(204);

    expect(storage.objects.size).toBe(0);
    const gone = await request(app)
      .get(`/api/v1/files/${file.id}/url`)
      .set('Authorization', manager.authorization)
      .expect(404);
    expect(gone.body.error.code).toBe('file_not_found');
  });

  it('answers 404 for a file that never existed', async () => {
    const manager = await createTestUser({ role: 'manager' });
    await request(app)
      .delete(`/api/v1/files/${randomUUID()}`)
      .set('Authorization', manager.authorization)
      .expect(404);
  });
});
