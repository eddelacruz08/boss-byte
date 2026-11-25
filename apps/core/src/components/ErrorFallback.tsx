import { Alert, Button } from '@bossbyte/ui';
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { isApiError } from '@/lib/api';

/** The router's error boundary: shown when a route throws while loading or rendering. */
export function ErrorFallback({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const requestId = isApiError(error) ? error.requestId : undefined;

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col justify-center p-6">
      <title>Something went wrong · BossByte</title>
      <Alert tone="danger" title="Something went wrong">
        <p>
          {isApiError(error)
            ? error.message
            : 'This page hit an unexpected error. Trying again usually helps.'}
        </p>
        {requestId && <p className="mt-1 text-xs opacity-80">Request ID: {requestId}</p>}
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          Try again
        </Button>
      </Alert>
    </div>
  );
}
