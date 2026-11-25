import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

type IconProps = Omit<ComponentProps<'svg'>, 'children'>;

/** Decorative by default: icons never carry meaning on their own in this library. */
function Icon({ d, className, ...props }: IconProps & { d: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-5 shrink-0', className)}
      {...props}
    >
      <path d={d} />
    </svg>
  );
}

export const CheckIcon = (props: IconProps) => <Icon d="m4.5 12.75 6 6 9-13.5" {...props} />;

export const CloseIcon = (props: IconProps) => <Icon d="M6 18 18 6M6 6l12 12" {...props} />;

export const ChevronDownIcon = (props: IconProps) => (
  <Icon d="m19.5 8.25-7.5 7.5-7.5-7.5" {...props} />
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon d="M15.75 19.5 8.25 12l7.5-7.5" {...props} />
);

export const ChevronRightIcon = (props: IconProps) => (
  <Icon d="m8.25 4.5 7.5 7.5-7.5 7.5" {...props} />
);

export const ChevronUpDownIcon = (props: IconProps) => (
  <Icon d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" {...props} />
);

export const InfoIcon = (props: IconProps) => (
  <Icon
    d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
    {...props}
  />
);

export const SuccessIcon = (props: IconProps) => (
  <Icon d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" {...props} />
);

export const WarningIcon = (props: IconProps) => (
  <Icon
    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
    {...props}
  />
);

export const DangerIcon = (props: IconProps) => (
  <Icon d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" {...props} />
);

export const UndoIcon = (props: IconProps) => (
  <Icon d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" {...props} />
);

export const RedoIcon = (props: IconProps) => (
  <Icon d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" {...props} />
);

export const BulletListIcon = (props: IconProps) => (
  <Icon
    d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.008v.008H3.75V6.75Zm0 5.25h.008v.008H3.75V12Zm0 5.25h.008v.008H3.75v-.008Z"
    {...props}
  />
);

export const QuoteIcon = (props: IconProps) => (
  <Icon
    d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
    {...props}
  />
);

/** A spinning ring. Pair it with a visible or screen-reader label elsewhere. */
export function SpinnerIcon({ className, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={cn('size-5 shrink-0 animate-spin', className)}
      {...props}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
