import { formatCurrency, formatNumber, formatPercent } from '@bossbyte/shared';
import { Card, DataTable } from '@bossbyte/ui';
import { BarChart } from '@/components/charts';
import { StatCard } from '@/components/StatCard';
import { SAMPLE_CURRENCY, SAMPLE_PROPERTIES } from '@/data/sample-properties';
import type { ValuationResults } from './api';
import { featureLabel, FEATURES } from './features';

const money = (value: number) =>
  formatCurrency(value, { currency: SAMPLE_CURRENCY, maximumFractionDigits: 0 });

const estimate = (value: number | null) => (value === null ? 'No estimate' : money(value));

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="text-lg font-semibold text-slate-950 tabular-nums">{value}</dd>
      {hint && <dd className="text-sm text-slate-600">{hint}</dd>}
    </div>
  );
}

/** Everything the four models returned, side by side. */
export function ValuationResultsView({ results }: { results: ValuationResults }) {
  const { regression, comparables, ratioStudy, boosted } = results;

  const terms = [
    { term: 'Intercept', unit: '', coefficient: regression.intercept },
    ...FEATURES.map((feature) => ({
      term: feature.label,
      unit: feature.unit ? `per ${feature.unit === 'years' ? 'year' : feature.unit}` : 'each',
      coefficient: regression.coefficients[feature.key] ?? 0,
    })),
  ];

  const importance = Object.entries(boosted.featureImportance).sort(
    ([, first], [, second]) => second - first,
  );

  return (
    <>
      <dl className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Linear regression"
          value={estimate(regression.prediction)}
          hint={`R² ${regression.rSquared.toFixed(3)}`}
        />
        <StatCard
          label="Comparable sales"
          value={money(comparables.estimate)}
          hint={`Weighted average of the ${comparables.comparables.length} most similar sales`}
        />
        <StatCard
          label="Boosted trees"
          value={estimate(boosted.prediction)}
          hint={`R² ${boosted.rSquared.toFixed(3)} on the training data`}
        />
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Regression model"
          description="How much each attribute moves the price, holding the others fixed."
        >
          <div className="flex flex-col gap-5">
            <DataTable
              caption="Regression coefficients"
              columns={[
                { key: 'term', header: 'Term', cell: (row) => row.term },
                {
                  key: 'coefficient',
                  header: 'Coefficient',
                  align: 'right',
                  className: 'tabular-nums whitespace-nowrap',
                  cell: (row) => `${money(row.coefficient)} ${row.unit}`.trim(),
                },
              ]}
              rows={terms}
              rowKey={(row) => row.term}
            />
            <dl className="grid grid-cols-2 gap-4">
              <Figure label="R²" value={regression.rSquared.toFixed(3)} />
              <Figure label="Adjusted R²" value={regression.adjustedRSquared.toFixed(3)} />
              <Figure label="Standard error" value={money(regression.standardError)} />
              <Figure label="Observations" value={formatNumber(regression.observations)} />
            </dl>
          </div>
        </Card>

        <Card
          title="What drives the boosted model"
          description={`Share of the error reduction owed to each attribute, over ${boosted.rounds} trees.`}
        >
          <div className="flex flex-col gap-5">
            <BarChart
              horizontal
              description="Feature importance in the boosted model"
              seriesLabel="Importance"
              labels={importance.map(([key]) => featureLabel(key))}
              values={importance.map(([, share]) => share)}
              formatValue={(share) => formatPercent(share, { maximumFractionDigits: 0 })}
              className="h-48"
            />
            <dl className="grid grid-cols-2 gap-4">
              <Figure label="Baseline (mean sale)" value={money(boosted.baseline)} />
              <Figure label="RMSE" value={money(boosted.rmse)} />
            </dl>
          </div>
        </Card>
      </div>

      <Card
        title="Comparable sales"
        description="The sales most like the subject. Closer ones count for more."
        padded={false}
      >
        <DataTable
          className="rounded-none border-0"
          caption="Comparable sales"
          columns={[
            {
              key: 'address',
              header: 'Property',
              cell: (row) => SAMPLE_PROPERTIES[row.index]?.address ?? `Sale ${row.index + 1}`,
            },
            {
              key: 'distance',
              header: 'Distance',
              align: 'right',
              className: 'tabular-nums',
              cell: (row) => row.distance.toFixed(3),
            },
            {
              key: 'weight',
              header: 'Weight',
              align: 'right',
              className: 'tabular-nums',
              cell: (row) => formatPercent(row.weight),
            },
            {
              key: 'value',
              header: 'Sale price',
              align: 'right',
              className: 'tabular-nums whitespace-nowrap',
              cell: (row) => money(row.value),
            },
          ]}
          rows={comparables.comparables}
          rowKey={(row) => String(row.index)}
        />
      </Card>

      <Card
        title="Ratio study"
        description="How close the assessed values of the sample are to what the properties sold for."
      >
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Figure label="Sales" value={formatNumber(ratioStudy.count)} />
          <Figure
            label="Median ratio"
            value={ratioStudy.medianRatio.toFixed(3)}
            hint="Target: 0.90 to 1.10"
          />
          <Figure label="Mean ratio" value={ratioStudy.meanRatio.toFixed(3)} />
          <Figure label="Weighted mean ratio" value={ratioStudy.weightedMeanRatio.toFixed(3)} />
          <Figure
            label="Coefficient of dispersion"
            value={`${ratioStudy.cod.toFixed(1)}%`}
            hint="Uniformity. 15% or less is good for homes."
          />
          <Figure
            label="Price-related differential"
            value={ratioStudy.prd.toFixed(3)}
            hint="Fairness across price levels. Target: 0.98 to 1.03"
          />
        </dl>
      </Card>
    </>
  );
}
