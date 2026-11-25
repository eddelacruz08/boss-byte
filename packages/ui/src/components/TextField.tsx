import { useId, type ReactNode } from 'react';
import { FormField } from './FormField';
import { Input, type InputProps } from './Input';

export interface TextFieldProps extends Omit<InputProps, 'invalid'> {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
}

/**
 * A labelled input with hint and error text. Spread react-hook-form's
 * `register()` result straight onto it:
 *
 *   <TextField label="Email" error={errors.email?.message} {...register('email')} />
 */
export function TextField({
  label,
  error,
  hint,
  id,
  required,
  className,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;

  return (
    <FormField
      label={label}
      htmlFor={fieldId}
      error={error}
      hint={hint}
      required={required}
      className={className}
    >
      <Input
        id={fieldId}
        required={required}
        invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...props}
      />
    </FormField>
  );
}
