import { Alert, Button } from '@bossbyte/ui';
import { errorMessage, isApiError } from '@/lib/api';

export interface QueryErrorProps {
  error: unknown;
  /** Usually the query's `refetch`. */
  onRetry?: () => void;
  title?: string;
}

/** The error state for a failed query: what went wrong, a way to retry, and an id to quote. */
export function QueryError({
  error,
  onRetry,
  title = 'This could not be loaded',
}: QueryErrorProps) {
  const requestId = isApiError(error) ? error.requestId : undefined;

  return (
    <Alert tone="danger" title={title}>
      <p>{errorMessage(error)}</p>
      {requestId && <p className="mt-1 text-xs opacity-80">Request ID: {requestId}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Alert>
  );
}
