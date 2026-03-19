/**
 * Circuit Breaker pattern for REST API calls.
 *
 * Prevents repeated calls to failing endpoints. Opens circuit after
 * consecutive failures, then allows limited retry after a cooldown.
 *
 * States:
 * - CLOSED:    Normal operation, requests flow through
 * - OPEN:      Circuit tripped, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({ name: 'bitfinex-rest' })
 * const result = await breaker.execute(() => rest.submitOrder(order))
 * ```
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export interface CircuitBreakerConfig {
    /** Number of failures before opening circuit (default: 5) */
    failureThreshold?: number;
    /** Time in ms to keep circuit open before allowing retry (default: 60000) */
    resetTimeoutMs?: number;
    /** Number of successful calls to close circuit from half-open (default: 2) */
    successThreshold?: number;
    /** Name for logging and registry lookup */
    name?: string;
}
export interface CircuitBreakerStats {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number | null;
    lastSuccessTime: number | null;
    openedAt: number | null;
    totalTrips: number;
}
export declare class CircuitBreakerOpenError extends Error {
    readonly breakerName: string;
    readonly timeUntilRetry: number;
    constructor(breakerName: string, timeUntilRetry: number);
}
export declare class CircuitBreaker {
    private state;
    private failureCount;
    private successCount;
    private lastFailureTime;
    private lastSuccessTime;
    private openedAt;
    private totalTrips;
    private readonly failureThreshold;
    private readonly resetTimeoutMs;
    private readonly successThreshold;
    readonly name: string;
    constructor(config?: CircuitBreakerConfig);
    /**
     * Execute a function through the circuit breaker.
     * Throws CircuitBreakerOpenError if circuit is open.
     */
    execute<T>(fn: () => Promise<T>): Promise<T>;
    /**
     * Check if circuit allows requests.
     * Transitions OPEN → HALF_OPEN if reset timeout has elapsed.
     */
    canExecute(): boolean;
    /** Record a successful call. */
    recordSuccess(): void;
    /** Record a failed call. */
    recordFailure(error: Error): void;
    private transitionTo;
    /** Force circuit to close (manual recovery). */
    forceClose(): void;
    /** Force circuit to open (maintenance). */
    forceOpen(): void;
    /** Get current statistics. */
    getStats(): CircuitBreakerStats;
    /** Check if circuit is currently open. */
    isOpen(): boolean;
    /** Get time in ms until circuit can retry (0 if not open). */
    getTimeUntilRetry(): number;
}
/** Get or create a named circuit breaker instance. */
export declare function getCircuitBreaker(name: string, config?: CircuitBreakerConfig): CircuitBreaker;
/** Get stats for all registered circuit breakers. */
export declare function getAllCircuitBreakerStats(): Record<string, CircuitBreakerStats>;
/** Exponential backoff with jitter: min(base * 2^attempt + random(0..base), 30s). */
export declare function backoffMs(attempt: number, baseMs?: number): number;
/** HTTP status codes that should trigger a retry. */
export declare function isRetryableStatus(status: number): boolean;
