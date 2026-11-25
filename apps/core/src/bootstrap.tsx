import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { authStore } from '@/lib/auth';
import { queryClient } from '@/lib/query-client';
import { router } from './router';
import './styles.css';

// Cached responses belong to whoever was signed in; the next person must not see them.
authStore.subscribe(() => {
  if (authStore.getState().status === 'unauthenticated') queryClient.clear();
});

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing the #root element');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
