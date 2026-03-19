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

import _debug from 'debug'

const debug = _debug('bfx:rate-limiter')

export interface RateLimiterOptions {
  /** Maximum requests allowed in the time window */
  maxRequests: number
  /** Time window in milliseconds (default: 60_000) */
  windowMs?: number
  /** Minimum delay between requests in milliseconds (default: 0 — no min delay) */
  minDelayMs?: number
  /** Identifier for logging */
  name?: string
}

export class RateLimiter {
  private readonly maxRequests: number
  private readonly windowMs: number
  private readonly minDelayMs: number
  private readonly name: string
  private requests: number[] = []
  private lastRequestTime = 0

  constructor (options: RateLimiterOptions | number, windowMs = 60_000, name = 'default') {
    if (typeof options === 'number') {
      this.maxRequests = options
      this.windowMs = windowMs
      this.minDelayMs = 0
      this.name = name
    } else {
      this.maxRequests = options.maxRequests
      this.windowMs = options.windowMs ?? 60_000
      this.minDelayMs = options.minDelayMs ?? 0
      this.name = options.name ?? 'default'
    }

    debug('init [%s]: %d req/%dms, minDelay=%dms', this.name, this.maxRequests, this.windowMs, this.minDelayMs)
  }

  /**
   * Wait until a request slot is available, then record the request.
   */
  async acquire (): Promise<void> {
    this.cleanup()

    // Wait for window slot
    if (this.requests.length >= this.maxRequests) {
      const oldest = this.requests[0]
      const waitTime = oldest + this.windowMs - Date.now()
      if (waitTime > 0) {
        debug('throttle [%s]: limit reached, waiting %dms', this.name, waitTime)
        await sleep(waitTime)
        this.cleanup()
      }
    }

    // Enforce minimum delay
    if (this.minDelayMs > 0) {
      const elapsed = Date.now() - this.lastRequestTime
      if (elapsed < this.minDelayMs) {
        await sleep(this.minDelayMs - elapsed)
      }
    }

    const now = Date.now()
    this.requests.push(now)
    this.lastRequestTime = now
    debug('acquire [%s]: %d/%d', this.name, this.requests.length, this.maxRequests)
  }

  /**
   * Wrap an async function with rate limiting.
   */
  async throttle<T> (fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    return fn()
  }

  /**
   * Get current usage statistics.
   */
  getStats (): { current: number, max: number, available: number, percentage: number } {
    this.cleanup()
    const current = this.requests.length
    return {
      current,
      max: this.maxRequests,
      available: this.maxRequests - current,
      percentage: (current / this.maxRequests) * 100
    }
  }

  /**
   * Clear all tracked requests.
   */
  reset (): void {
    this.requests = []
    this.lastRequestTime = 0
  }

  private cleanup (): void {
    const cutoff = Date.now() - this.windowMs
    this.requests = this.requests.filter(t => t > cutoff)
  }
}

/**
 * Pre-configured rate limiter for Bitfinex authenticated REST endpoints.
 * Uses 85 req/min (5% safety margin below the 90 req/min limit).
 */
export function createBitfinexRateLimiter (name = 'bitfinex-rest'): RateLimiter {
  return new RateLimiter({ maxRequests: 85, windowMs: 60_000, name })
}

function sleep (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
