import { cn } from './cn';
import { formatDate, formatDateTime, formatRelativeTime, isValidDate } from './date';

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', false, null, undefined, 'b', { c: true, d: false })).toBe('a b c');
  });

  it('lets later Tailwind utilities win over earlier ones', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4');
  });
});

describe('date helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats dates', () => {
    expect(formatDate(new Date(2026, 2, 5))).toBe('Mar 5, 2026');
    expect(formatDate('2026-03-05')).toBe('Mar 5, 2026');
    expect(formatDate(new Date(2026, 2, 5), 'YYYY-MM-DD')).toBe('2026-03-05');
  });

  it('formats dates with a time', () => {
    expect(formatDateTime(new Date(2026, 2, 5, 14, 30))).toBe('Mar 5, 2026 2:30 PM');
  });

  it('formats times relative to now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 5, 12, 0));

    expect(formatRelativeTime(new Date(2026, 2, 5, 9, 0))).toBe('3 hours ago');
    expect(formatRelativeTime(new Date(2026, 2, 7, 12, 0))).toBe('in 2 days');
  });

  it('returns a dash for missing or invalid dates', () => {
    for (const value of [null, undefined, '', 'not a date', new Date(Number.NaN)]) {
      expect(formatDate(value)).toBe('—');
      expect(formatDateTime(value)).toBe('—');
      expect(formatRelativeTime(value)).toBe('—');
    }
  });

  it('checks validity', () => {
    expect(isValidDate(new Date())).toBe(true);
    expect(isValidDate('2026-03-05T10:00:00Z')).toBe(true);
    expect(isValidDate(0)).toBe(true);
    expect(isValidDate(null)).toBe(false);
    expect(isValidDate('')).toBe(false);
    expect(isValidDate('nope')).toBe(false);
  });
});
