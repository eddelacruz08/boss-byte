import type { ComponentProps } from 'react';

type IconProps = ComponentProps<'svg'>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}

export function LogoMark(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" {...props}>
      <rect width="32" height="32" rx="8" fill="#5b3ae8" />
      <path
        d="M10 8h7.5a4.5 4.5 0 0 1 2.6 8.2A4.8 4.8 0 0 1 18 25h-8V8Zm3.5 3v4h3.6a2 2 0 0 0 0-4h-3.6Zm0 7v4H18a2 2 0 0 0 0-4h-4.5Z"
        fill="#fff"
      />
    </svg>
  );
}
