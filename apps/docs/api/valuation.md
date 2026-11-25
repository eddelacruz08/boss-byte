# Valuation models

`apps/api/src/lib/valuation/` holds four small statistical models, as an example of a module that
computes instead of storing. They come from property valuation, but nothing in them is specific to
property: an observation is a set of named numbers and a value.

| Endpoint                             | Model                                               | Function         |
| ------------------------------------ | --------------------------------------------------- | ---------------- |
| `POST /api/v1/valuation/regression`  | Multiple linear regression (ordinary least squares) | `runRegression`  |
| `POST /api/v1/valuation/comparables` | Sales comparison, as k-nearest-neighbours           | `runComparables` |
| `POST /api/v1/valuation/ratio-study` | Assessment ratio study (COD and PRD)                | `runRatioStudy`  |
| `POST /api/v1/valuation/boosted`     | Gradient-boosted regression trees                   | `runBoosted`     |

Every route needs a signed-in user with the `valuation:run` permission, which all four roles
except `viewer` have. The routes are stateless: the model is fitted to the data in the request
and nothing is saved. The request body limit is 1 MB.

The request and result schemas are in `packages/shared/src/schemas/valuation.ts`, so the dashboard
gets the same types.

## Observations

Three of the four models take a list of observations:

```json
{ "features": { "floorArea": 80, "bedrooms": 2 }, "value": 4100000 }
```

- `features` maps a name to a finite number. Encode categories yourself (for example
  `"hasGarage": 1`).
- `value` is what you want to explain or predict, such as a sale price.
- **Every observation must have exactly the same feature names.** A missing feature is an error
  (`400 invalid_observations`), not a zero, because guessing would bias the model.

The examples below all use this data:

```json
[
  { "features": { "floorArea": 80, "bedrooms": 2 }, "value": 4100000 },
  { "features": { "floorArea": 95, "bedrooms": 3 }, "value": 4900000 },
  { "features": { "floorArea": 120, "bedrooms": 3 }, "value": 5800000 },
  { "features": { "floorArea": 150, "bedrooms": 4 }, "value": 7300000 },
  { "features": { "floorArea": 60, "bedrooms": 1 }, "value": 3000000 },
  { "features": { "floorArea": 110, "bedrooms": 4 }, "value": 5900000 }
]
```

## Linear regression

Fits `value = intercept + b1·feature1 + b2·feature2 + …` by ordinary least squares, solved with a
QR decomposition (`ml-matrix`).

| Field          | Rules                                                     |
| -------------- | --------------------------------------------------------- |
| `observations` | At least 3, and more than the number of features plus one |
| `subject`      | Optional. Features of the item to predict                 |

```bash
curl http://localhost:4000/api/v1/valuation/regression \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "observations": [
      { "features": { "floorArea": 80, "bedrooms": 2 }, "value": 4100000 },
      { "features": { "floorArea": 95, "bedrooms": 3 }, "value": 4900000 },
      { "features": { "floorArea": 120, "bedrooms": 3 }, "value": 5800000 },
      { "features": { "floorArea": 150, "bedrooms": 4 }, "value": 7300000 },
      { "features": { "floorArea": 60, "bedrooms": 1 }, "value": 3000000 },
      { "features": { "floorArea": 110, "bedrooms": 4 }, "value": 5900000 }
    ],
    "subject": { "floorArea": 100, "bedrooms": 3 }
  }'
```

```json
{
  "intercept": 506514.65798045526,
  "coefficients": { "bedrooms": 375244.29967426776, "floorArea": 35092.29098805645 },
  "rSquared": 0.9991632724243943,
  "adjustedRSquared": 0.9986054540406571,
  "standardError": 56371.13971429993,
  "observations": 6,
  "prediction": 5141476.655808903
}
```

How to read it:

- **`coefficients`** — the change in value for one more unit of that feature with the others held
  constant. Here, each extra square metre adds about 35,092 and each extra bedroom about 375,244.
- **`rSquared`** — the share of the variation in value the model explains, from 0 to 1.
- **`adjustedRSquared`** — the same, penalised for each feature. Compare models with different
  numbers of features on this one.
- **`standardError`** — the typical size of the model's miss, in the units of `value`.
- **`prediction`** — the fitted value for `subject`, or `null` when you sent none.

Results are not rounded. Round when you display them.

| Code                        | Cause                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `insufficient_observations` | Fewer than features + 2 observations                                                          |
| `collinear_features`        | A feature is constant, or can be computed from the others (square metres next to square feet) |
| `invalid_observations`      | No features, feature names differ between observations, or the subject lacks one              |

All are status 400.

## Comparables

The sales-comparison approach: find the `k` observations most like the subject and average their
values, giving closer matches more weight.

| Field          | Rules                               |
| -------------- | ----------------------------------- |
| `observations` | At least 1                          |
| `subject`      | Required                            |
| `k`            | Integer from 1 to 25. Defaults to 5 |

With the data above, `"subject": { "floorArea": 100, "bedrooms": 3 }` and `"k": 3`:

```json
{
  "estimate": 5179976.823306049,
  "comparables": [
    { "index": 1, "value": 4900000, "distance": 0.17342199390482402, "weight": 0.7024616357248799 },
    { "index": 2, "value": 5800000, "distance": 0.6936879756192961, "weight": 0.17561540969070585 },
    { "index": 5, "value": 5900000, "distance": 0.9991744253970395, "weight": 0.12192295458441431 }
  ]
}
```

- **`index`** is the zero-based position of the comparable in the `observations` you sent, so you
  can show which records were used.
