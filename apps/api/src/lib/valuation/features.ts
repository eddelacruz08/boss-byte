import type { Observation } from '@bossbyte/shared';
import { badRequest } from '../errors';

export type FeatureVector = Record<string, number>;

/**
 * Turns named features into a numeric design matrix with a stable column
 * order. Every observation must supply every feature — silently treating a
 * missing value as zero would bias the model.
 */
export function buildFeatureMatrix(observations: readonly Observation[]): {
  names: string[];
  rows: number[][];
  values: number[];
} {
  const names = Object.keys(observations[0]?.features ?? {}).sort();
  if (names.length === 0) {
    throw badRequest('Observations need at least one feature', 'invalid_observations');
  }

  const rows = observations.map((observation, index) => {
    if (Object.keys(observation.features).length !== names.length) {
      throw badRequest(
        `Observation ${index + 1} does not have the same features as the first`,
        'invalid_observations',
      );
    }
    return toVector(names, observation.features, `Observation ${index + 1}`);
  });

  return { names, rows, values: observations.map((observation) => observation.value) };
}

/** Orders a feature record to match the model's columns. */
export function toVector(
  names: readonly string[],
  features: FeatureVector,
  label = 'Subject',
): number[] {
  return names.map((name) => {
    const value = features[name];
    if (value === undefined) {
      throw badRequest(`${label} is missing the feature "${name}"`, 'invalid_observations');
    }
    return value;
  });
}
