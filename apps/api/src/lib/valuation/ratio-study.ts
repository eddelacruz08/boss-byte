import type { RatioStudyRequest, RatioStudyResult } from '@bossbyte/shared';
import { mean, median, sum } from './stats';

/**
 * An assessment ratio study: how close assessed values are to actual sale
 * prices, and how evenly. These are the standard IAAO measures.
 *
 *  - Ratios near 1 mean assessments track the market.
 *  - COD (coefficient of dispersion) is the average percentage deviation from
 *    the median ratio; lower is more uniform. Under 15 is the usual target
 *    for residential property.
 *  - PRD (price-related differential) reveals bias by value: above about 1.03
 *    suggests expensive properties are under-assessed relative to cheap ones
 *    (regressive), below about 0.98 the reverse.
 */
export function runRatioStudy({ pairs }: RatioStudyRequest): RatioStudyResult {
  const ratios = pairs.map((pair) => pair.assessed / pair.sale);
  const meanRatio = mean(ratios);
  const medianRatio = median(ratios);
  const weightedMeanRatio =
    sum(pairs.map((pair) => pair.assessed)) / sum(pairs.map((pair) => pair.sale));

  return {
    count: pairs.length,
    meanRatio,
    medianRatio,
    weightedMeanRatio,
    cod: (100 * mean(ratios.map((ratio) => Math.abs(ratio - medianRatio)))) / medianRatio,
    prd: meanRatio / weightedMeanRatio,
  };
}
