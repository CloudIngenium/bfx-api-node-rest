/**
 * Bitfinex API error hierarchy.
 *
 * Provides typed error classes for common API failure modes so callers
 * can handle specific scenarios (rate limits, auth failures, etc.)
 * instead of catching generic `Error` instances.
 *
 * @example
 * ```typescript
 * try {
 *   await rest.submitOrder(order)
 * } catch (err) {
 *   if (err instanceof RateLimitError) {
 *     await sleep(err.retryAfterMs)
 *   } else if (err instanceof InsufficientFundsError) {
 *     logger.warn('Not enough balance')
 *   }
 * }
 * ```
 */

/**
 * Base error for all Bitfinex API errors.
 *
 * Extends `Error` with HTTP status, Bitfinex error code, and the raw response.
 */
export class BfxApiError extends Error {
  /** HTTP status code (e.g. 400, 429, 500) */
  status: number
  /** HTTP status text (e.g. "Bad Request") */
  statusText: string
  /** Bitfinex API error code (e.g. 10010, 10114) */
  code: number | string | undefined
  /** Raw response body */
  response: unknown

  constructor (
    message: string,
    status: number,
    statusText: string,
    code?: number | string,
    response?: unknown
  ) {
    super(message)
    this.name = 'BfxApiError'
    this.status = status
    this.statusText = statusText
    this.code = code
    this.response = response
  }
}

/**
 * Thrown when the API returns HTTP 429 or error code 10010 (ERR_RATE_LIMIT).
 */
export class RateLimitError extends BfxApiError {
  /** Suggested wait time in milliseconds before retrying */
  retryAfterMs: number

  constructor (message: string, status: number, statusText: string, retryAfterMs = 60_000, response?: unknown) {
    super(message, status, statusText, 10010, response)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

/**
 * Thrown when authentication fails (invalid API key, expired token, bad signature).
 * Bitfinex codes: 10100 (apikey: invalid), 10111 (bad auth), 10114 (nonce too small).
 */
export class AuthenticationError extends BfxApiError {
  constructor (message: string, status: number, statusText: string, code?: number | string, response?: unknown) {
    super(message, status, statusText, code, response)
    this.name = 'AuthenticationError'
  }
}

/**
 * Thrown when an operation fails due to insufficient balance.
 * Bitfinex code: 10001 (insufficient balance).
 */
export class InsufficientFundsError extends BfxApiError {
  constructor (message: string, status: number, statusText: string, response?: unknown) {
    super(message, status, statusText, 10001, response)
    this.name = 'InsufficientFundsError'
  }
}

/**
 * Thrown when the requested resource is not found (HTTP 404).
 */
export class NotFoundError extends BfxApiError {
  constructor (message: string, statusText = 'Not Found', response?: unknown) {
    super(message, 404, statusText, undefined, response)
    this.name = 'NotFoundError'
  }
}

/** Known Bitfinex error codes that map to specific error classes */
const AUTH_CODES = new Set([10100, 10111, 10112, 10113, 10114])
const RATE_LIMIT_CODES = new Set([10010])
const INSUFFICIENT_FUNDS_CODES = new Set([10001])

/**
 * Creates the appropriate typed error from an API response.
 *
 * @param message - Error message from the API
 * @param status - HTTP status code
 * @param statusText - HTTP status text
 * @param code - Bitfinex error code (from response body)
 * @param response - Raw response body
 */
export function createApiError (
  message: string,
  status: number,
  statusText: string,
  code?: number | string,
  response?: unknown
): BfxApiError {
  const numCode = typeof code === 'number' ? code : undefined

  if (status === 429 || (numCode != null && RATE_LIMIT_CODES.has(numCode))) {
    return new RateLimitError(message, status, statusText, 60_000, response)
  }

  if (status === 401 || status === 403 || (numCode != null && AUTH_CODES.has(numCode))) {
    return new AuthenticationError(message, status, statusText, code, response)
  }

  if (numCode != null && INSUFFICIENT_FUNDS_CODES.has(numCode)) {
    return new InsufficientFundsError(message, status, statusText, response)
  }

  if (status === 404) {
    return new NotFoundError(message, statusText, response)
  }

  return new BfxApiError(message, status, statusText, code, response)
}
