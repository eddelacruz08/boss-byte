import { Button, Card, TextField } from '@bossbyte/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { PageHeader } from '@/components/PageHeader';
import { QueryError } from '@/components/QueryError';
import { RequirePermission } from '@/components/RequirePermission';
import { SAMPLE_PROPERTIES } from '@/data/sample-properties';
import { runSampleValuation } from '@/features/valuation/api';
import { FEATURES, subjectSchema, type SubjectForm } from '@/features/valuation/features';
import { ValuationResultsView } from '@/features/valuation/ValuationResultsView';

export const Route = createFileRoute('/_authenticated/valuation')({ component: ValuationPage });

const DEFAULT_SUBJECT: SubjectForm = { floorArea: 150, lotArea: 250, age: 12, bedrooms: 3, k: 5 };

function ValuationPage() {
  return (
    <RequirePermission permission="valuation:run" pageTitle="Valuation">
      <Valuation />
    </RequirePermission>
  );
}

function Valuation() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(subjectSchema), defaultValues: DEFAULT_SUBJECT });
  const run = useMutation({ mutationFn: runSampleValuation });

  return (
    <>
      <PageHeader
        title="Valuation"
        description={`Estimate what a property is worth from ${SAMPLE_PROPERTIES.length} sample sales, four ways: linear regression, comparable sales, gradient-boosted trees and a ratio study of the assessments.`}
      />

      <Card title="Subject property" description="The property to value.">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={handleSubmit((subject) => run.mutate(subject))}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {FEATURES.map((feature) => (
              <TextField
                key={feature.key}
                label={feature.unit ? `${feature.label} (${feature.unit})` : feature.label}
                type="number"
                inputMode="decimal"
                step="any"
                error={errors[feature.key]?.message}
                {...register(feature.key, { valueAsNumber: true })}
              />
            ))}
            <TextField
              label="Comparables to use"
              type="number"
              inputMode="numeric"
              error={errors.k?.message}
              {...register('k', { valueAsNumber: true })}
            />
          </div>
          <div>
            <Button type="submit" loading={run.isPending}>
              Run models
            </Button>
          </div>
        </form>
      </Card>

      <section aria-label="Results" aria-live="polite" className="flex flex-col gap-6">
        {run.isError && <QueryError error={run.error} title="The models could not be run" />}
        {run.data && <ValuationResultsView results={run.data} />}
      </section>
    </>
  );
}
