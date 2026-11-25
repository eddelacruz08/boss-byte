import type { ComparablesRequest, ComparablesResult } from '@bossbyte/shared';
import { buildFeatureMatrix, toVector } from './features';
import { mean, standardDeviation, sum } from './stats';

/**
 * The sales-comparison approach as k-nearest-neighbours: find the `k`
 * observations most similar to the subject and average their values, giving
 * closer matches more weight.
 *
 * Features are standardised first (z-scores) so that one measured in large
 * units, such as lot area, does not drown out one measured in small units,
 * such as bedrooms.
 */
export function runComparables({
  observations,
  subject,
  k,
}: ComparablesRequest): ComparablesResult {
  const { names, rows, values } = buildFeatureMatrix(observations);
  const target = toVector(names, subject);

  const scales = names.map((_, column) => {
    const columnValues = rows.map((row) => row[column]!);
    // A feature that never varies carries no information; a deviation of 1 leaves it inert.
    return { mean: mean(columnValues), deviation: standardDeviation(columnValues) || 1 };
  });
  const standardise = (row: readonly number[]) =>
    row.map((value, column) => (value - scales[column]!.mean) / scales[column]!.deviation);

  const standardTarget = standardise(target);
  const nearest = rows
    .map((row, index) => ({
      index,
      value: values[index]!,
      distance: Math.sqrt(
        sum(standardise(row).map((value, column) => (value - standardTarget[column]!) ** 2)),
      ),
    }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, k);

  // Inverse-distance weights; the epsilon keeps an exact match from dividing by zero.
  const rawWeights = nearest.map((neighbour) => 1 / (neighbour.distance + 1e-9));
  const totalWeight = sum(rawWeights);
  const comparables = nearest.map((neighbour, position) => ({
    ...neighbour,
    weight: rawWeights[position]! / totalWeight,
  }));

  return {
    estimate: sum(comparables.map((comparable) => comparable.value * comparable.weight)),
    comparables,
  };
}
