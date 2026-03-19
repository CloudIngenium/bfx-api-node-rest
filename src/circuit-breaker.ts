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

import _debug from 'debug'

const debug = _debug('bfx:circuit-breaker')

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number
  /** Time in ms to keep circuit open before allowing retry (default: 60000) */
  resetTimeoutMs?: number
  /** Number of successful calls to close circuit from half-open (default: 2) */
  successThreshold?: number
  /** Name for logging and registry lookup */
  name?: string
}

export interface CircuitBreakerStats {
  state: CircuitState
  failureCount: number
  successCount: number
  lastFailureTime: number | null
  lastSuccessTime: number | null
  openedAt: number | null
  totalTrips: number
}

export class CircuitBreakerOpenError extends Error {
  readonly breakerName: string
  readonly timeUntilRetry: number

  constructor (breakerName: string, timeUntilRetry: number) {
    super(`CircuitBreaker [${breakerName}] is OPEN — request rejected (retry in ${Math.round(timeUntilRetry / 1000)}s)`)
    this.name = 'CircuitBreakerOpenError'
    this.breakerName = breakerName
    this.timeUntilRetry = timeUntilRetry
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private failureCount = 0
  private successCount = 0
  private lastFailureTime: number | null = null
  private lastSuccessTime: number | null = null
  private openedAt: number | null = null
  private totalTrips = 0

  private readonly failureThreshold: number
  private readonly resetTimeoutMs: number
  private readonly successThreshold: number
  readonly name: string

  constructor (config: CircuitBreakerConfig = {}) {
    this.failureThreshold = config.failureThreshold ?? 5
    this.resetTimeoutMs = config.resetTimeoutMs ?? 60_000
    this.successThreshold = config.successThreshold ?? 2
    this.name = config.name ?? 'default'

    debug('init [%s]: threshold=%d, timeout=%dms, successThreshold=%d',
      this.name, this.failureThreshold, this.resetTimeoutMs, this.successThreshold)
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitBreakerOpenError if circuit is open.
   */
  async execute<T> (fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitBreakerOpenError(this.name, this.getTimeUntilRetry())
    }

    try {
      const result = await fn()
      this.recordSuccess()
      return result
    } catch (error) {
      this.recordFailure(error as Error)
      throw error
    }
  }

  /**
   * Check if circuit allows requests.
   * Transitions OPEN → HALF_OPEN if reset timeout has elapsed.
   */
  canExecute (): boolean {
    switch (this.state) {
      case 'CLOSED':
        return true
      case 'OPEN':
        if (this.openedAt && Date.now() - this.openedAt >= this.resetTimeoutMs) {
          this.transitionTo('HALF_OPEN')
          return true
        }
        return false
      case 'HALF_OPEN':
        return true
      default:
        return false
    }
  }

  /** Record a successful call. */
  recordSuccess (): void {
    this.lastSuccessTime = Date.now()
    this.failureCount = 0

    if (this.state === 'HALF_OPEN') {
      this.successCount++
      if (this.successCount >= this.successThreshold) {
        this.transitionTo('CLOSED')
        debug('[%s] CLOSED after recovery (success=%d)', this.name, this.successCount)
      }
    }
  }

  /** Record a failed call. */
  recordFailure (error: Error): void {
    this.lastFailureTime = Date.now()
    this.failureCount++

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN')
      debug('[%s] re-OPENED after half-open failure: %s', this.name, error.message)
      return
    }

    if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      this.transitionTo('OPEN')
      this.totalTrips++
      debug('[%s] OPENED after %d failures: %s', this.name, this.failureCount, error.message)
    }
  }

  private transitionTo (newState: CircuitState): void {
    const oldState = this.state
    this.state = newState

    if (newState === 'OPEN') {
      this.openedAt = Date.now()
      this.successCount = 0
    } else if (newState === 'CLOSED') {
      this.openedAt = null
      this.failureCount = 0
      this.successCount = 0
    } else if (newState === 'HALF_OPEN') {
      this.successCount = 0
    }

    debug('[%s] %s → %s', this.name, oldState, newState)
  }

  /** Force circuit to close (manual recovery). */
  forceClose (): void {
    this.transitionTo('CLOSED')
  }

  /** Force circuit to open (maintenance). */
  forceOpen (): void {
    this.transitionTo('OPEN')
    this.totalTrips++
  }

  /** Get current statistics. */
  getStats (): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
      totalTrips: this.totalTrips
    }
  }

  /** Check if circuit is currently open. */
  isOpen (): boolean {
    if (this.state === 'OPEN' && this.canExecute()) {
      return false // Transitioned to HALF_OPEN
    }
    return this.state === 'OPEN'
  }

  /** Get time in ms until circuit can retry (0 if not open). */
  getTimeUntilRetry (): number {
    if (this.state !== 'OPEN' || !this.openedAt) return 0
    return Math.max(0, this.resetTimeoutMs - (Date.now() - this.openedAt))
  }
}

// --- Singleton registry ---

const registry = new Map<string, CircuitBreaker>()

/** Get or create a named circuit breaker instance. */
export function getCircuitBreaker (name: string, config?: CircuitBreakerConfig): CircuitBreaker {
  if (!registry.has(name)) {
    registry.set(name, new CircuitBreaker({ ...config, name }))
  }
  return registry.get(name)!
}

/** Get stats for all registered circuit breakers. */
export function getAllCircuitBreakerStats (): Record<string, CircuitBreakerStats> {
  const stats: Record<string, CircuitBreakerStats> = {}
  for (const [name, breaker] of registry) {
    stats[name] = breaker.getStats()
  }
  return stats
}

// --- Utility functions (consolidated from mcp-core) ---

/** Exponential backoff with jitter: min(base * 2^attempt + random(0..base), 30s). */
export function backoffMs (attempt: number, baseMs = 1000): number {
  return Math.min(baseMs * Math.pow(2, attempt) + Math.random() * baseMs, 30_000)
}

/** HTTP status codes that should trigger a retry. */
export function isRetryableStatus (status: number): boolean {
  return status === 429 || status === 503 || status === 504
}
