export interface FetchResponseOptions extends Omit<RequestInit, 'headers' | 'signal'> {
    headers?: HeadersInit;
    signal?: AbortSignal;
    timeoutMs?: number;
}
export interface FetchJsonOptions extends FetchResponseOptions {
    requireJsonContentType?: boolean;
}
export interface FetchJsonResult<T> {
    response: Response;
    data: T;
}
/**
 * Fetches a raw response with a default timeout and signal composition.
 */
export declare function fetchResponse(input: string | URL, options?: FetchResponseOptions): Promise<Response>;
/**
 * Fetches JSON with a default timeout and typed HTTP error handling.
 */
export declare function fetchJson<T>(input: string | URL, options?: FetchJsonOptions): Promise<FetchJsonResult<T>>;
