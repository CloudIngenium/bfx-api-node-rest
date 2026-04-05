export interface FetchJsonOptions extends Omit<RequestInit, 'headers' | 'signal'> {
    headers?: HeadersInit;
    signal?: AbortSignal;
    timeoutMs?: number;
    requireJsonContentType?: boolean;
}
export interface FetchJsonResult<T> {
    response: Response;
    data: T;
}
/**
 * Fetches JSON with a default timeout and typed HTTP error handling.
 */
export declare function fetchJson<T>(input: string | URL, options?: FetchJsonOptions): Promise<FetchJsonResult<T>>;
