import type {
  BoostedRequest,
  BoostedResult,
  ComparablesRequest,
  ComparablesResult,
  RatioStudyRequest,
  RatioStudyResult,
  RegressionRequest,
  RegressionResult,
} from '@bossbyte/shared';
import { SAMPLE_PROPERTIES } from '@/data/sample-properties';
import { api } from '@/lib/api';
import { toObservations, toRatioPairs, type SubjectForm } from './features';

/** The four valuation models. Each call is stateless: send data, get figures back. */
export const valuationApi = {
  regression: (request: RegressionRequest) =>
    api.post<RegressionResult>('/valuation/regression', request),
  comparables: (request: ComparablesRequest) =>
    api.post<ComparablesResult>('/valuation/comparables', request),
  ratioStudy: (request: RatioStudyRequest) =>
    api.post<RatioStudyResult>('/valuation/ratio-study', request),
  boosted: (request: BoostedRequest) => api.post<BoostedResult>('/valuation/boosted', request),
};

export interface ValuationResults {
  regression: RegressionResult;
  comparables: ComparablesResult;
  ratioStudy: RatioStudyResult;
  boosted: BoostedResult;
}

/** Runs all four models on the sample sales, valuing the given subject property. */
export async function runSampleValuation({
  k,
  ...subject
}: SubjectForm): Promise<ValuationResults> {
  const observations = toObservations(SAMPLE_PROPERTIES);
  const [regression, comparables, ratioStudy, boosted] = await Promise.all([
    valuationApi.regression({ observations, subject }),
    valuationApi.comparables({ observations, subject, k }),
    valuationApi.ratioStudy({ pairs: toRatioPairs(SAMPLE_PROPERTIES) }),
    valuationApi.boosted({ observations, subject, rounds: 100, learningRate: 0.1, maxDepth: 2 }),
  ]);
  return { regression, comparables, ratioStudy, boosted };
}
