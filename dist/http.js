import { BfxApiError, createApiError } from './errors.js';
function buildSignal(signal, timeoutMs) {
    if (signal) {
        return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
    }
    return AbortSignal.timeout(timeoutMs);
}
async function readResponseBody(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('json')) {
        try {
            return await response.json();
        }
        catch {
            return undefined;
        }
    }
    try {
        return await response.text();
    }
    catch {
        return undefined;
    }
}
function getErrorCode(payload) {
    if (Array.isArray(payload) && payload.length > 1) {
        const code = payload[1];
        if (typeof code === 'number' || typeof code === 'string') {
            return code;
        }
    }
    if (payload && typeof payload === 'object') {
        const code = payload.code;
        if (typeof code === 'number' || typeof code === 'string') {
            return code;
        }
    }
    return undefined;
}
function getErrorMessage(payload, status, statusText) {
    if (Array.isArray(payload) && payload.length > 2 && typeof payload[2] === 'string') {
        return payload[2];
    }
    if (payload && typeof payload === 'object') {
        const message = payload.message;
        if (typeof message === 'string' && message.length > 0) {
            return message;
        }
        const error = payload.error;
        if (typeof error === 'string' && error.length > 0) {
            return error;
        }
    }
    if (typeof payload === 'string' && payload.length > 0) {
        return payload;
    }
    return `HTTP ${status} ${statusText}`.trim();
}
/**
 * Fetches JSON with a default timeout and typed HTTP error handling.
 */
export async function fetchJson(input, options = {}) {
    const { headers, signal, timeoutMs = 10_000, requireJsonContentType = true, ...requestInit } = options;
    const requestHeaders = new Headers(headers);
    if (!requestHeaders.has('Accept')) {
        requestHeaders.set('Accept', 'application/json');
    }
    const response = await fetch(input, {
        ...requestInit,
        headers: requestHeaders,
        signal: buildSignal(signal, timeoutMs)
    });
    if (!response.ok) {
        const payload = await readResponseBody(response);
        throw createApiError(getErrorMessage(payload, response.status, response.statusText), response.status, response.statusText, getErrorCode(payload), payload);
    }
    if (response.status === 204) {
        return {
            response,
            data: null
        };
    }
    const contentType = response.headers.get('content-type') || '';
    if (requireJsonContentType && !contentType.includes('json')) {
        const payload = await readResponseBody(response);
        throw new BfxApiError(`Expected JSON response but received ${contentType || 'unknown content type'}`, response.status, response.statusText, undefined, payload);
    }
    return {
        response,
        data: await response.json()
    };
}
//# sourceMappingURL=http.js.map