- **`distance`** is Euclidean distance after each feature is standardised to z-scores. Without
  that step a feature in large units (floor area) would drown out one in small units (bedrooms).
- **`weight`** is the inverse of the distance, scaled so the weights sum to 1. An exact match
  takes nearly all the weight.
- **`estimate`** is the weighted average of the comparables' values.

If `k` is larger than the number of observations, all of them are used.

Every feature counts equally. To make one matter more, scale it before you send it, or use
regression, which works the weights out for itself.

## Ratio study

Measures how well a set of assessed values tracks actual sale prices, using the standard IAAO
statistics. It takes pairs instead of observations:

```json
{
  "pairs": [
    { "assessed": 3900000, "sale": 4100000 },
    { "assessed": 5000000, "sale": 4900000 },
    { "assessed": 5200000, "sale": 5800000 },
    { "assessed": 6100000, "sale": 7300000 }
  ]
}
```

At least two pairs, and both numbers must be positive.

```json
{
  "count": 4,
  "meanRatio": 0.925948959488631,
  "medianRatio": 0.9238856181665265,
  "weightedMeanRatio": 0.9140271493212669,
  "cod": 6.47968504590281,
  "prd": 1.0130431685494428
}
```

| Field               | Meaning                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meanRatio`         | Average of `assessed / sale`                                                                                                                                                                      |
| `medianRatio`       | Median of the ratios. Near 1 means assessments track the market                                                                                                                                   |
| `weightedMeanRatio` | Total assessed value divided by total sale value                                                                                                                                                  |
| `cod`               | Coefficient of dispersion, **in percent**: the average deviation from the median ratio. Lower is more uniform; under 15 is the usual target for residential property                              |
| `prd`               | Price-related differential: `meanRatio / weightedMeanRatio`. Above about 1.03 suggests expensive properties are under-assessed relative to cheap ones (regressive); below about 0.98, the reverse |

In the example, assessments run about 8% under the market, evenly (COD 6.5) and without a
meaningful bias by price (PRD 1.01).

## Boosted trees

Gradient-boosted regression trees, written from scratch in `boosted.ts` with no machine-learning
dependency. The model starts from the average value and adds small decision trees one at a time,
each fitted to what the model so far still gets wrong. Unlike linear regression it can learn
thresholds and interactions without being told about them.

| Field          | Rules                                                             |
| -------------- | ----------------------------------------------------------------- |
| `observations` | At least 5                                                        |
| `subject`      | Optional                                                          |
| `rounds`       | Maximum number of trees. Integer from 1 to 500. Defaults to 100   |
| `learningRate` | How much each tree contributes. Above 0, up to 1. Defaults to 0.1 |
| `maxDepth`     | Depth of each tree. Integer from 1 to 4. Defaults to 2            |

With the data above and the defaults:

```json
{
  "rounds": 100,
  "baseline": 5166666.666666667,
  "rSquared": 0.9301972560025047,
  "rmse": 364070.94774343,
  "featureImportance": { "bedrooms": 0.5929863923580695, "floorArea": 0.4070136076419305 },
  "prediction": 4744061.848187098
}
```

- **`rounds`** is the number of trees actually built. It is lower than you asked for when the
  model runs out of useful splits.
- **`baseline`** is the mean of the observed values: the prediction before any tree is added.
- **`rSquared`** and **`rmse`** are measured **on the training data**, so they flatter the model.
  They say how closely it fits what it has seen, not how well it predicts.
- **`featureImportance`** is each feature's share of the total error reduction. The shares sum
  to 1.

Things to know before you rely on it:

- Training is deterministic. The same request always gives the same result.
- Each leaf needs at least two observations, so with very little data the trees cannot split much.
  Six observations, as here, is a demonstration and not a model. Compare the two predictions: the
  regression says 5.14 million and the trees say 4.74 million.
- Trees cannot extrapolate. A subject outside the range of the training data gets the value of
  the nearest leaf.
- It runs in the request, on the API's event loop. The body limit and the caps on `rounds` and
  `maxDepth` keep that bounded. For training on large data sets, move the call into a
  [background job](/api/jobs).

## Using the functions directly

The models are pure functions with no database or HTTP involved. Call them from a service or a
job:

```ts
import { runRatioStudy, runRegression } from '../../lib/valuation';

const model = runRegression({ observations, subject });
const study = runRatioStudy({ pairs });
```

`runComparables` and `runBoosted` take the parsed request type, in which the defaulted fields are
required. Pass them explicitly:

```ts
import { runBoosted, runComparables } from '../../lib/valuation';

const nearest = runComparables({ observations, subject, k: 5 });
const boosted = runBoosted({ observations, subject, rounds: 100, learningRate: 0.1, maxDepth: 2 });
```

The functions throw `HttpError`s (`badRequest`) for unusable input, so inside a route the error
handler turns them into 400 responses for you.

The module also exports the statistics helpers it is built on: `sum`, `mean`, `median`,
`standardDeviation` and `rSquared(actual, predicted)`.

## On the dashboard

The **Valuation** page (`apps/core/src/routes/_authenticated/valuation.tsx`) runs all four models
against a bundled set of fictional properties and charts the results. See
[Charts and maps](/frontend/charts-and-maps).

## Add a model

1. Add the request and result schemas to `packages/shared/src/schemas/valuation.ts`.
2. Write the function in `apps/api/src/lib/valuation/`, export it from `index.ts`, and add cases
   to `valuation.test.ts`. Use `buildFeatureMatrix` from `features.ts` to turn observations into
   rows with a stable column order.
3. Add a route to `apps/api/src/modules/valuation/valuation.routes.ts`.
4. Describe it in `apps/api/src/docs/openapi.ts`.
