import assert from 'assert'
import {
  BfxApiError,
  RateLimitError,
  fetchResponse,
  fetchJson
} from '../../dist/index.js'

const ORIGINAL_FETCH = globalThis.fetch

describe('fetchJson', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
  })

  it('returns parsed JSON and the raw response', async () => {
    globalThis.fetch = async (_input, init) => {
      const headers = new Headers(init?.headers)
      assert.strictEqual(headers.get('Accept'), 'application/json')

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const result = await fetchJson<{ ok: boolean }>('https://example.com')

    assert.deepStrictEqual(result.data, { ok: true })
    assert.strictEqual(result.response.status, 200)
  })

  it('returns the raw response while composing timeout and caller signal', async () => {
    const controller = new AbortController()

    globalThis.fetch = async (_input, init) => {
      const headers = new Headers(init?.headers)
      assert.strictEqual(headers.get('Accept'), 'text/plain')
      assert.ok(init?.signal instanceof AbortSignal)
      assert.notStrictEqual(init?.signal, controller.signal)

      return new Response('plain text', {
        status: 202,
        headers: { 'Content-Type': 'text/plain' }
      })
    }

    const response = await fetchResponse('https://example.com', {
      headers: { Accept: 'text/plain' },
      signal: controller.signal
    })

    assert.strictEqual(response.status, 202)
    assert.strictEqual(await response.text(), 'plain text')
  })

  it('preserves a custom Accept header and combines the caller signal', async () => {
    const controller = new AbortController()

    globalThis.fetch = async (_input, init) => {
      const headers = new Headers(init?.headers)
      assert.strictEqual(headers.get('Accept'), 'application/vnd.test+json')
      assert.ok(init?.signal instanceof AbortSignal)
      assert.notStrictEqual(init?.signal, controller.signal)

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const result = await fetchJson<{ ok: boolean }>('https://example.com', {
      headers: { Accept: 'application/vnd.test+json' },
      signal: controller.signal
    })

    assert.deepStrictEqual(result.data, { ok: true })
  })

  it('returns null data for 204 responses', async () => {
    globalThis.fetch = async () => new Response(null, {
      status: 204,
      statusText: 'No Content'
    })

    const result = await fetchJson<null>('https://example.com')

    assert.strictEqual(result.data, null)
    assert.strictEqual(result.response.status, 204)
  })

  it('throws a typed rate limit error when the payload includes a known code', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify(['error', 10010, 'ERR_RATE_LIMIT']), {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'Content-Type': 'application/json' }
    })

    await assert.rejects(
      () => fetchJson('https://example.com'),
      (error: unknown) => {
        assert.ok(error instanceof RateLimitError)
        assert.strictEqual(error.message, 'ERR_RATE_LIMIT')
        return true
      }
    )
  })

  it('throws BfxApiError when a successful response is not JSON', async () => {
    globalThis.fetch = async () => new Response('plain text', {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'text/plain' }
    })

    await assert.rejects(
      () => fetchJson('https://example.com'),
      (error: unknown) => {
        assert.ok(error instanceof BfxApiError)
        assert.match((error as BfxApiError).message, /Expected JSON response/)
        return true
      }
    )
  })

  it('allows JSON parsing when content-type validation is disabled', async () => {
    globalThis.fetch = async () => new Response('{"ok":true}', {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'text/plain' }
    })

    const result = await fetchJson<{ ok: boolean }>('https://example.com', {
      requireJsonContentType: false
    })

    assert.deepStrictEqual(result.data, { ok: true })
  })

  it('preserves text payloads on non-OK responses', async () => {
    globalThis.fetch = async () => new Response('Bad Gateway', {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'Content-Type': 'text/plain' }
    })

    await assert.rejects(
      () => fetchJson('https://example.com'),
      (error: unknown) => {
        assert.ok(error instanceof BfxApiError)
        assert.strictEqual((error as BfxApiError).status, 502)
        assert.strictEqual((error as BfxApiError).response, 'Bad Gateway')
        return true
      }
    )
  })

  it('uses object payload message and code for non-OK JSON responses', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      code: 1234,
      message: 'Structured failure'
    }), {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'Content-Type': 'application/json' }
    })

    await assert.rejects(
      () => fetchJson('https://example.com'),
      (error: unknown) => {
        assert.ok(error instanceof BfxApiError)
        assert.strictEqual((error as BfxApiError).message, 'Structured failure')
        assert.strictEqual((error as BfxApiError).code, 1234)
        return true
      }
    )
  })

  it('falls back to object error when message is missing', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      error: 'Structured error field'
    }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' }
    })

    await assert.rejects(
      () => fetchJson('https://example.com'),
      (error: unknown) => {
        assert.ok(error instanceof BfxApiError)
        assert.strictEqual((error as BfxApiError).message, 'Structured error field')
        return true
      }
    )
  })

  it('falls back to the HTTP status message when JSON parsing fails', async () => {
    globalThis.fetch = async () => new Response('{not-json', {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'application/json' }
    })

    await assert.rejects(
      () => fetchJson('https://example.com'),
      (error: unknown) => {
        assert.ok(error instanceof BfxApiError)
        assert.strictEqual((error as BfxApiError).message, 'HTTP 500 Internal Server Error')
        return true
      }
    )
  })
})