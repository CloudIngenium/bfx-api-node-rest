/**
 * Sliding-window rate limiter for Bitfinex REST API.
 *
 * Bitfinex allows 90 requests per minute on authenticated endpoints.
 * This implementation tracks timestamps in a sliding window for accuracy.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter(85, 60_000) // 85 req/min (5% safety margin)
 * await limiter.acquire()
 * await rest.submitOrder(order)
 * ```
 */
export interface RateLimiterOptions {
    /** Maximum requests allowed in the time window */
    maxRequests: number;
    /** Time window in milliseconds (default: 60_000) */
    windowMs?: number;
    /** Minimum delay between requests in milliseconds (default: 0 — no min delay) */
    minDelayMs?: number;
    /** Identifier for logging */
    name?: string;
}
export declare class RateLimiter {
    private readonly maxRequests;
    private readonly windowMs;
    private readonly minDelayMs;
    private readonly name;
    private requests;
    private lastRequestTime;
    constructor(options: RateLimiterOptions | number, windowMs?: number, name?: string);
    /**
     * Wait until a request slot is available, then record the request.
     */
    acquire(): Promise<void>;
    /**
     * Wrap an async function with rate limiting.
     */
    throttle<T>(fn: () => Promise<T>): Promise<T>;
    /**
     * Get current usage statistics.
     */
    getStats(): {
        current: number;
        max: number;
        available: number;
        percentage: number;
    };
    /**
     * Clear all tracked requests.
     */
    reset(): void;
    private cleanup;
}
/**
 * Pre-configured rate limiter for Bitfinex authenticated REST endpoints.
 * Uses 85 req/min (5% safety margin below the 90 req/min limit).
 */
export declare function createBitfinexRateLimiter(name?: string): RateLimiter;
