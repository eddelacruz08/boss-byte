export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  /** Total attempts, including the first. */
  attempts?: number;
  /** Delay before the second attempt; doubles after each failure. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false to stop retrying, e.g. for errors that will never succeed. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/** Runs `task`, retrying with exponential backoff when it throws. */
export async function retry<T>(
  task: (attempt: number) => Promise<T>,
  {
    attempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 5_000,
    shouldRetry = () => true,
  }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error, attempt)) throw error;
      await sleep(Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs));
    }
  }
}

/** Rejects if `promise` has not settled within `ms` milliseconds. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = 'Timed out'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
