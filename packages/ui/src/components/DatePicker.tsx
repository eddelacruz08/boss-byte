import { useId, type ReactNode } from 'react';
import ReactDatePicker from 'react-datepicker';
import { cn } from '../lib/cn';
import { controlClasses, controlInvalidClasses } from '../lib/control';

export interface DatePickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  label?: ReactNode;
  error?: string;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  /** A date-fns format string, as react-datepicker expects. */
  dateFormat?: string;
  disabled?: boolean;
  className?: string;
}

/** A single-date picker with a typed-in fallback. Styled by `@bossbyte/ui/styles.css`. */
export function DatePicker({
  value,
  onChange,
  label,
  error,
  minDate,
  maxDate,
  placeholder = 'Select a date',
  dateFormat = 'MMM d, yyyy',
  disabled = false,
  className,
}: DatePickerProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {label}
        </label>
      )}
      <ReactDatePicker
        id={id}
        selected={value}
        onChange={(date: Date | null) => onChange(date)}
        minDate={minDate}
        maxDate={maxDate}
        placeholderText={placeholder}
        dateFormat={dateFormat}
        disabled={disabled}
        showPopperArrow={false}
        autoComplete="off"
        ariaInvalid={error ? 'true' : undefined}
        ariaDescribedBy={error ? errorId : undefined}
        className={cn(controlClasses, error && controlInvalidClasses)}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
