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

import _debug from 'debug'
import { RateLimitError, AuthenticationError, BfxApiError } from './errors.js'

const debug = _debug('bfx:retry')

export interface RetryOptions {
  /** Maximum retry attempts (default: 5) */
  maxAttempts?: number
  /** Base delay for exponential backoff in ms (default: 1000) */
  baseDelayMs?: number
  /** Maximum delay cap in ms (default: 300_000 = 5 minutes) */
  maxDelayMs?: number
  /** AbortSignal to cancel retries */
  signal?: AbortSignal
}

/**
 * Sleep that can be cancelled via AbortSignal.
 */
export function abortableSleep (ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error('Aborted'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new Error('Aborted'))
      }, { once: true })
    }
  })
}

/**
 * Determines if an error is retryable based on Bitfinex error patterns.
 */
export function isRetryable (error: unknown): boolean {
  if (error instanceof RateLimitError) return true
  if (error instanceof AuthenticationError) {
    // Nonce errors are retryable; bad credentials are not
    return error.code === 10114
  }
  if (error instanceof BfxApiError) {
    // Server errors are retryable
    return error.status >= 500
  }

  const msg = getErrorMsg(error)
  return (
    msg.includes('ERR_RATE_LIMIT') ||
    msg.includes('rate limit') ||
    msg.includes('nonce') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('EPIPE') ||
    msg.includes('fetch failed')
  )
}

/**
 * Calculates the backoff delay for a given attempt.
 */
export function getBackoffDelay (
  error: unknown,
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  // Rate limit: use retryAfterMs if available, otherwise exponential backoff
  if (error instanceof RateLimitError) {
    return Math.min(error.retryAfterMs, maxDelayMs)
  }

  // Nonce error: short fixed delay
  const msg = getErrorMsg(error)
  if (msg.includes('nonce')) {
    return 1000
  }

  // Network error: linear backoff
  if (
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('fetch failed')
  ) {
    return Math.min(baseDelayMs * (attempt + 1), 60_000)
  }

  // Default: exponential backoff with jitter
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
  const jitter = Math.random() * 1000
  return delay + jitter
}

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
export async function retryWithBackoff<T> (
  fn: () => Promise<T>,
  options?: RetryOptions | number,
  baseDelayMsLegacy = 1000,
  signalLegacy?: AbortSignal
): Promise<T> {
  // Support legacy positional args: retryWithBackoff(fn, maxAttempts, baseDelayMs, signal)
  let maxAttempts: number
  let baseDelayMs: number
  let maxDelayMs: number
  let signal: AbortSignal | undefined

  if (typeof options === 'number') {
    maxAttempts = options
    baseDelayMs = baseDelayMsLegacy
    maxDelayMs = 300_000
    signal = signalLegacy
  } else {
    maxAttempts = options?.maxAttempts ?? 5
    baseDelayMs = options?.baseDelayMs ?? 1000
    maxDelayMs = options?.maxDelayMs ?? 300_000
    signal = options?.signal
  }

  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('Aborted')

    try {
      return await fn()
    } catch (error) {
      if (signal?.aborted) throw new Error('Aborted', { cause: error })

      lastError = error as Error

      // Non-retryable errors fail immediately
      if (!isRetryable(error)) {
        if (attempt < maxAttempts - 1) {
          // Give generic errors one more shot with base delay
          debug('non-retryable error on attempt %d/%d, trying once more: %s', attempt + 1, maxAttempts, getErrorMsg(error))
          await abortableSleep(baseDelayMs, signal)
          continue
        }
        throw error
      }

      if (attempt === maxAttempts - 1) {
        throw error
      }

      const delay = getBackoffDelay(error, attempt, baseDelayMs, maxDelayMs)
      debug('attempt %d/%d failed (%s), retrying in %dms', attempt + 1, maxAttempts, getErrorMsg(error), Math.round(delay))
      await abortableSleep(delay, signal)
    }
  }

  throw lastError ?? new Error('Max retry attempts exceeded')
}

function getErrorMsg (error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
