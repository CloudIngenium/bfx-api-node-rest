import assert from 'assert'
import { RateLimiter, createBitfinexRateLimiter } from '../../dist/index.js'

describe('RateLimiter', () => {
  describe('constructor', () => {
    it('accepts numeric arguments', () => {
      const limiter = new RateLimiter(10, 1000, 'test')
      const stats = limiter.getStats()
      assert.strictEqual(stats.max, 10)
      assert.strictEqual(stats.current, 0)
      assert.strictEqual(stats.available, 10)
    })

    it('accepts options object', () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 500, name: 'opts' })
      assert.strictEqual(limiter.getStats().max, 5)
    })

    it('uses defaults for optional fields', () => {
      const limiter = new RateLimiter({ maxRequests: 10 })
      assert.strictEqual(limiter.getStats().max, 10)
    })
  })

  describe('acquire', () => {
    it('permits requests within limit', async () => {
      const limiter = new RateLimiter(3, 1000)
      await limiter.acquire()
      await limiter.acquire()
      await limiter.acquire()
      const stats = limiter.getStats()
      assert.strictEqual(stats.current, 3)
      assert.strictEqual(stats.available, 0)
    })

    it('waits when limit is reached', async () => {
      const limiter = new RateLimiter(1, 50) // 1 req per 50ms
      await limiter.acquire()
      const start = Date.now()
      await limiter.acquire() // Should wait ~50ms for window to clear
      const elapsed = Date.now() - start
      assert.ok(elapsed >= 40, `Expected >=40ms wait, got ${elapsed}ms`)
    })
  })

  describe('throttle', () => {
    it('wraps a function with rate limiting', async () => {
      const limiter = new RateLimiter(10, 1000)
      const result = await limiter.throttle(async () => 42)
      assert.strictEqual(result, 42)
      assert.strictEqual(limiter.getStats().current, 1)
    })

    it('propagates errors', async () => {
      const limiter = new RateLimiter(10, 1000)
      await assert.rejects(
        () => limiter.throttle(async () => { throw new Error('boom') }),
        { message: 'boom' }
      )
    })
  })

  describe('getStats', () => {
    it('reports correct percentage', async () => {
      const limiter = new RateLimiter(4, 60000)
      await limiter.acquire()
      const stats = limiter.getStats()
      assert.strictEqual(stats.percentage, 25)
    })
  })

  describe('reset', () => {
    it('clears all tracked requests', async () => {
      const limiter = new RateLimiter(10, 60000)
      await limiter.acquire()
      await limiter.acquire()
      assert.strictEqual(limiter.getStats().current, 2)
      limiter.reset()
      assert.strictEqual(limiter.getStats().current, 0)
    })
  })

  describe('minDelayMs', () => {
    it('enforces minimum delay between requests', async () => {
      const limiter = new RateLimiter({ maxRequests: 100, windowMs: 60000, minDelayMs: 30 })
      await limiter.acquire()
      const start = Date.now()
      await limiter.acquire()
      const elapsed = Date.now() - start
      assert.ok(elapsed >= 25, `Expected >=25ms delay, got ${elapsed}ms`)
    })
  })
})

describe('createBitfinexRateLimiter', () => {
  it('creates a limiter with 85 req/min', () => {
    const limiter = createBitfinexRateLimiter()
    assert.strictEqual(limiter.getStats().max, 85)
  })

  it('accepts a custom name', () => {
    const limiter = createBitfinexRateLimiter('custom')
    assert.ok(limiter)
  })
})
