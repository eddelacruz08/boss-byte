import {
  boostedRequestSchema,
  comparablesRequestSchema,
  ratioStudyRequestSchema,
  regressionRequestSchema,
} from '@bossbyte/shared';
import { Router } from 'express';
import { runBoosted, runComparables, runRatioStudy, runRegression } from '../../lib/valuation';
import { parseBody } from '../../lib/validate';
import { authenticate, authorize } from '../../middleware/authenticate';

/** The models are pure functions of the request, so these routes touch no database. */
export const valuationRouter: Router = Router();

valuationRouter.use(authenticate, authorize('valuation:run'));

valuationRouter.post('/regression', (req, res) => {
  res.json(runRegression(parseBody(regressionRequestSchema, req)));
});

valuationRouter.post('/comparables', (req, res) => {
  res.json(runComparables(parseBody(comparablesRequestSchema, req)));
});

valuationRouter.post('/ratio-study', (req, res) => {
  res.json(runRatioStudy(parseBody(ratioStudyRequestSchema, req)));
});

valuationRouter.post('/boosted', (req, res) => {
  res.json(runBoosted(parseBody(boostedRequestSchema, req)));
});
