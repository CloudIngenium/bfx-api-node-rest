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
export declare class BfxApiError extends Error {
    /** HTTP status code (e.g. 400, 429, 500) */
    status: number;
    /** HTTP status text (e.g. "Bad Request") */
    statusText: string;
    /** Bitfinex API error code (e.g. 10010, 10114) */
    code: number | string | undefined;
    /** Raw response body */
    response: unknown;
    constructor(message: string, status: number, statusText: string, code?: number | string, response?: unknown);
}
/**
 * Thrown when the API returns HTTP 429 or error code 10010 (ERR_RATE_LIMIT).
 */
export declare class RateLimitError extends BfxApiError {
    /** Suggested wait time in milliseconds before retrying */
    retryAfterMs: number;
    constructor(message: string, status: number, statusText: string, retryAfterMs?: number, response?: unknown);
}
/**
 * Thrown when authentication fails (invalid API key, expired token, bad signature).
 * Bitfinex codes: 10100 (apikey: invalid), 10111 (bad auth), 10114 (nonce too small).
 */
export declare class AuthenticationError extends BfxApiError {
    constructor(message: string, status: number, statusText: string, code?: number | string, response?: unknown);
}
/**
 * Thrown when an operation fails due to insufficient balance.
 * Bitfinex code: 10001 (insufficient balance).
 */
export declare class InsufficientFundsError extends BfxApiError {
    constructor(message: string, status: number, statusText: string, response?: unknown);
}
/**
 * Thrown when the requested resource is not found (HTTP 404).
 */
export declare class NotFoundError extends BfxApiError {
    constructor(message: string, statusText?: string, response?: unknown);
}
/**
 * Creates the appropriate typed error from an API response.
 *
 * @param message - Error message from the API
 * @param status - HTTP status code
 * @param statusText - HTTP status text
 * @param code - Bitfinex error code (from response body)
 * @param response - Raw response body
 */
export declare function createApiError(message: string, status: number, statusText: string, code?: number | string, response?: unknown): BfxApiError;
