declare const FundingOffer: typeof import("bfx-api-node-models").FundingOffer, Order: typeof import("bfx-api-node-models").Order;
/** Node-style callback: `(err, result)` */
export type Callback = (err: Error | null, res?: unknown) => void;
type Transformer = (new (...args: any[]) => unknown) | ((data: unknown) => unknown) | null;
type FetchFn = typeof globalThis.fetch;
/**
 * Error returned by the Bitfinex API.
 *
 * Extends the standard `Error` with HTTP status, API error code, and the raw response body.
 */
export interface APIError extends Error {
    /** HTTP status code (e.g. 400, 500) */
    status?: number;
    /** HTTP status text (e.g. "Bad Request") */
    statustext?: string;
    /** Bitfinex API error code (e.g. 10010 for rate limit, 10114 for nonce too small) */
    code?: number | string;
    /** Parsed response body — may be a string, object, or the raw error message from the API */
    response?: unknown;
}
/**
 * Configuration options for the RESTv2 client.
 *
 * @example
 * ```typescript
 * const rest = new RESTv2({
 *   apiKey: process.env.BFX_API_KEY,
 *   apiSecret: process.env.BFX_API_SECRET,
 *   transform: true,
 *   timeout: 30000
 * })
 * ```
 */
export interface RESTv2Options {
    /** Affiliate code injected into order metadata. Default: `null` */
    affCode?: string | null;
    /** Bitfinex API key for authenticated requests */
    apiKey?: string;
    /** Bitfinex API secret for signing authenticated requests */
    apiSecret?: string;
    /** Auth token — takes priority over apiKey/apiSecret when set */
    authToken?: string;
    /** Company identifier used for currency configuration endpoints */
    company?: string;
    /** Base API URL. Default: `'https://api.bitfinex.com'` */
    url?: string;
    /** When `true`, responses are transformed into model class instances from `bfx-api-node-models`. Default: `false` */
    transform?: boolean;
    /** Request timeout in milliseconds. Must be a positive integer. Default: `15000` */
    timeout?: number;
    /** Custom fetch function for proxy support or testing. Default: `globalThis.fetch` */
    fetch?: FetchFn;
}
interface PaginationParams {
    start?: number;
    end?: number;
    limit?: number;
    sort?: number;
}
/**
 * Communicates with v2 of the Bitfinex HTTP API.
 *
 * All methods return Promises and optionally accept a Node-style callback
 * as their last parameter: `(err: Error | null, result?: unknown) => void`.
 *
 * When `transform: true` is set, response arrays are automatically converted
 * to model class instances from `bfx-api-node-models`.
 *
 * @example
 * ```typescript
 * import { RESTv2 } from '@cloudingenium/bfx-api-node-rest'
 *
 * const rest = new RESTv2({
 *   apiKey: 'YOUR_API_KEY',
 *   apiSecret: 'YOUR_API_SECRET',
 *   transform: true
 * })
 *
 * const wallets = await rest.wallets()
 * ```
 */
