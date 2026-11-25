import type { Observation } from '@bossbyte/shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import { runBoosted, runComparables, runRatioStudy, runRegression } from './index';
import { mean, median, rSquared, standardDeviation } from './stats';

/** value = 50,000 + 1,200·area + 15,000·bedrooms, exactly. */
const linear = (area: number, bedrooms: number) => 50_000 + 1_200 * area + 15_000 * bedrooms;

const LINEAR_SALES: Observation[] = [
  [80, 2],
  [95, 3],
  [120, 3],
  [150, 4],
  [60, 1],
  [200, 5],
  [110, 2],
  [135, 4],
].map(([area, bedrooms]) => ({
  features: { area: area!, bedrooms: bedrooms! },
  value: linear(area!, bedrooms!),
}));

describe('stats', () => {
  it('computes the basics', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(mean([])).toBe(0);
  });

  it('scores a perfect and a useless fit', () => {
    expect(rSquared([1, 2, 3], [1, 2, 3])).toBe(1);
    expect(rSquared([1, 2, 3], [2, 2, 2])).toBe(0);
  });
});

describe('runRegression', () => {
  it('recovers the coefficients of an exactly linear relationship', () => {
    const result = runRegression({ observations: LINEAR_SALES });

    expect(result.intercept).toBeCloseTo(50_000, 4);
    expect(result.coefficients.area).toBeCloseTo(1_200, 6);
    expect(result.coefficients.bedrooms).toBeCloseTo(15_000, 4);
    expect(result.rSquared).toBeCloseTo(1, 10);
    expect(result.standardError).toBeCloseTo(0, 4);
    expect(result.observations).toBe(LINEAR_SALES.length);
    expect(result.prediction).toBeNull();
  });

  it('predicts the subject when one is given', () => {
    const result = runRegression({
      observations: LINEAR_SALES,
      subject: { area: 100, bedrooms: 3 },
    });
    expect(result.prediction).toBeCloseTo(linear(100, 3), 4);
  });

  it('matches a hand-worked simple regression', () => {
    // y on x for (1,2) (2,3) (3,5) (4,4): slope 0.8, intercept 1.5, R² 0.64.
    const result = runRegression({
      observations: [
        { features: { x: 1 }, value: 2 },
        { features: { x: 2 }, value: 3 },
        { features: { x: 3 }, value: 5 },
        { features: { x: 4 }, value: 4 },
      ],
    });
    expect(result.coefficients.x).toBeCloseTo(0.8, 10);
    expect(result.intercept).toBeCloseTo(1.5, 10);
    expect(result.rSquared).toBeCloseTo(0.64, 10);
    expect(result.adjustedRSquared).toBeCloseTo(0.46, 10);
  });

  it('rejects features that carry no independent information', () => {
    const collinear = LINEAR_SALES.map((sale) => ({
      ...sale,
      features: { ...sale.features, areaInFeet: sale.features.area! * 10.764 },
    }));
    expect(() => runRegression({ observations: collinear })).toThrowError(
      expect.objectContaining({ code: 'collinear_features' }),
    );
  });

  it('needs more observations than parameters', () => {
    expect(() => runRegression({ observations: LINEAR_SALES.slice(0, 3) })).toThrowError(
      expect.objectContaining({ code: 'insufficient_observations' }),
    );
  });

  it('rejects observations with mismatched features', () => {
    const broken = [...LINEAR_SALES, { features: { area: 90 }, value: 1 }];
    expect(() => runRegression({ observations: broken })).toThrow(AppError);
    expect(() => runRegression({ observations: LINEAR_SALES, subject: { area: 90 } })).toThrow(
      /missing the feature "bedrooms"/,
    );
  });
});

