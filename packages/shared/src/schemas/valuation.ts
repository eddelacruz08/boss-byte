import { z } from 'zod';

const finite = z.number().refine(Number.isFinite, 'Must be a finite number');

/** One observation: named numeric features plus the observed value (e.g. a sale price). */
export const observationSchema = z.object({
  features: z.record(z.string(), finite),
  value: finite,
});

export const regressionRequestSchema = z.object({
  observations: z.array(observationSchema).min(3, 'At least three observations are required'),
  /** Optional subject to predict once the model is fitted. */
  subject: z.record(z.string(), finite).optional(),
});

export const regressionResultSchema = z.object({
  intercept: z.number(),
  coefficients: z.record(z.string(), z.number()),
  rSquared: z.number(),
  adjustedRSquared: z.number(),
  standardError: z.number(),
  observations: z.number().int(),
  prediction: z.number().nullable(),
});

export const comparablesRequestSchema = z.object({
  observations: z.array(observationSchema).min(1),
  subject: z.record(z.string(), finite),
  k: z.number().int().min(1).max(25).default(5),
});

export const comparablesResultSchema = z.object({
  estimate: z.number(),
  comparables: z.array(
    z.object({
      index: z.number().int(),
      distance: z.number(),
      weight: z.number(),
      value: z.number(),
    }),
  ),
});

/** Pairs of assessed value and sale price for a ratio study. */
export const ratioStudyRequestSchema = z.object({
  pairs: z
    .array(z.object({ assessed: finite.positive(), sale: finite.positive() }))
    .min(2, 'At least two pairs are required'),
});

export const ratioStudyResultSchema = z.object({
  count: z.number().int(),
  meanRatio: z.number(),
  medianRatio: z.number(),
  weightedMeanRatio: z.number(),
  /** Coefficient of dispersion, in percent. */
  cod: z.number(),
  /** Price-related differential. */
  prd: z.number(),
});

/**
 * Gradient-boosted regression trees: a machine-learning model that captures
 * non-linear effects and interactions a linear regression cannot.
 */
export const boostedRequestSchema = z.object({
  observations: z.array(observationSchema).min(5, 'At least five observations are required'),
  subject: z.record(z.string(), finite).optional(),
  /** Number of trees. More trees fit the data more closely. */
  rounds: z.number().int().min(1).max(500).default(100),
  /** How much each tree contributes; smaller values need more rounds but generalise better. */
  learningRate: z.number().gt(0).max(1).default(0.1),
  maxDepth: z.number().int().min(1).max(4).default(2),
});

export const boostedResultSchema = z.object({
  rounds: z.number().int(),
  /** The mean of the observed values: the prediction before any tree is added. */
  baseline: z.number(),
  rSquared: z.number(),
  /** Root-mean-square error on the training data. */
  rmse: z.number(),
  /** Share of the total error reduction owed to each feature; sums to 1. */
  featureImportance: z.record(z.string(), z.number()),
  prediction: z.number().nullable(),
});

export type Observation = z.infer<typeof observationSchema>;
export type RegressionRequest = z.infer<typeof regressionRequestSchema>;
export type RegressionResult = z.infer<typeof regressionResultSchema>;
export type ComparablesRequest = z.infer<typeof comparablesRequestSchema>;
export type ComparablesResult = z.infer<typeof comparablesResultSchema>;
export type RatioStudyRequest = z.infer<typeof ratioStudyRequestSchema>;
export type RatioStudyResult = z.infer<typeof ratioStudyResultSchema>;
export type BoostedRequest = z.infer<typeof boostedRequestSchema>;
export type BoostedResult = z.infer<typeof boostedResultSchema>;
