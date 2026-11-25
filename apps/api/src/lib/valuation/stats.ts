export function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

/** Population standard deviation. */
export function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

/** R²: the share of the variance in `actual` that `predicted` accounts for. */
export function rSquared(actual: readonly number[], predicted: readonly number[]): number {
  const average = mean(actual);
  const total = sum(actual.map((value) => (value - average) ** 2));
  const residual = sum(actual.map((value, index) => (value - predicted[index]!) ** 2));
  // Every observation has the same value: any model that reproduces it is a perfect fit.
  if (total === 0) return residual === 0 ? 1 : 0;
  return 1 - residual / total;
}