describe('runComparables', () => {
  it('returns the value of an exact match', () => {
    const result = runComparables({
      observations: LINEAR_SALES,
      subject: { area: 120, bedrooms: 3 },
      k: 3,
    });
    expect(result.estimate).toBeCloseTo(linear(120, 3), 0);
    expect(result.comparables).toHaveLength(3);
    expect(result.comparables[0]).toMatchObject({ index: 2, distance: 0 });
  });

  it('orders comparables by distance and normalises the weights', () => {
    const { comparables } = runComparables({
      observations: LINEAR_SALES,
      subject: { area: 100, bedrooms: 3 },
      k: 4,
    });
    const distances = comparables.map((comparable) => comparable.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(comparables.reduce((total, comparable) => total + comparable.weight, 0)).toBeCloseTo(
      1,
      10,
    );
  });

  it('is not dominated by the feature with the largest numbers', () => {
    // Unscaled, the 5 m² difference would outweigh a 4-bedroom difference.
    const { comparables } = runComparables({
      observations: [
        { features: { area: 105, bedrooms: 6 }, value: 1 },
        { features: { area: 130, bedrooms: 2 }, value: 2 },
        { features: { area: 300, bedrooms: 3 }, value: 3 },
        { features: { area: 20, bedrooms: 1 }, value: 4 },
      ],
      subject: { area: 100, bedrooms: 2 },
      k: 1,
    });
    expect(comparables[0]!.index).toBe(1);
  });

  it('copes with fewer observations than k', () => {
    const result = runComparables({
      observations: LINEAR_SALES.slice(0, 2),
      subject: { area: 90, bedrooms: 2 },
      k: 5,
    });
    expect(result.comparables).toHaveLength(2);
  });
});

describe('runRatioStudy', () => {
  it('reports perfect uniformity when every ratio is the same', () => {
    const result = runRatioStudy({
      pairs: [
        { assessed: 90, sale: 100 },
        { assessed: 180, sale: 200 },
        { assessed: 450, sale: 500 },
      ],
    });
    expect(result.count).toBe(3);
    expect(result.medianRatio).toBeCloseTo(0.9, 10);
    expect(result.cod).toBeCloseTo(0, 10);
    expect(result.prd).toBeCloseTo(1, 10);
  });

  it('matches hand-worked figures', () => {
    // Ratios 0.8, 1.0, 1.2: median 1, mean absolute deviation 0.1333 → COD 13.33.
    const result = runRatioStudy({
      pairs: [
        { assessed: 80, sale: 100 },
        { assessed: 200, sale: 200 },
        { assessed: 360, sale: 300 },
      ],
    });
    expect(result.meanRatio).toBeCloseTo(1, 10);
    expect(result.cod).toBeCloseTo(13.3333, 3);
    expect(result.weightedMeanRatio).toBeCloseTo(640 / 600, 10);
    expect(result.prd).toBeCloseTo(600 / 640, 10);
  });

  it('flags regressive assessments with a PRD above 1', () => {
    const result = runRatioStudy({
      pairs: [
        { assessed: 120, sale: 100 },
        { assessed: 1_000, sale: 1_000 },
        { assessed: 8_000, sale: 10_000 },
      ],
    });
    expect(result.prd).toBeGreaterThan(1.03);
  });
});

describe('runBoosted', () => {
  /** A step no straight line can follow: a premium that only applies above 100 m². */
  const stepped: Observation[] = Array.from({ length: 24 }, (_, index) => {
    const area = 40 + index * 6;
    const garage = index % 2;
    return { features: { area, garage }, value: (area > 100 ? 300 : 100) + garage * 20 };
  });
  const options = { rounds: 200, learningRate: 0.1, maxDepth: 2 };

  it('learns a threshold that linear regression cannot', () => {
    const boosted = runBoosted({ observations: stepped, ...options });
    const regression = runRegression({ observations: stepped });

    expect(boosted.rSquared).toBeGreaterThan(0.99);
    expect(boosted.rSquared).toBeGreaterThan(regression.rSquared);
    expect(boosted.rmse).toBeLessThan(5);
  });

  it('predicts on either side of the threshold', () => {
    const below = runBoosted({
      observations: stepped,
      subject: { area: 70, garage: 0 },
      ...options,
    });
    const above = runBoosted({
      observations: stepped,
      subject: { area: 150, garage: 1 },
      ...options,
    });
    expect(below.prediction).toBeCloseTo(100, -1);
    expect(above.prediction).toBeCloseTo(320, -1);
  });

  it('attributes the result to the feature that drives it', () => {
    const { featureImportance } = runBoosted({ observations: stepped, ...options });
    expect(featureImportance.area! + featureImportance.garage!).toBeCloseTo(1, 10);
    expect(featureImportance.area).toBeGreaterThan(0.9);
  });

  it('is deterministic', () => {
    const first = runBoosted({
      observations: stepped,
      subject: { area: 99, garage: 1 },
      ...options,
    });
    const second = runBoosted({
      observations: stepped,
      subject: { area: 99, garage: 1 },
      ...options,
    });
    expect(second).toEqual(first);
  });

  it('stops early when there is nothing to learn', () => {
    const flat = stepped.map((observation) => ({ ...observation, value: 500 }));
    const result = runBoosted({ observations: flat, subject: { area: 80, garage: 0 }, ...options });
    expect(result.rounds).toBe(0);
    expect(result.baseline).toBe(500);
    expect(result.prediction).toBe(500);
    expect(result.rSquared).toBe(1);
  });
});
