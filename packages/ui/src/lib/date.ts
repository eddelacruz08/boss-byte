import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export type DateInput = Date | string | number | null | undefined;

const EMPTY = '—';

export function isValidDate(value: DateInput): boolean {
  if (value === null || value === undefined || value === '') return false;
  return dayjs(value).isValid();
}

/** Formats a date with a dayjs format string: "Mar 5, 2026" by default. */
export function formatDate(value: DateInput, format = 'MMM D, YYYY'): string {
  return isValidDate(value) ? dayjs(value).format(format) : EMPTY;
}

/** "Mar 5, 2026 2:30 PM" */
export function formatDateTime(value: DateInput): string {
  return formatDate(value, 'MMM D, YYYY h:mm A');
}

/** "3 hours ago", "in 2 days" */
export function formatRelativeTime(value: DateInput): string {
  return isValidDate(value) ? dayjs(value).fromNow() : EMPTY;
}
