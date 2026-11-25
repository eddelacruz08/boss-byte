import { SECURITY } from '@bossbyte/shared';
import { describe, expect, it } from 'vitest';
import { UPLOAD_ACCEPT, validateUpload } from './validate-upload';

const { allowedMimeTypes, maxFileSizeBytes } = SECURITY.uploads;

describe('validateUpload', () => {
  it.each(allowedMimeTypes)('accepts %s', (type) => {
    expect(validateUpload({ type, size: 1024 })).toBeNull();
  });

  it('accepts a file that is exactly at the size limit', () => {
    expect(validateUpload({ type: 'application/pdf', size: maxFileSizeBytes })).toBeNull();
  });

  it('rejects a file over the size limit and says how big it is', () => {
    const problem = validateUpload({ type: 'application/pdf', size: maxFileSizeBytes + 1 });
    expect(problem).toMatch(/^That file is .+\. The limit is .+\.$/);
  });

  it.each(['image/gif', 'image/svg+xml', 'application/zip', 'text/html', ''])(
    'rejects the type "%s"',
    (type) => {
      expect(validateUpload({ type, size: 1024 })).toMatch(/not supported/);
    },
  );

  it('rejects an empty file', () => {
    expect(validateUpload({ type: 'text/csv', size: 0 })).toBe('That file is empty.');
  });

  it('offers the same types to the file picker', () => {
    expect(UPLOAD_ACCEPT.split(',')).toEqual([...allowedMimeTypes]);
  });
});
