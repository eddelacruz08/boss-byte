import { describe, expect, it, vi } from 'vitest';
import {
  buildPaginationMeta,
  chunk,
  formatBytes,
  formatCurrency,
  groupBy,
  hasPermission,
  initials,
  omit,
  pick,
  range,
  retry,
  round,
  slugify,
  sortBy,
  truncate,
  uniqueBy,
  withTimeout,
} from './index';

describe('permissions', () => {
  it('grants admins everything and viewers very little', () => {
    expect(hasPermission('admin', 'users:delete')).toBe(true);
    expect(hasPermission('viewer', 'users:read')).toBe(false);
    expect(hasPermission('viewer', 'reports:read')).toBe(true);
  });
});

describe('format', () => {
  it('formats currency and bytes', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 ** 2)).toBe('5 MB');
  });
});

describe('string', () => {
  it('slugifies, truncates and builds initials', () => {
    expect(slugify('  Héllo Wörld! ')).toBe('hello-world');
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
    expect(truncate('abc', 5)).toBe('abc');
    expect(initials('ada king lovelace')).toBe('AL');
    expect(initials('Plato')).toBe('P');
  });
});

describe('collection', () => {
  it('chunks, groups, de-duplicates and sorts', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(() => chunk([1], 0)).toThrow(RangeError);
    expect(groupBy(['a', 'bb', 'cc'], (word) => word.length)).toEqual({
      1: ['a'],
      2: ['bb', 'cc'],
    });
    expect(uniqueBy([{ id: 1 }, { id: 1 }, { id: 2 }], (item) => item.id)).toHaveLength(2);
    expect(sortBy([3, 1, 2], (n) => n, 'desc')).toEqual([3, 2, 1]);
    expect(range(2, 5)).toEqual([2, 3, 4]);
  });

  it('picks and omits keys without mutating the source', () => {
    const source = { a: 1, b: 2, c: 3 };
    expect(pick(source, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    expect(omit(source, ['a'])).toEqual({ b: 2, c: 3 });
    expect(source).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe('async', () => {
  it('retries until the task succeeds', async () => {
    const task = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValue('done');
    await expect(retry(task, { baseDelayMs: 1 })).resolves.toBe('done');
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured attempts', async () => {
    const task = vi.fn<() => Promise<never>>().mockRejectedValue(new Error('nope'));
    await expect(retry(task, { attempts: 2, baseDelayMs: 1 })).rejects.toThrow('nope');
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('times out slow promises', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 50));
    await expect(withTimeout(slow, 5, 'too slow')).rejects.toThrow('too slow');
  });
});

describe('misc', () => {
  it('rounds and builds pagination metadata', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(buildPaginationMeta(41, 2, 20)).toEqual({
      page: 2,
      pageSize: 20,
      total: 41,
      totalPages: 3,
    });
    expect(buildPaginationMeta(0, 1, 20).totalPages).toBe(1);
  });
});
