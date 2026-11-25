import type { BoostedRequest, BoostedResult } from '@bossbyte/shared';
import { buildFeatureMatrix, toVector } from './features';
import { mean, rSquared, sum } from './stats';

/**
 * Gradient-boosted regression trees, implemented from scratch.
 *
 * The model starts from the average value and then adds small decision trees
 * one at a time, each trained to predict what the model so far still gets
 * wrong (the residuals). Unlike linear regression it can learn thresholds
 * ("a second bathroom matters more in large houses") without being told.
 *
 * Training is deterministic: the same data always yields the same model.
 */

interface TreeNode {
  /** Prediction for rows that end at this node. */
  value: number;
  /** Set on internal nodes: rows with `feature <= threshold` go left. */
  split?: { feature: number; threshold: number; left: TreeNode; right: TreeNode };
}

const MIN_SAMPLES_PER_LEAF = 2;
const MIN_GAIN = 1e-12;

interface Split {
  feature: number;
  threshold: number;
  gain: number;
  left: number[];
  right: number[];
}

/**
 * Finds the split that most reduces the squared error. For a fixed set of
 * rows, minimising squared error is the same as maximising
 * sum(left)²/n(left) + sum(right)²/n(right), which a single sorted pass can
 * evaluate for every threshold.
 */
function findBestSplit(rows: number[][], targets: number[], indices: number[]): Split | null {
  const total = sum(indices.map((index) => targets[index]!));
  const baseScore = total ** 2 / indices.length;
  let best: Split | null = null;

  for (let feature = 0; feature < rows[0]!.length; feature++) {
    const sorted = [...indices].sort((a, b) => rows[a]![feature]! - rows[b]![feature]!);
    let leftSum = 0;

    for (let position = 0; position < sorted.length - 1; position++) {
      leftSum += targets[sorted[position]!]!;
      const leftCount = position + 1;
      const rightCount = sorted.length - leftCount;
      if (leftCount < MIN_SAMPLES_PER_LEAF || rightCount < MIN_SAMPLES_PER_LEAF) continue;

      const current = rows[sorted[position]!]![feature]!;
      const next = rows[sorted[position + 1]!]![feature]!;
      // Equal values cannot be separated by a threshold.
      if (current === next) continue;

      const gain = leftSum ** 2 / leftCount + (total - leftSum) ** 2 / rightCount - baseScore;
      if (gain > (best?.gain ?? MIN_GAIN)) {
        best = {
          feature,
          threshold: (current + next) / 2,
          gain,
          left: sorted.slice(0, leftCount),
          right: sorted.slice(leftCount),
        };
      }
    }
  }
  return best;
}

function growTree(
  rows: number[][],
  targets: number[],
  indices: number[],
  depth: number,
  importance: number[],
): TreeNode {
  const value = mean(indices.map((index) => targets[index]!));
  if (depth === 0) return { value };

  const split = findBestSplit(rows, targets, indices);
  if (!split) return { value };

  importance[split.feature]! += split.gain;
  return {
    value,
    split: {
      feature: split.feature,
      threshold: split.threshold,
      left: growTree(rows, targets, split.left, depth - 1, importance),
      right: growTree(rows, targets, split.right, depth - 1, importance),
    },
  };
}

function predictTree(node: TreeNode, row: readonly number[]): number {
  let current = node;
  while (current.split) {
    current =
      row[current.split.feature]! <= current.split.threshold
        ? current.split.left
        : current.split.right;
  }
  return current.value;
}

export function runBoosted({
  observations,
  subject,
  rounds,
  learningRate,
  maxDepth,
}: BoostedRequest): BoostedResult {
  const { names, rows, values } = buildFeatureMatrix(observations);
  const baseline = mean(values);
  const everyRow = rows.map((_, index) => index);

  const trees: TreeNode[] = [];
  const importance = names.map(() => 0);
  const fitted = values.map(() => baseline);

  for (let round = 0; round < rounds; round++) {
    const residuals = values.map((value, index) => value - fitted[index]!);
    const tree = growTree(rows, residuals, everyRow, maxDepth, importance);
    // A tree that could not split has nothing left to learn from.
    if (!tree.split) break;

    trees.push(tree);
    rows.forEach((row, index) => {
      fitted[index]! += learningRate * predictTree(tree, row);
    });
  }

  const predict = (row: readonly number[]) =>
    baseline + learningRate * sum(trees.map((tree) => predictTree(tree, row)));

  const totalImportance = sum(importance);
  return {
    rounds: trees.length,
    baseline,
    rSquared: rSquared(values, fitted),
    rmse: Math.sqrt(mean(values.map((value, index) => (value - fitted[index]!) ** 2))),
    featureImportance: Object.fromEntries(
      names.map((name, index) => [
        name,
        totalImportance === 0 ? 0 : importance[index]! / totalImportance,
      ]),
    ),
    prediction: subject ? predict(toVector(names, subject)) : null,
  };
}