export declare class RESTv2 {
    static url: string;
    private _url;
    private _apiKey;
    private _apiSecret;
    private _authToken;
    private _company;
    private _transform;
    private _timeout;
    private _affCode;
    private _fetch;
    constructor(opts?: RESTv2Options);
    /**
     * Check constructor options
     * @throws Error if timeout is not an integer
     */
    private _checkOpts;
    /** @returns The endpoint URL */
    getURL(): string;
    /** @returns Whether a custom fetch function was provided */
    usesAgent(): boolean;
    private _request;
    private _apiError;
    /**
     * Make an authenticated request
     */
    _makeAuthRequest(path: string, payload: Record<string, unknown> | undefined, cb: Callback | null, transformer?: Transformer): Promise<unknown>;
    /**
     * Make a public GET request
     */
    _makePublicRequest(path: string, cb: Callback | null, transformer?: Transformer): Promise<unknown>;
    /**
     * Make a public POST request
     */
    _makePublicPostRequest(path: string, payload: Record<string, unknown>, cb: Callback | null, transformer?: Transformer): Promise<unknown>;
    private _doTransform;
    private _classTransform;
    _response(data: unknown, transformer: Transformer, cb: Callback | null): unknown;
    _cb(err: Error | null, res: unknown, cb: Callback | null | undefined): unknown;
    /**
     * @returns merged arr of currencies and names sorted with no pairs repeated adding pool and explorer to each
     */
    private _genCurrencyList;
    /**
     * Retrieve the order book for a symbol at a given precision level.
     *
     * @param params.symbol - Trading symbol (e.g. `'tBTCUSD'`)
     * @param params.prec - Price aggregation level: `'P0'` (default), `'P1'`, `'P2'`, `'P3'`, `'P4'`, or `'R0'` (raw)
     * @see https://docs.bitfinex.com/v2/reference#rest-public-books
     */
    orderBook(params: {
        symbol: string;
        prec: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/reference#rest-public-calc-market-average-price
     */
    marketAveragePrice(params: {
        symbol: string;
        amount: number;
        period?: string;
        rate_limit?: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-public-platform-status
     */
    status(_params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#status
     */
    statusMessages(params?: {
        type?: string;
        keys?: string[];
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Get the current ticker for a trading or funding symbol.
     *
     * Returns a `TradingTicker` for `t`-prefixed symbols or a `FundingTicker`
     * for `f`-prefixed symbols (when transform is enabled).
     *
     * @param params - Ticker parameters
     * @param params.symbol - The symbol to fetch (e.g. `'tBTCUSD'` or `'fUSD'`)
     * @param cb - Optional callback
     * @returns The ticker data
     * @see https://docs.bitfinex.com/v2/reference#rest-public-ticker
     */
    ticker(params: {
        symbol: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Get tickers for one or more symbols. If no symbols provided, returns all.
     *
     * @param params - Tickers parameters
     * @param params.symbols - Array of symbols (e.g. `['tBTCUSD', 'fUSD']`). Defaults to all.
     * @param cb - Optional callback
     * @returns Array of ticker data
     * @see https://docs.bitfinex.com/v2/reference#rest-public-tickers
     */
    tickers(params?: {
        symbols?: string[];
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-public-tickers-history
     */
    tickersHistory(params?: {
        symbols?: string[];
        start?: number;
        end?: number;
        limit?: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-public-stats
     */
    stats(params: {
        key: string;
        context: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Get historical candlestick data.
     *
     * @param params - Candle parameters
     * @param params.timeframe - Time frame (e.g. `'1m'`, `'5m'`, `'1h'`, `'1D'`)
     * @param params.symbol - Trading symbol (e.g. `'tBTCUSD'`)
     * @param params.section - `'last'` for the latest candle, `'hist'` for historical
     * @param params.query - Optional query params: `start`, `end`, `limit`, `sort`
     * @param cb - Optional callback
     * @returns Array of Candle instances (when transform enabled)
     * @see https://docs.bitfinex.com/v2/reference#rest-public-candles
     */
    candles(params: {
        timeframe: string;
        symbol: string;
        section: string;
        query?: Record<string, string>;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Query configuration information
     */
    conf(params?: {
        keys?: string[];
    }, cb?: Callback | null): unknown;
    /**
     * Get a list of valid currencies ids, full names, pool and explorer
     * @see https://docs.bitfinex.com/v2/reference#rest-public-currencies
     */
    currencies(_params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * Retrieve price alerts for the authenticated user.
     *
     * @param params.type - Alert type (e.g. `'price'`)
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-alert-list
     */
    alertList(params: {
        type: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-alert-set
     */
    alertSet(params: {
        type: string;
        symbol: string;
        price: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-alert-delete
     */
    alertDelete(params: {
        symbol: string;
        price: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Get publicly available trades for a symbol.
     *
     * @param params.symbol - Trading pair or funding currency (e.g. `'tBTCUSD'`, `'fUSD'`)
     * @param params.start - Millisecond timestamp for range start
     * @param params.end - Millisecond timestamp for range end
     * @param params.limit - Max number of records (default 120, max 10000)
     * @param params.sort - Sort direction: `1` = oldest first, `-1` = newest first
     * @see https://docs.bitfinex.com/v2/reference#rest-public-trades
     */
    trades(params: {
        symbol: string;
    } & PaginationParams, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-public-liquidations
     */
    liquidations(params?: PaginationParams, cb?: Callback | null): Promise<unknown>;
    /**
     * Retrieve the authenticated user's trade history.
     *
     * @param params.symbol - Trading pair filter (e.g. `'tBTCUSD'`). Omit for all pairs.
     * @param params.start - Millisecond timestamp for range start
     * @param params.end - Millisecond timestamp for range end
     * @param params.limit - Max number of records
     * @param params.sort - Sort direction: `1` = oldest first, `-1` = newest first
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-trades-hist
     */
    accountTrades(params?: {
        symbol?: string;
    } & PaginationParams, cb?: Callback | null): Promise<unknown>;
    /**
     * Get weighted averages of trades
     */
    getWeightedAverages(params?: {
        symbol?: string;
        start?: number;
        end?: number;
        limit?: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-logins-hist
     */
    logins(params?: {
        start?: number;
        end?: number;
        limit?: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Retrieve all wallets (exchange, margin, funding) for the authenticated user.
     *
     * @returns Array of Wallet instances (when transform enabled)
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-wallets
     */
    wallets(params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-wallets-hist
     */
    walletsHistory(params?: {
        end?: number;
        currency?: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/reference#rest-auth-info-user
     */
    userInfo(params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * Retrieve all active orders for the authenticated user.
     *
     * @returns Array of Order instances (when transform enabled)
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-orders
     */
    activeOrders(params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * Retrieve active orders by their IDs.
     *
     * @param params.ids - Array of order IDs to retrieve
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-orders
     */
    activeOrdersWithIds(params: {
        ids: number[];
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Retrieve deposit/withdrawal history for the authenticated user.
     *
     * @param params.ccy - Currency filter (e.g. `'BTC'`). Omit for all currencies.
     * @param params.start - Millisecond timestamp for range start
     * @param params.end - Millisecond timestamp for range end
     * @param params.limit - Max number of records (default 25)
     * @see https://docs.bitfinex.com/v2/reference#movements
     */
    movements(params?: {
        ccy?: string;
        start?: number;
        end?: number;
        limit?: number;
        id?: number[];
        address?: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/reference/movement-info
     */
    movementInfo(params: {
        id: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#ledgers
     */
    ledgers(params: {
        filters: string | {
            ccy?: string;
            category?: number;
        };
        start?: number;
        end?: number;
        limit?: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/reference#rest-auth-orders-history
     */
    orderHistory(params?: {
        symbol?: string;
        start?: number;
        end?: number;
        limit?: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/reference#rest-auth-orders-history
     */
    orderHistoryWithIds(params: {
        ids: number[];
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-order-trades
     */
    orderTrades(params: {
        symbol: string;
        orderId: number;
        start?: number;
        end?: number;
        limit?: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Retrieve all active positions for the authenticated user.
     *
     * @returns Array of Position instances (when transform enabled)
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-positions
     */
    positions(params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-positions-history
     */
    positionsHistory(params?: {
        start?: number;
        end?: number;
        limit?: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-positions-audit
     */
    positionsAudit(params?: {
        id?: number[];
        start?: number;
        end?: number;
        limit?: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-positions-snap
     */
    positionsSnapshot(params?: {
        start?: number;
        end?: number;
        limit?: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Retrieve active funding offers for a given currency.
     *
     * @param params.symbol - Funding currency symbol (e.g. `'fUSD'`)
     * @returns Array of FundingOffer instances (when transform enabled)
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-offers
     */
    fundingOffers(params: {
        symbol: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-offers-hist
     */
    fundingOfferHistory(params: {
        symbol?: string;
        start?: number;
        end?: number;
        limit?: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-loans
     */
    fundingLoans(params: {
        symbol: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-loans-hist
     */
    fundingLoanHistory(params: {
        symbol?: string;
        start?: number;
        end?: number;
        limit?: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-credits
     */
    fundingCredits(params: {
        symbol: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-credits-hist
     */
    fundingCreditHistory(params: {
        symbol?: string;
        start?: number;
        end?: number;
        limit?: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-trades-hist
     */
    fundingTrades(params: {
        symbol?: string;
        start?: number;
        end?: number;
        limit?: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-info-margin
     */
    marginInfo(params?: {
        key?: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-audit-hist
     */
    changeLogs(params?: {
        start?: number;
        end?: number;
        limit?: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-info-funding
     */
    fundingInfo(params: {
        key: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/reference#rest-auth-keep-funding
     */
    keepFunding(params: {
        type: string;
        id: string | number;
    }, cb?: Callback | null): Promise<import("bfx-api-node-models").Notification>;
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-performance
     */
    performance(params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/reference/rest-auth-calc-order-avail
     */
    calcAvailableBalance(params: {
        symbol: string;
        type: string;
        dir?: string;
        rate?: number;
        lev?: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Get a list of valid symbol names
     * @see https://docs.bitfinex.com/v2/reference#rest-public-symbols
     */
    symbols(_params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * Get a list of inactive symbol names
     * @see https://docs.bitfinex.com/v2/reference#rest-public-symbols
     */
    inactiveSymbols(_params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * Get a list of valid futures symbol names
     * @see https://docs.bitfinex.com/v2/reference#rest-public-futures
     */
    futures(_params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * Changes the collateral value of an active derivatives position
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-deriv-pos-collateral-set
     */
    derivsPositionCollateralSet(params: {
        symbol: string;
        collateral: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Get symbol details
     * @see https://docs.bitfinex.com/reference#rest-public-conf
     */
    symbolDetails(params?: {
        includeFuturePairs?: boolean;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Request account withdrawal fees
     */
    accountFees(_params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * Returns a 30-day summary of trading volume and return on margin funding.
     *
     * @returns AccountSummary instance (when transform enabled)
     * @see https://docs.bitfinex.com/reference#rest-auth-summary
     */
    accountSummary(params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * Fetch the permissions of the key or token being used
     */
    keyPermissions(params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/reference#rest-auth-submit-order
     */
    closePosition(params: {
        position_id: number;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Update account settings.
     * @see https://docs.bitfinex.com/reference#rest-auth-settings-set
     */
    updateSettings(params: {
        settings: Record<string, unknown>;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Delete account settings by key.
     * @see https://docs.bitfinex.com/reference#rest-auth-settings-del
     */
    deleteSettings(params: {
        keys: string[];
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Retrieve account settings by key.
     * @see https://docs.bitfinex.com/reference#rest-auth-settings
     */
    getSettings(params: {
        keys: string[];
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Retrieve core platform settings by key.
     * @see https://docs.bitfinex.com/reference#rest-auth-settings-core
     */
    getCoreSettings(params: {
        keys: string[];
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Get the exchange rate between two currencies.
     */
    exchangeRate(params: {
        ccy1: string;
        ccy2: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Generate a short-lived authentication token.
     *
     * @param params.scope - Token scope (e.g. `'api'`)
     * @param params.ttl - Time-to-live in seconds
     * @param params.caps - Capabilities array
     * @param params.writePermission - Whether the token has write permissions
     * @see https://docs.bitfinex.com/reference#rest-auth-token
     */
    generateToken(params: {
        scope: string;
        ttl?: number;
        caps?: string[];
        writePermission?: boolean;
        _cust_ip?: string;
    }, cb?: Callback | null): unknown;
    /**
     * Invalidate (revoke) an authentication token.
     * @see https://docs.bitfinex.com/reference#rest-auth-token-del
     */
    invalidateAuthToken(params: {
        authToken: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Submit a new order to the exchange.
     *
     * If an `affCode` was set in the constructor options, it is automatically
     * injected into the order metadata.
     *
     * @param params.order - An `Order` model instance (from `bfx-api-node-models`)
     * @returns The submitted Order (transformed when enabled)
     * @see https://docs.bitfinex.com/reference#rest-auth-submit-order
     */
    submitOrder(params: {
        order: InstanceType<typeof Order>;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Update existing order
     */
    updateOrder(params: Record<string, unknown>, cb?: Callback | null): Promise<import("bfx-api-node-models").Notification>;
    /**
     * Cancel existing order
     */
    cancelOrder(params: {
        id: number;
    }, cb?: Callback | null): Promise<import("bfx-api-node-models").Notification>;
    /**
     * Cancel existing order using client ID
     */
    cancelOrderWithCid(params: {
        cid: number;
        date: string;
    }, cb?: Callback | null): Promise<import("bfx-api-node-models").Notification>;
    /**
     * Submit multiple orders
     */
    submitOrderMulti(params: {
        orders: unknown[];
    }, cb?: Callback | null): unknown;
    /**
     * Update multiple orders
     */
    updateOrderMulti(params: {
        orders: unknown[];
    }, cb?: Callback | null): unknown;
    /**
     * Cancel orders by IDs
     */
    cancelOrders(params: {
        ids: number[];
    }, cb?: Callback | null): unknown;
    /**
     * Send multiple order-related operations
     * @see https://docs.bitfinex.com/reference#rest-auth-order-multi
     */
    orderMultiOp(params: {
        ops: unknown[][];
    }, cb?: Callback | null): unknown;
    /**
     * Cancel multiple orders simultaneously
     * @see https://docs.bitfinex.com/reference#rest-auth-order-cancel-multi
     */
    cancelOrderMulti(params: {
        id?: number[];
        gid?: number[];
        cid?: number[][];
        all?: number;
    }, cb?: Callback | null): Promise<import("bfx-api-node-models").Notification>;
    /**
     * Claim existing open position
     */
    claimPosition(params: {
        id: number;
        amount?: number | string;
    }, cb?: Callback | null): Promise<import("bfx-api-node-models").Notification>;
    /**
     * Submit a new funding offer.
     *
     * If an `affCode` was set in the constructor options, it is automatically
     * injected into the offer metadata.
     *
     * @param params.offer - A `FundingOffer` model instance (from `bfx-api-node-models`)
     * @see https://docs.bitfinex.com/reference#rest-auth-submit-funding-offer
     */
    submitFundingOffer(params: {
        offer: InstanceType<typeof FundingOffer>;
    }, cb?: Callback | null): Promise<import("bfx-api-node-models").Notification>;
    /**
     * Cancel existing funding offer
     */
    cancelFundingOffer(params: {
        id: number;
    }, cb?: Callback | null): Promise<import("bfx-api-node-models").Notification>;
    /**
     * Cancel all existing funding offers
     */
    cancelAllFundingOffers(params: {
        currency: string;
    }, cb?: Callback | null): Promise<import("bfx-api-node-models").Notification>;
    /**
     * Close funding
     */
    closeFunding(params: {
        id: number;
        type: string;
    }, cb?: Callback | null): Promise<import("bfx-api-node-models").Notification>;
    /**
     * Submit automatic funding
     */
    submitAutoFunding(params: {
        status: number;
        currency: string;
        amount: number;
        rate: number;
        period: number;
    }, cb?: Callback | null): Promise<import("bfx-api-node-models").Notification>;
    /**
     * Execute a balance transfer between wallets (exchange, margin, funding).
     *
     * @param params.amount - Amount to transfer (as string)
     * @param params.from - Source wallet (e.g. `'exchange'`, `'margin'`, `'funding'`)
     * @param params.to - Destination wallet
     * @param params.currency - Currency to transfer (e.g. `'USD'`)
     * @param params.currencyTo - Destination currency (usually same as `currency`)
     * @see https://docs.bitfinex.com/reference#rest-auth-transfer
     */
    transfer(params: {
        amount: string;
        from: string;
        to: string;
        currency: string;
        currencyTo: string;
    }, cb?: Callback | null): Promise<import("bfx-api-node-models").Notification>;
    /**
     * Get or generate a deposit address for the given wallet and method.
     * @see https://docs.bitfinex.com/reference#rest-auth-deposit-address
     */
    getDepositAddress(params: {
        wallet: string;
        method: string;
        opRenew?: number;
    }, cb?: Callback | null): Promise<import("bfx-api-node-models").Notification>;
    /**
     * Request a withdrawal from the platform.
     * @see https://docs.bitfinex.com/reference#rest-auth-withdraw
     */
    withdraw(params: Record<string, unknown>, cb?: Callback | null): Promise<import("bfx-api-node-models").Notification>;
    /**
     * @see https://docs.bitfinex.com/reference#rest-auth-deposit-invoice
     */
    generateInvoice(params: {
        currency: string;
        wallet: string;
        amount: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * @see https://docs.bitfinex.com/reference/lnx-invoice-payments
     */
    lnxInvoicePayments(params: {
        action: string;
        query: Record<string, unknown>;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Create a new recurring algorithmic order.
     */
    submitRecurringAlgoOrder(params?: {
        order: Record<string, unknown>;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Retrieve details for a specific recurring algorithmic order.
     */
    getRecurringAlgoOrder(params?: {
        algoOrderId: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Update an existing recurring algorithmic order.
     */
    updateRecurringAlgoOrder(params?: {
        order: Record<string, unknown> & {
            algoOrderId: string;
        };
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * Cancel a recurring algorithmic order.
     */
    cancelRecurringAlgoOrder(params?: {
        algoOrderId: string;
    }, cb?: Callback | null): Promise<unknown>;
    /**
     * List all recurring algorithmic orders.
     */
    getRecurringAlgoOrders(params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * List child orders generated by recurring algorithmic orders.
     */
    getRecurringAoOrders(params?: Record<string, unknown>, cb?: Callback | null): Promise<unknown>;
    /**
     * Convert between currencies
     */
    currencyConversion(params: {
        ccy1: string;
        ccy2: string;
        amount: number;
    }, cb?: Callback | null): Promise<unknown>;
}
export default RESTv2;
