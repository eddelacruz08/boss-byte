export type PageItem = number | 'ellipsis-start' | 'ellipsis-end';

/**
 * The page buttons to show: always the first and last page, plus `siblings`
 * pages either side of the current one, with gaps collapsed to an ellipsis.
 *
 *   paginationRange(5, 10) → [1, 'ellipsis-start', 4, 5, 6, 'ellipsis-end', 10]
 */
export function paginationRange(page: number, totalPages: number, siblings = 1): PageItem[] {
  const total = Math.max(1, Math.floor(totalPages));
  const current = Math.min(Math.max(1, Math.floor(page)), total);

  // First + last + current + siblings + two ellipses all fit: show every page.
  if (total <= siblings * 2 + 5) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const left = Math.max(current - siblings, 2);
  const right = Math.min(current + siblings, total - 1);
  const items: PageItem[] = [1];

  if (left > 2) items.push('ellipsis-start');
  for (let value = left; value <= right; value += 1) items.push(value);
  if (right < total - 1) items.push('ellipsis-end');

  items.push(total);
  return items;
}
