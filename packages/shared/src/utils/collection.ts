/** Splits an array into consecutive chunks of at most `size` items. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('chunk size must be >= 1');
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function groupBy<T, K extends PropertyKey>(
  items: readonly T[],
  keyOf: (item: T) => K,
): Partial<Record<K, T[]>> {
  const groups: Partial<Record<K, T[]>> = {};
  for (const item of items) {
    (groups[keyOf(item)] ??= []).push(item);
  }
  return groups;
}

/** Keeps the first item seen for each key. */
export function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => unknown): T[] {
  const seen = new Set<unknown>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Returns a sorted copy; the input is left untouched. */
export function sortBy<T>(
  items: readonly T[],
  valueOf: (item: T) => number | string,
  order: 'asc' | 'desc' = 'asc',
): T[] {
  const direction = order === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    return left < right ? -direction : left > right ? direction : 0;
  });
}

export function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]) {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in source) result[key] = source[key];
  }
  return result;
}

export function omit<T extends object, K extends keyof T>(source: T, keys: readonly K[]) {
  const result = { ...source };
  for (const key of keys) delete result[key];
  return result as Omit<T, K>;
}

/** `range(3)` → [0, 1, 2]; `range(2, 5)` → [2, 3, 4]. */
export function range(startOrEnd: number, end?: number): number[] {
  const [from, to] = end === undefined ? [0, startOrEnd] : [startOrEnd, end];
  return Array.from({ length: Math.max(0, to - from) }, (_, index) => from + index);
}
