import { ROLE_LABELS, type Permission, type User } from '@bossbyte/shared';
import { Avatar, Badge, cn, DropdownMenu } from '@bossbyte/ui';
import { Link, useNavigate, useRouterState, type LinkProps } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { CloseIcon, LogoMark, MenuIcon } from './icons';

interface NavItem {
  to: LinkProps['to'];
  label: string;
  /** Hidden from roles without it. Leave out for pages everyone can open. */
  permission?: Permission;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/users', label: 'Users', permission: 'users:read' },
  { to: '/files', label: 'Files', permission: 'files:read' },
  { to: '/map', label: 'Map' },
  { to: '/valuation', label: 'Valuation', permission: 'valuation:run' },
  { to: '/reports', label: 'Reports', permission: 'reports:read' },
  { to: '/settings', label: 'Settings' },
];

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

export interface AppShellProps {
  user: User;
  onSignOut: () => void;
  children: ReactNode;
}

/**
 * The frame around every signed-in page: a top bar with the account menu and
 * the main navigation, which is a sidebar on large screens and a collapsible
 * panel on small ones.
 */
export function AppShell({ user, onSignOut, children }: AppShellProps) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const main = useRef<HTMLElement>(null);
  const previousPathname = useRef(pathname);

  // A client-side navigation does not move focus the way a page load does, so
  // keyboard and screen reader users would be left on the link they followed.
  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    main.current?.focus();
  }, [pathname]);

  const items = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className={cn(
          'sr-only rounded-lg bg-white px-4 py-2 text-sm font-medium text-brand-800 shadow-lg',
          'focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50',
          focusRing,
        )}
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <button
          type="button"
          aria-expanded={navOpen}
          aria-controls="main-nav"
          onClick={() => setNavOpen((open) => !open)}
          className={cn(
            'inline-flex size-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden',
            focusRing,
          )}
        >
          {navOpen ? <CloseIcon /> : <MenuIcon />}
          <span className="sr-only">{navOpen ? 'Close navigation' : 'Open navigation'}</span>
        </button>

        <Link
          to="/"
          className={cn(
            'flex items-center gap-2 rounded-md font-semibold text-slate-950',
            focusRing,
          )}
        >
          <LogoMark />
          BossByte
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <Badge tone="brand" className="hidden sm:inline-flex">
            {ROLE_LABELS[user.role]}
          </Badge>
          <DropdownMenu
            className="px-2"
            label={
              <>
                <Avatar name={user.name} size="sm" className="size-7" />
                <span className="sr-only">Account menu,</span>
                <span className="hidden max-w-40 truncate sm:inline">{user.name}</span>
              </>
            }
            items={[
              { label: 'Settings', onSelect: () => void navigate({ to: '/settings' }) },
              { label: 'Sign out', onSelect: onSignOut },
            ]}
          />
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        <nav
          id="main-nav"
          aria-label="Main"
          className={cn(
            'border-b border-slate-200 bg-white p-3 lg:block lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0',
            navOpen ? 'block' : 'hidden',
          )}
        >
          <ul className="flex flex-col gap-1 lg:sticky lg:top-17">
            {items.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.to === '/' }}
                  onClick={() => setNavOpen(false)}
                  className={cn(
                    'block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100',
                    'aria-[current=page]:bg-brand-50 aria-[current=page]:text-brand-800',
                    focusRing,
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main
          id="main"
          ref={main}
          tabIndex={-1}
          className="min-w-0 flex-1 p-4 focus:outline-none sm:p-6 lg:p-8"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
