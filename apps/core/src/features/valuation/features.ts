import type { Observation, RatioStudyRequest } from '@bossbyte/shared';
import { z } from 'zod';
import type { SampleProperty } from '@/data/sample-properties';

/** The property attributes the models learn from, in display order. */
export const FEATURES = [
  { key: 'floorArea', label: 'Floor area', unit: 'm²', min: 10, max: 2_000 },
  { key: 'lotArea', label: 'Lot area', unit: 'm²', min: 10, max: 10_000 },
  { key: 'age', label: 'Age', unit: 'years', min: 0, max: 150 },
  { key: 'bedrooms', label: 'Bedrooms', unit: '', min: 0, max: 20 },
] as const;

const featureField = ({ label, min, max }: (typeof FEATURES)[number]) =>
  z
    .number(`${label} is required`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);

/** The subject property form: the four features plus how many comparables to use. */
export const subjectSchema = z.object({
  floorArea: featureField(FEATURES[0]),
  lotArea: featureField(FEATURES[1]),
  age: featureField(FEATURES[2]),
  bedrooms: featureField(FEATURES[3]).int('Bedrooms must be a whole number'),
  k: z
    .number('Enter how many comparables to use')
    .int('Use a whole number')
    .min(1, 'Use at least 1 comparable')
    .max(25, 'Use at most 25 comparables'),
});

export type SubjectForm = z.infer<typeof subjectSchema>;

export function featureLabel(key: string): string {
  return FEATURES.find((feature) => feature.key === key)?.label ?? key;
}

/** Sales as model input: the features explain, the sale price is what is explained. */
export function toObservations(properties: readonly SampleProperty[]): Observation[] {
  return properties.map((property) => ({
    features: {
      floorArea: property.floorArea,
      lotArea: property.lotArea,
      age: property.age,
      bedrooms: property.bedrooms,
    },
    value: property.salePrice,
  }));
}

export function toRatioPairs(properties: readonly SampleProperty[]): RatioStudyRequest['pairs'] {
  return properties.map((property) => ({
    assessed: property.assessedValue,
    sale: property.salePrice,
  }));
}
