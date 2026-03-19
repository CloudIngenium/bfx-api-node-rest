import assert from 'assert'
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  getCircuitBreaker,
  getAllCircuitBreakerStats,
  backoffMs,
  isRetryableStatus
} from '../../dist/index.js'

describe('CircuitBreaker', () => {
  describe('CLOSED state (normal)', () => {
    it('allows requests when closed', async () => {
      const cb = new CircuitBreaker({ name: 'test-closed' })
      const result = await cb.execute(async () => 42)
      assert.strictEqual(result, 42)
      assert.strictEqual(cb.getStats().state, 'CLOSED')
    })

    it('propagates errors', async () => {
      const cb = new CircuitBreaker({ name: 'test-propagate' })
      await assert.rejects(
        () => cb.execute(async () => { throw new Error('boom') }),
        { message: 'boom' }
      )
    })

    it('opens after failure threshold', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, name: 'test-threshold' })
      for (let i = 0; i < 3; i++) {
        cb.recordFailure(new Error('fail'))
      }
      assert.strictEqual(cb.getStats().state, 'OPEN')
      assert.strictEqual(cb.getStats().totalTrips, 1)
    })

    it('resets failure count on success', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, name: 'test-reset' })
      cb.recordFailure(new Error('fail'))
      cb.recordFailure(new Error('fail'))
      cb.recordSuccess()
      assert.strictEqual(cb.getStats().failureCount, 0)
      assert.strictEqual(cb.getStats().state, 'CLOSED')
    })
  })

  describe('OPEN state', () => {
    it('rejects requests when open', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, name: 'test-open' })
      cb.recordFailure(new Error('fail'))
      assert.strictEqual(cb.isOpen(), true)

      await assert.rejects(
        () => cb.execute(async () => 42),
        (err: Error) => {
          assert.ok(err instanceof CircuitBreakerOpenError)
          assert.strictEqual((err as CircuitBreakerOpenError).breakerName, 'test-open')
          return true
        }
      )
    })

    it('reports time until retry', () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 5000,
        name: 'test-retry-time'
      })
      cb.recordFailure(new Error('fail'))
      const time = cb.getTimeUntilRetry()
      assert.ok(time > 4000 && time <= 5000, `Expected ~5000ms, got ${time}ms`)
    })

    it('transitions to HALF_OPEN after timeout', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 10, // 10ms timeout
        name: 'test-half-open'
      })
      cb.recordFailure(new Error('fail'))
      assert.strictEqual(cb.getStats().state, 'OPEN')

      await new Promise(r => setTimeout(r, 20))
      assert.ok(cb.canExecute())
      assert.strictEqual(cb.getStats().state, 'HALF_OPEN')
    })
  })

  describe('HALF_OPEN state', () => {
    it('closes after success threshold', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 10,
        successThreshold: 2,
        name: 'test-recovery'
      })
      cb.recordFailure(new Error('fail'))
      await new Promise(r => setTimeout(r, 20))
      cb.canExecute() // triggers HALF_OPEN

      cb.recordSuccess()
      assert.strictEqual(cb.getStats().state, 'HALF_OPEN')
      cb.recordSuccess()
      assert.strictEqual(cb.getStats().state, 'CLOSED')
    })

    it('re-opens on failure', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 10,
        name: 'test-reopen'
      })
      cb.recordFailure(new Error('fail'))
      await new Promise(r => setTimeout(r, 20))
      cb.canExecute()

      cb.recordFailure(new Error('fail again'))
      assert.strictEqual(cb.getStats().state, 'OPEN')
    })
  })

  describe('manual controls', () => {
    it('forceClose resets state', () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, name: 'test-force-close' })
      cb.recordFailure(new Error('fail'))
      assert.strictEqual(cb.getStats().state, 'OPEN')
      cb.forceClose()
      assert.strictEqual(cb.getStats().state, 'CLOSED')
      assert.strictEqual(cb.getStats().failureCount, 0)
    })

    it('forceOpen trips circuit', () => {
      const cb = new CircuitBreaker({ name: 'test-force-open' })
      cb.forceOpen()
      assert.strictEqual(cb.getStats().state, 'OPEN')
      assert.strictEqual(cb.getStats().totalTrips, 1)
    })
  })

  describe('getStats', () => {
    it('returns complete stats', () => {
      const cb = new CircuitBreaker({ name: 'test-stats' })
      const stats = cb.getStats()
      assert.strictEqual(stats.state, 'CLOSED')
      assert.strictEqual(stats.failureCount, 0)
      assert.strictEqual(stats.successCount, 0)
      assert.strictEqual(stats.lastFailureTime, null)
      assert.strictEqual(stats.lastSuccessTime, null)
      assert.strictEqual(stats.openedAt, null)
      assert.strictEqual(stats.totalTrips, 0)
    })
  })
})

describe('getCircuitBreaker (singleton registry)', () => {
  it('returns same instance for same name', () => {
    const a = getCircuitBreaker('singleton-test')
    const b = getCircuitBreaker('singleton-test')
    assert.strictEqual(a, b)
  })

  it('returns different instances for different names', () => {
    const a = getCircuitBreaker('reg-a')
    const b = getCircuitBreaker('reg-b')
    assert.notStrictEqual(a, b)
  })
})

describe('getAllCircuitBreakerStats', () => {
  it('returns stats for all registered breakers', () => {
    getCircuitBreaker('stats-a')
    getCircuitBreaker('stats-b')
    const all = getAllCircuitBreakerStats()
    assert.ok('stats-a' in all)
    assert.ok('stats-b' in all)
  })
})

describe('backoffMs', () => {
  it('returns exponential values with jitter', () => {
    const d0 = backoffMs(0, 1000)
    assert.ok(d0 >= 1000 && d0 <= 2000, `Expected 1000-2000, got ${d0}`)

    const d3 = backoffMs(3, 1000)
    assert.ok(d3 >= 8000 && d3 <= 9000, `Expected 8000-9000, got ${d3}`)
  })

  it('caps at 30 seconds', () => {
    const d = backoffMs(20, 1000)
    assert.ok(d <= 30000, `Expected <= 30000, got ${d}`)
  })
})

describe('isRetryableStatus', () => {
  it('returns true for 429, 503, 504', () => {
    assert.ok(isRetryableStatus(429))
    assert.ok(isRetryableStatus(503))
    assert.ok(isRetryableStatus(504))
  })

  it('returns false for other codes', () => {
    assert.ok(!isRetryableStatus(200))
    assert.ok(!isRetryableStatus(400))
    assert.ok(!isRetryableStatus(401))
    assert.ok(!isRetryableStatus(500))
  })
})
