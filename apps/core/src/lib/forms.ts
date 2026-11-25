import { phoneSchema } from '@bossbyte/shared';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { isApiError } from './api';

/**
 * A phone field that may be left blank. A text input cannot produce `null`,
 * so the empty string stands for "no phone"; send `value || null` to the API.
 */
export const optionalPhoneSchema = z.union([z.literal(''), phoneSchema]);

/**
 * Shows the API's per-field validation messages on the matching form fields.
 * Returns `false` when there was nothing to show, so the caller can fall back
 * to a form-level message.
 *
 * @example
 *   onError: (error) => {
 *     if (!applyApiFieldErrors(error, form)) setFormError(errorMessage(error));
 *   }
 */
export function applyApiFieldErrors<T extends FieldValues>(
  error: unknown,
  form: Pick<UseFormReturn<T>, 'getValues' | 'setError'>,
): boolean {
  if (!isApiError(error)) return false;

  const fields = new Set(Object.keys(form.getValues()));
  let applied = false;
  for (const detail of error.details) {
    if (!fields.has(detail.path)) continue;
    form.setError(detail.path as Path<T>, { type: 'server', message: detail.message });
    applied = true;
  }
  return applied;
}
