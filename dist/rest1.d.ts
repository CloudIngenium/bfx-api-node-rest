type Callback = (err: Error | null, data?: unknown) => void;
type FetchFn = typeof globalThis.fetch;
/**
 * Configuration options for the RESTv1 client.
 *
 * @deprecated RESTv1 is deprecated. Use {@link RESTv2} and {@link RESTv2Options} instead.
 */
export interface RESTv1Options {
    /** Bitfinex API key */
    apiKey?: string;
    /** Bitfinex API secret */
    apiSecret?: string;
    /** Base API URL. Default: `'https://api.bitfinex.com'` */
    url?: string;
    /** Custom nonce generator function */
    nonceGenerator?: () => string;
    /** Request timeout in milliseconds. Default: `15000` */
    timeout?: number;
    /** Custom fetch function for proxy support or testing */
    fetch?: FetchFn;
}
/**
 * Communicates with v1 of the Bitfinex HTTP API.
 *
 * @deprecated RESTv1 is deprecated and will be removed in a future major version.
 * Migrate to {@link RESTv2} which provides the same functionality with a modern interface.
 *
 * @example
 * ```typescript
 * // Before (v1):
 * const rest = new RESTv1({ apiKey: '...', apiSecret: '...' })
 * rest.wallet_balances((err, balances) => { ... })
 *
 * // After (v2):
 * const rest = new RESTv2({ apiKey: '...', apiSecret: '...', transform: true })
 * const wallets = await rest.wallets()
 * ```
 */
export declare class RESTv1 {
    private _url;
    private _apiKey;
    private _apiSecret;
    private _generateNonce;
    private _timeout;
    private _fetch;
    constructor(opts?: RESTv1Options);
    private _parse_req_body;
    make_request(path: string, params: Record<string, unknown>, cb: Callback): Promise<void>;
    make_public_request(path: string, cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-ticker
     */
    ticker(symbol: string | undefined, cb: Callback): Promise<void>;
    today(symbol: string, cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-stats
     */
    stats(symbol: string, cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-fundingbook
     */
    fundingbook(currency: string, options: Record<string, string> | Callback, cb?: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-orderbook
     */
    orderbook(symbol: string, options: Record<string, string> | Callback, cb?: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-trades
     */
    trades(symbol: string, cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-lends
     */
    lends(currency: string, cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-symbols
     */
    get_symbols(cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-symbol-details
     */
    symbols_details(cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-new-order
     */
    new_order(symbol: string, amount: number | string, price: number | string, exchange: string, side: string, type: string, is_hidden?: boolean | Callback, postOnly?: boolean | Callback, cb?: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-multiple-new-orders
     */
    multiple_new_orders(orders: unknown[], cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-cancel-order
     */
    cancel_order(order_id: string | number, cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-cancel-all-orders
     */
    cancel_all_orders(cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-cancel-multiple-orders
     */
    cancel_multiple_orders(order_ids: (string | number)[], cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-replace-order
     */
    replace_order(order_id: string | number, symbol: string, amount: number | string, price: number | string, exchange: string, side: string, type: string, cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-order-status
     */
    order_status(order_id: string | number, cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-active-orders
     */
    active_orders(cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-orders-history
     */
    orders_history(cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-active-positions
     */
    active_positions(cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-claim-position
     */
    claim_position(position_id: string | number, amount: number | string, cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-balance-history
     */
    balance_history(currency: string, options: Record<string, unknown> | Callback, cb?: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-deposit-withdrawal-history
     */
    movements(currency: string, options: Record<string, unknown> | Callback, cb?: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-past-trades
     */
    past_trades(symbol: string, options: Record<string, unknown> | Callback, cb?: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-deposit
     */
    new_deposit(currency: string, method: string, wallet_name: string, cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-new-offer
     */
    new_offer(currency: string, amount: number | string, rate: number | string, period: number, direction: string, cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-cancel-offer
     */
    cancel_offer(offer_id: string | number, cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-offer-status
     */
    offer_status(offer_id: string | number, cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-offers
     */
    active_offers(cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-active-credits
     */
    active_credits(cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-wallet-balances
     */
    wallet_balances(cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-active-funding-used-in-a-margin-position
     */
    taken_swaps(cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-total-taken-funds
     */
    total_taken_swaps(cb: Callback): Promise<void>;
    close_swap(swap_id: string | number, cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-account-info
     */
    account_infos(cb: Callback): Promise<void>;
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-margin-information
     */
    margin_infos(cb: Callback): Promise<void>;
    /**
     * POST /v1/withdraw
     */
    withdraw(withdrawType: string, walletSelected: string, amount: number | string, address: string, cb: Callback): Promise<void>;
    /**
     * POST /v1/transfer
     */
    transfer(amount: number | string, currency: string, walletFrom: string, walletTo: string, cb: Callback): Promise<void>;
}
export default RESTv1;
