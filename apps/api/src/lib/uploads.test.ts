import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createStorageKey, detectFileType, downloadFileName, processUpload } from './uploads';

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 29, g: 78, b: 216 } } })
    .png()
    .toBuffer();

const rejected = expect.objectContaining({ status: 400, code: 'unsupported_file_type' });

describe('detectFileType', () => {
  it('identifies files by content, ignoring the name', async () => {
    expect(await detectFileType(await png(4, 4), 'holiday.txt')).toEqual({
      mimeType: 'image/png',
      extension: 'png',
    });
    expect(await detectFileType(Buffer.from('%PDF-1.7\n%âãÏÓ\n'), 'report')).toMatchObject({
      mimeType: 'application/pdf',
    });
  });

  it('accepts CSV by extension when the content is plain text', async () => {
    expect(
      await detectFileType(Buffer.from('name,email\nAda,ada@example.com\n'), 'users.CSV'),
    ).toEqual({
      mimeType: 'text/csv',
      extension: 'csv',
    });
  });

  it('rejects an executable renamed to look like an image', async () => {
    // "MZ" is the signature of a Windows executable.
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(256)]);
    await expect(detectFileType(exe, 'cute-cat.png')).rejects.toEqual(rejected);
  });

  it('rejects types that are not on the allow-list', async () => {
    await expect(
      detectFileType(Buffer.from('<script>alert(1)</script>'), 'page.html'),
    ).rejects.toEqual(rejected);
    await expect(
      detectFileType(Buffer.from('GIF89a' + '\0'.repeat(32)), 'anim.gif'),
    ).rejects.toEqual(rejected);
    await expect(detectFileType(Buffer.from([0x61, 0x00, 0x62]), 'binary.csv')).rejects.toEqual(
      rejected,
    );
  });
});

describe('processUpload', () => {
  it('re-encodes images as WebP', async () => {
    const result = await processUpload(await png(64, 32), 'photo.png');
    expect(result).toMatchObject({
      mimeType: 'image/webp',
      extension: 'webp',
      width: 64,
      height: 32,
    });
    expect(result.buffer.subarray(8, 12).toString('latin1')).toBe('WEBP');
  });

  it('caps the dimensions, keeping the aspect ratio', async () => {
    const result = await processUpload(await png(4096, 1024), 'panorama.png');
    expect(result).toMatchObject({ width: 2048, height: 512 });
  });

  it('strips metadata', async () => {
    const withExif = await sharp(await png(8, 8))
      .withExif({ IFD0: { Copyright: 'secret location data' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const result = await processUpload(withExif, 'photo.jpg');
    expect((await sharp(result.buffer).metadata()).exif).toBeUndefined();
  });

  it('passes other allowed files through untouched', async () => {
    const csv = Buffer.from('a,b\n1,2\n');
    expect(await processUpload(csv, 'data.csv')).toEqual({
      buffer: csv,
      mimeType: 'text/csv',
      extension: 'csv',
      width: null,
      height: null,
    });
  });

  it('rejects a file that claims to be an image but is not one', async () => {
    const truncated = (await png(16, 16)).subarray(0, 24);
    await expect(processUpload(truncated, 'broken.png')).rejects.toMatchObject({
      code: 'invalid_image',
    });
  });
});

describe('createStorageKey', () => {
  it('builds a dated, unguessable key', () => {
    const key = createStorageKey('webp', new Date('2026-03-09T12:00:00Z'));
    expect(key).toMatch(/^uploads\/2026\/03\/[0-9a-f-]{36}\.webp$/);
    expect(createStorageKey('webp')).not.toBe(createStorageKey('webp'));
  });
});

describe('downloadFileName', () => {
  it('gives a re-encoded image the extension of what is stored', () => {
    expect(downloadFileName('holiday photo.png', 'uploads/2026/03/abc.webp')).toBe(
      'holiday photo.webp',
    );
    expect(downloadFileName('archive.tar.JPG', 'uploads/2026/03/abc.webp')).toBe(
      'archive.tar.webp',
    );
    expect(downloadFileName('scan', 'uploads/2026/03/abc.webp')).toBe('scan.webp');
  });

  it('leaves a name alone when the extension already matches', () => {
    expect(downloadFileName('Report.PDF', 'uploads/2026/03/abc.pdf')).toBe('Report.PDF');
    expect(downloadFileName('people.csv', 'uploads/2026/03/abc.csv')).toBe('people.csv');
  });
});
