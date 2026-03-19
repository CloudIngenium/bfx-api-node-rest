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
import _debug from 'debug';
const debug = _debug('bfx:circuit-breaker');
export class CircuitBreakerOpenError extends Error {
    breakerName;
    timeUntilRetry;
    constructor(breakerName, timeUntilRetry) {
        super(`CircuitBreaker [${breakerName}] is OPEN — request rejected (retry in ${Math.round(timeUntilRetry / 1000)}s)`);
        this.name = 'CircuitBreakerOpenError';
        this.breakerName = breakerName;
        this.timeUntilRetry = timeUntilRetry;
    }
}
export class CircuitBreaker {
    state = 'CLOSED';
    failureCount = 0;
    successCount = 0;
    lastFailureTime = null;
    lastSuccessTime = null;
    openedAt = null;
    totalTrips = 0;
    failureThreshold;
    resetTimeoutMs;
    successThreshold;
    name;
    constructor(config = {}) {
        this.failureThreshold = config.failureThreshold ?? 5;
        this.resetTimeoutMs = config.resetTimeoutMs ?? 60_000;
        this.successThreshold = config.successThreshold ?? 2;
        this.name = config.name ?? 'default';
        debug('init [%s]: threshold=%d, timeout=%dms, successThreshold=%d', this.name, this.failureThreshold, this.resetTimeoutMs, this.successThreshold);
    }
    /**
     * Execute a function through the circuit breaker.
     * Throws CircuitBreakerOpenError if circuit is open.
     */
    async execute(fn) {
        if (!this.canExecute()) {
            throw new CircuitBreakerOpenError(this.name, this.getTimeUntilRetry());
        }
        try {
            const result = await fn();
            this.recordSuccess();
            return result;
        }
        catch (error) {
            this.recordFailure(error);
            throw error;
        }
    }
    /**
     * Check if circuit allows requests.
     * Transitions OPEN → HALF_OPEN if reset timeout has elapsed.
     */
    canExecute() {
        switch (this.state) {
            case 'CLOSED':
                return true;
            case 'OPEN':
                if (this.openedAt && Date.now() - this.openedAt >= this.resetTimeoutMs) {
                    this.transitionTo('HALF_OPEN');
                    return true;
                }
                return false;
            case 'HALF_OPEN':
                return true;
            default:
                return false;
        }
    }
    /** Record a successful call. */
    recordSuccess() {
        this.lastSuccessTime = Date.now();
        this.failureCount = 0;
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= this.successThreshold) {
                this.transitionTo('CLOSED');
                debug('[%s] CLOSED after recovery (success=%d)', this.name, this.successCount);
            }
        }
    }
    /** Record a failed call. */
    recordFailure(error) {
        this.lastFailureTime = Date.now();
        this.failureCount++;
        if (this.state === 'HALF_OPEN') {
            this.transitionTo('OPEN');
            debug('[%s] re-OPENED after half-open failure: %s', this.name, error.message);
            return;
        }
        if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
            this.transitionTo('OPEN');
            this.totalTrips++;
            debug('[%s] OPENED after %d failures: %s', this.name, this.failureCount, error.message);
        }
    }
    transitionTo(newState) {
        const oldState = this.state;
        this.state = newState;
        if (newState === 'OPEN') {
            this.openedAt = Date.now();
            this.successCount = 0;
        }
        else if (newState === 'CLOSED') {
            this.openedAt = null;
            this.failureCount = 0;
            this.successCount = 0;
        }
        else if (newState === 'HALF_OPEN') {
            this.successCount = 0;
        }
        debug('[%s] %s → %s', this.name, oldState, newState);
    }
    /** Force circuit to close (manual recovery). */
    forceClose() {
        this.transitionTo('CLOSED');
    }
    /** Force circuit to open (maintenance). */
    forceOpen() {
        this.transitionTo('OPEN');
        this.totalTrips++;
    }
    /** Get current statistics. */
    getStats() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            openedAt: this.openedAt,
            totalTrips: this.totalTrips
        };
    }
    /** Check if circuit is currently open. */
    isOpen() {
        if (this.state === 'OPEN' && this.canExecute()) {
            return false; // Transitioned to HALF_OPEN
        }
        return this.state === 'OPEN';
    }
    /** Get time in ms until circuit can retry (0 if not open). */
    getTimeUntilRetry() {
        if (this.state !== 'OPEN' || !this.openedAt)
            return 0;
        return Math.max(0, this.resetTimeoutMs - (Date.now() - this.openedAt));
    }
}
// --- Singleton registry ---
const registry = new Map();
/** Get or create a named circuit breaker instance. */
export function getCircuitBreaker(name, config) {
    if (!registry.has(name)) {
        registry.set(name, new CircuitBreaker({ ...config, name }));
    }
    return registry.get(name);
}
/** Get stats for all registered circuit breakers. */
export function getAllCircuitBreakerStats() {
    const stats = {};
    for (const [name, breaker] of registry) {
        stats[name] = breaker.getStats();
    }
    return stats;
}
// --- Utility functions (consolidated from mcp-core) ---
/** Exponential backoff with jitter: min(base * 2^attempt + random(0..base), 30s). */
export function backoffMs(attempt, baseMs = 1000) {
    return Math.min(baseMs * Math.pow(2, attempt) + Math.random() * baseMs, 30_000);
}
/** HTTP status codes that should trigger a retry. */
export function isRetryableStatus(status) {
    return status === 429 || status === 503 || status === 504;
}
//# sourceMappingURL=circuit-breaker.js.map