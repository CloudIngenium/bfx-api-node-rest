import assert from 'assert'
import {
  retryWithBackoff,
  abortableSleep,
  isRetryable,
  getBackoffDelay,
  RateLimitError,
  AuthenticationError,
  BfxApiError
} from '../../dist/index.js'

describe('retryWithBackoff', () => {
  it('returns result on first success', async () => {
    const result = await retryWithBackoff(async () => 42, { maxAttempts: 3 })
    assert.strictEqual(result, 42)
  })

  it('retries on retryable error and succeeds', async () => {
    let calls = 0
    const result = await retryWithBackoff(
      async () => {
        calls++
        if (calls < 3) throw new RateLimitError('rate limit', 429, 'Too Many Requests', 10)
        return 'ok'
      },
      { maxAttempts: 5, baseDelayMs: 10 }
    )
    assert.strictEqual(result, 'ok')
    assert.strictEqual(calls, 3)
  })

  it('throws after max attempts', async () => {
    await assert.rejects(
      () => retryWithBackoff(
        async () => { throw new RateLimitError('rate limit', 429, 'Too Many Requests', 10) },
        { maxAttempts: 2, baseDelayMs: 10 }
      ),
      { name: 'RateLimitError' }
    )
  })

  it('supports legacy positional arguments', async () => {
    const result = await retryWithBackoff(async () => 'legacy', 3, 10)
    assert.strictEqual(result, 'legacy')
  })

  it('respects AbortSignal', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 20)
    await assert.rejects(
      () => retryWithBackoff(
        async () => { throw new Error('ECONNRESET') },
        { maxAttempts: 10, baseDelayMs: 100, signal: controller.signal }
      ),
      { message: 'Aborted' }
    )
  })

  it('throws AuthenticationError on bad credentials', async () => {
    let calls = 0
    await assert.rejects(
      () => retryWithBackoff(
        async () => {
          calls++
          throw new AuthenticationError('bad key', 401, 'Unauthorized', 10100)
        },
        { maxAttempts: 3, baseDelayMs: 10 }
      ),
      { name: 'AuthenticationError' }
    )
    assert.strictEqual(calls, 3)
  })
})

describe('abortableSleep', () => {
  it('resolves after delay', async () => {
    const start = Date.now()
    await abortableSleep(30)
    assert.ok(Date.now() - start >= 25)
  })

  it('rejects on abort', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 10)
    await assert.rejects(
      () => abortableSleep(5000, controller.signal),
      { message: 'Aborted' }
    )
  })

  it('rejects immediately if already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      () => abortableSleep(100, controller.signal),
      { message: 'Aborted' }
    )
  })
})

describe('isRetryable', () => {
  it('returns true for RateLimitError', () => {
    assert.ok(isRetryable(new RateLimitError('limit', 429, 'TooMany')))
  })

  it('returns true for nonce AuthenticationError (10114)', () => {
    assert.ok(isRetryable(new AuthenticationError('nonce', 401, 'Unauthorized', 10114)))
  })

  it('returns false for bad-key AuthenticationError (10100)', () => {
    assert.ok(!isRetryable(new AuthenticationError('bad key', 401, 'Unauthorized', 10100)))
  })

  it('returns true for server errors (5xx)', () => {
    assert.ok(isRetryable(new BfxApiError('server error', 500, 'Internal')))
  })

  it('returns false for client errors (4xx)', () => {
    assert.ok(!isRetryable(new BfxApiError('bad request', 400, 'Bad Request')))
  })

  it('returns true for network error strings', () => {
    assert.ok(isRetryable(new Error('ECONNRESET')))
    assert.ok(isRetryable(new Error('ETIMEDOUT')))
    assert.ok(isRetryable(new Error('fetch failed')))
  })

  it('returns false for generic errors', () => {
    assert.ok(!isRetryable(new Error('something else')))
  })
})

describe('getBackoffDelay', () => {
  it('uses retryAfterMs for RateLimitError', () => {
    const err = new RateLimitError('limit', 429, 'TooMany', 30000)
    const delay = getBackoffDelay(err, 0, 1000, 300000)
    assert.strictEqual(delay, 30000)
  })

  it('uses short delay for nonce errors', () => {
    const delay = getBackoffDelay(new Error('nonce too small'), 0, 1000, 300000)
    assert.strictEqual(delay, 1000)
  })

  it('uses linear backoff for network errors', () => {
    const d0 = getBackoffDelay(new Error('ECONNRESET'), 0, 1000, 300000)
    const d1 = getBackoffDelay(new Error('ECONNRESET'), 1, 1000, 300000)
    assert.strictEqual(d0, 1000)
    assert.strictEqual(d1, 2000)
  })

  it('caps at maxDelayMs', () => {
    const delay = getBackoffDelay(new Error('something'), 20, 1000, 5000)
    assert.ok(delay <= 6000, `Expected <= 6000 (5000 + 1000 jitter), got ${delay}`)
  })
})
