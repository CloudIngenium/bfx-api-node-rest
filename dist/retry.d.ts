/**
 * Retry with exponential backoff for Bitfinex API calls.
 *
 * Understands Bitfinex-specific error patterns (rate limits, nonce errors,
 * network failures) and applies appropriate backoff strategies.
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => rest.submitOrder(order),
 *   { maxAttempts: 5, baseDelayMs: 1000 }
 * )
 * ```
 */
export interface RetryOptions {
    /** Maximum retry attempts (default: 5) */
    maxAttempts?: number;
    /** Base delay for exponential backoff in ms (default: 1000) */
    baseDelayMs?: number;
    /** Maximum delay cap in ms (default: 300_000 = 5 minutes) */
    maxDelayMs?: number;
    /** AbortSignal to cancel retries */
    signal?: AbortSignal;
}
/**
 * Sleep that can be cancelled via AbortSignal.
 */
export declare function abortableSleep(ms: number, signal?: AbortSignal): Promise<void>;
/**
 * Determines if an error is retryable based on Bitfinex error patterns.
 */
export declare function isRetryable(error: unknown): boolean;
/**
 * Calculates the backoff delay for a given attempt.
 */
export declare function getBackoffDelay(error: unknown, attempt: number, baseDelayMs: number, maxDelayMs: number): number;
/**
 * Retry an async function with exponential backoff.
 *
 * Understands Bitfinex API errors and applies appropriate strategies:
 * - Rate limit (10010 / 429): uses `retryAfterMs` from error
 * - Nonce error (10114): short 1s delay
 * - Network errors (ECONNRESET, ETIMEDOUT): linear backoff
 * - Authentication errors (bad key): fail immediately (not retryable)
 * - Other errors: exponential backoff with jitter
 */
export declare function retryWithBackoff<T>(fn: () => Promise<T>, options?: RetryOptions | number, baseDelayMsLegacy?: number, signalLegacy?: AbortSignal): Promise<T>;
