import type { RegressionRequest, RegressionResult } from '@bossbyte/shared';
import { Matrix, QrDecomposition } from 'ml-matrix';
import { badRequest } from '../errors';
import { buildFeatureMatrix, toVector } from './features';
import { rSquared, sum } from './stats';

/**
 * Multiple linear regression by ordinary least squares — the classic
 * statistical valuation model:
 *
 *   value = intercept + b1·feature1 + b2·feature2 + …
 *
 * Each coefficient is the change in value for a one-unit change in that
 * feature with the others held constant (e.g. price per extra square metre).
 * Solved with a QR decomposition, which is numerically steadier than
 * inverting XᵀX directly.
 */
export function runRegression({ observations, subject }: RegressionRequest): RegressionResult {
  const { names, rows, values } = buildFeatureMatrix(observations);
  const n = rows.length;
  const parameters = names.length + 1;

  if (n <= parameters) {
    throw badRequest(
      `A model with ${names.length} feature(s) needs at least ${parameters + 1} observations`,
      'insufficient_observations',
    );
  }

  // A leading column of ones estimates the intercept.
  const design = new Matrix(rows.map((row) => [1, ...row]));
  const qr = new QrDecomposition(design);
  if (isRankDeficient(design, qr)) {
    throw badRequest(
      'The features are linearly dependent (one is constant, or can be computed from the others)',
      'collinear_features',
    );
  }

  const solution = qr.solve(Matrix.columnVector(values)).to1DArray();
  const [intercept = 0, ...slopes] = solution;

  const predict = (row: readonly number[]) =>
    intercept + sum(row.map((value, index) => value * slopes[index]!));

  const fitted = rows.map(predict);
  const residualSumOfSquares = sum(values.map((value, index) => (value - fitted[index]!) ** 2));
  const r2 = rSquared(values, fitted);

  return {
    intercept,
    coefficients: Object.fromEntries(names.map((name, index) => [name, slopes[index]!])),
    rSquared: r2,
    // Penalises R² for each extra feature, so adding noise does not look like progress.
    adjustedRSquared: 1 - ((1 - r2) * (n - 1)) / (n - parameters),
    standardError: Math.sqrt(residualSumOfSquares / (n - parameters)),
    observations: n,
    prediction: subject ? predict(toVector(names, subject)) : null,
  };
}

/** How little of a column may be left, relative to its length, before it counts as redundant. */
const RANK_TOLERANCE = 1e-10;

/**
 * Each diagonal entry of R is what remains of a column once everything the
 * earlier columns explain has been removed. `qr.isFullRank()` only catches a
 * remainder of exactly zero, which rounding error almost never produces (square
 * metres next to square feet leaves ~1e-13), so compare against the column's
 * own length instead.
 */
function isRankDeficient(design: Matrix, qr: QrDecomposition): boolean {
  const r = qr.upperTriangularMatrix;
  for (let column = 0; column < design.columns; column += 1) {
    const length = Math.hypot(...design.getColumn(column));
    if (Math.abs(r.get(column, column)) <= RANK_TOLERANCE * length) return true;
  }
  return false;
}
