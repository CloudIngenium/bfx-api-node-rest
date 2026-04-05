import { BfxApiError, createApiError } from './errors.js'

export interface FetchResponseOptions extends Omit<RequestInit, 'headers' | 'signal'> {
  headers?: HeadersInit
  signal?: AbortSignal
  timeoutMs?: number
}

export interface FetchJsonOptions extends FetchResponseOptions {
  requireJsonContentType?: boolean
}

export interface FetchJsonResult<T> {
  response: Response
  data: T
}

function buildSignal (signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  if (signal) {
    return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
  }

  return AbortSignal.timeout(timeoutMs)
}

/**
 * Fetches a raw response with a default timeout and signal composition.
 */
export async function fetchResponse (
  input: string | URL,
  options: FetchResponseOptions = {}
): Promise<Response> {
  const {
    headers,
    signal,
    timeoutMs = 10_000,
    ...requestInit
  } = options

  return fetch(input, {
    ...requestInit,
    headers,
    signal: buildSignal(signal, timeoutMs)
  })
}

async function readResponseBody (response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('json')) {
    try {
      return await response.json()
    } catch {
      return undefined
    }
  }

  try {
    return await response.text()
  } catch {
    return undefined
  }
}

function getErrorCode (payload: unknown): number | string | undefined {
  if (Array.isArray(payload) && payload.length > 1) {
    const code = payload[1]
    if (typeof code === 'number' || typeof code === 'string') {
      return code
    }
  }

  if (payload && typeof payload === 'object') {
    const code = (payload as Record<string, unknown>).code
    if (typeof code === 'number' || typeof code === 'string') {
      return code
    }
  }

  return undefined
}

function getErrorMessage (payload: unknown, status: number, statusText: string): string {
  if (Array.isArray(payload) && payload.length > 2 && typeof payload[2] === 'string') {
    return payload[2]
  }

  if (payload && typeof payload === 'object') {
    const message = (payload as Record<string, unknown>).message
    if (typeof message === 'string' && message.length > 0) {
      return message
    }

    const error = (payload as Record<string, unknown>).error
    if (typeof error === 'string' && error.length > 0) {
      return error
    }
  }

  if (typeof payload === 'string' && payload.length > 0) {
    return payload
  }

  return `HTTP ${status} ${statusText}`.trim()
}

/**
 * Fetches JSON with a default timeout and typed HTTP error handling.
 */
export async function fetchJson<T> (
  input: string | URL,
  options: FetchJsonOptions = {}
): Promise<FetchJsonResult<T>> {
  const {
    headers,
    signal,
    timeoutMs = 10_000,
    requireJsonContentType = true,
    ...requestInit
  } = options

  const requestHeaders = new Headers(headers)
  if (!requestHeaders.has('Accept')) {
    requestHeaders.set('Accept', 'application/json')
  }

  const response = await fetchResponse(input, {
    ...requestInit,
    headers: requestHeaders,
    signal,
    timeoutMs
  })

  if (!response.ok) {
    const payload = await readResponseBody(response)
    throw createApiError(
      getErrorMessage(payload, response.status, response.statusText),
      response.status,
      response.statusText,
      getErrorCode(payload),
      payload
    )
  }

  if (response.status === 204) {
    return {
      response,
      data: null as T
    }
  }

  const contentType = response.headers.get('content-type') || ''
  if (requireJsonContentType && !contentType.includes('json')) {
    const payload = await readResponseBody(response)
    throw new BfxApiError(
      `Expected JSON response but received ${contentType || 'unknown content type'}`,
      response.status,
      response.statusText,
      undefined,
      payload
    )
  }

  return {
    response,
    data: await response.json() as T
  }
}