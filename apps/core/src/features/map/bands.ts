import type { SampleProperty } from '@/data/sample-properties';

/**
 * How an assessment compares with the sale price. Within ten percent either
 * way is the range assessors usually aim for.
 */
export const RATIO_BANDS = [
  { id: 'under', label: 'Under-assessed', range: 'ratio below 0.90', color: '#0369a1' },
  { id: 'within', label: 'On target', range: 'ratio 0.90 to 1.10', color: '#15803d' },
  { id: 'over', label: 'Over-assessed', range: 'ratio above 1.10', color: '#b91c1c' },
] as const;

export type RatioBand = (typeof RATIO_BANDS)[number];

export function assessmentRatio(property: SampleProperty): number {
  return property.assessedValue / property.salePrice;
}

export function ratioBand(ratio: number): RatioBand {
  if (ratio < 0.9) return RATIO_BANDS[0];
  if (ratio <= 1.1) return RATIO_BANDS[1];
  return RATIO_BANDS[2];
}
