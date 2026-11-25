import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

/**
 * Renders a component that uses TanStack Query. Each call gets its own client
 * with retries off, so a failing request fails the test at once and nothing
 * leaks from one test into the next.
 *
 * @example
 *   renderWithQuery(<LoginForm onSignedIn={onSignedIn} />);
 */
export function renderWithQuery(ui: ReactElement): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
