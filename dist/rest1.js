import Debug from 'debug';
import BfxUtil from 'bfx-api-node-util';
const { genAuthSig, nonce } = BfxUtil;
const debug = Debug('bfx:rest1');
const API_URL = 'https://api.bitfinex.com';
const BASE_TIMEOUT = 15000;
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
export class RESTv1 {
    _url;
    _apiKey;
    _apiSecret;
    _generateNonce;
    _timeout;
    _fetch;
    constructor(opts = {}) {
        if (typeof process !== 'undefined' && process.emitWarning) {
            process.emitWarning('RESTv1 is deprecated and will be removed in a future major version. Migrate to RESTv2.', 'DeprecationWarning');
        }
        this._url = opts.url || API_URL;
        this._apiKey = opts.apiKey || '';
        this._apiSecret = opts.apiSecret || '';
        this._generateNonce = (typeof opts.nonceGenerator === 'function')
            ? opts.nonceGenerator
            : nonce;
        this._timeout = opts.timeout ?? BASE_TIMEOUT;
        this._fetch = opts.fetch || globalThis.fetch;
    }
    _parse_req_body(result, cb) {
        if (typeof result.message === 'string') {
            if (/nonce is too small/i.test(result.message)) {
                result.message += ' See https://github.com/bitfinexcom/bitfinex-api-node/blob/master/README.md#nonce-too-small for help';
            }
            cb(new Error(result.message));
            return;
        }
        cb(null, result);
    }
    async make_request(path, params, cb) {
        if (!this._apiKey || !this._apiSecret) {
            return cb(new Error('missing api key or secret'));
        }
        if (!path) {
            return cb(new Error('path is missing'));
        }
        const payload = Object.assign({
            request: `/v1/${path}`,
            nonce: JSON.stringify(this._generateNonce())
        }, params);
        const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
        const { sig } = genAuthSig(this._apiSecret, payloadBase64);
        const url = `${this._url}/v1/${path}`;
        debug('POST %s', url);
        const reqOpts = {
            method: 'POST',
            signal: AbortSignal.timeout(this._timeout),
            headers: {
                'X-BFX-APIKEY': this._apiKey,
                'X-BFX-PAYLOAD': payloadBase64,
                'X-BFX-SIGNATURE': sig
            }
        };
        try {
            const resp = await this._fetch(url, reqOpts);
            if (!resp.ok && +resp.status !== 400) {
                throw new Error(`HTTP code ${resp.status} ${resp.statusText || ''}`);
            }
            const json = await resp.json();
            return this._parse_req_body(json, cb);
        }
        catch (err) {
            return cb(err);
        }
    }
    async make_public_request(path, cb) {
        if (!path) {
            return cb(new Error('path is missing'));
        }
        const url = `${this._url}/v1/${path}`;
        debug('GET %s', url);
        const reqOpts = {
            method: 'GET',
            signal: AbortSignal.timeout(this._timeout)
        };
        try {
            const resp = await this._fetch(url, reqOpts);
            if (!resp.ok && +resp.status !== 400) {
                throw new Error(`HTTP code ${resp.status} ${resp.statusText || ''}`);
            }
            const json = await resp.json();
            return this._parse_req_body(json, cb);
        }
        catch (err) {
            return cb(err);
        }
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-ticker
     */
    ticker(symbol = 'BTCUSD', cb) {
        return this.make_public_request(`pubticker/${symbol}`, cb);
    }
    today(symbol, cb) {
        return this.make_public_request(`today/${symbol}`, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-stats
     */
    stats(symbol, cb) {
        return this.make_public_request(`stats/${symbol}`, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-fundingbook
     */
    fundingbook(currency, options, cb) {
        let uri = `lendbook/${currency}`;
        if (typeof options === 'function') {
            cb = options;
        }
        else if (options && Object.keys(options).length > 0) {
            uri += `?${new URLSearchParams(options).toString()}`;
        }
        return this.make_public_request(uri, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-orderbook
     */
    orderbook(symbol, options, cb) {
        let uri = `book/${symbol}`;
        if (typeof options === 'function') {
            cb = options;
        }
        else if (options && Object.keys(options).length > 0) {
            uri += `?${new URLSearchParams(options).toString()}`;
        }
        return this.make_public_request(uri, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-trades
     */
    trades(symbol, cb) {
        return this.make_public_request('trades/' + symbol, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-lends
     */
    lends(currency, cb) {
        return this.make_public_request('lends/' + currency, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-symbols
     */
    get_symbols(cb) {
        return this.make_public_request('symbols', cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-public-symbol-details
     */
    symbols_details(cb) {
        return this.make_public_request('symbols_details', cb);
    }
    // ---- Authenticated Endpoints ----
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-new-order
     */
    new_order(symbol, amount, price, exchange, side, type, is_hidden, postOnly, cb) {
        if (typeof is_hidden === 'function') {
            cb = is_hidden;
            is_hidden = false;
        }
        if (typeof postOnly === 'function') {
            cb = postOnly;
            postOnly = false;
        }
        const params = {
            symbol, amount, price, exchange, side, type
        };
        if (postOnly)
            params.post_only = true;
        if (is_hidden)
            params.is_hidden = true;
        return this.make_request('order/new', params, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-multiple-new-orders
     */
    multiple_new_orders(orders, cb) {
        return this.make_request('order/new/multi', { orders }, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-cancel-order
     */
    cancel_order(order_id, cb) {
        return this.make_request('order/cancel', {
            order_id: parseInt(String(order_id))
        }, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-cancel-all-orders
     */
    cancel_all_orders(cb) {
        return this.make_request('order/cancel/all', {}, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-cancel-multiple-orders
     */
    cancel_multiple_orders(order_ids, cb) {
        return this.make_request('order/cancel/multi', {
            order_ids: order_ids.map(id => parseInt(String(id)))
        }, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-replace-order
     */
    replace_order(order_id, symbol, amount, price, exchange, side, type, cb) {
        return this.make_request('order/cancel/replace', {
            order_id: parseInt(String(order_id)),
            symbol, amount, price, exchange, side, type
        }, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-order-status
     */
    order_status(order_id, cb) {
        return this.make_request('order/status', {
            order_id: parseInt(String(order_id))
        }, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-active-orders
     */
    active_orders(cb) {
        return this.make_request('orders', {}, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-orders-history
     */
    orders_history(cb) {
        return this.make_request('orders/hist', {}, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-active-positions
     */
    active_positions(cb) {
        return this.make_request('positions', {}, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-claim-position
     */
    claim_position(position_id, amount, cb) {
        return this.make_request('position/claim', {
            position_id: parseInt(String(position_id)),
            amount
        }, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-balance-history
     */
    balance_history(currency, options, cb) {
        const params = { currency };
        if (typeof options === 'function') {
            cb = options;
        }
        else if (options && typeof options === 'object') {
            Object.assign(params, options);
        }
        return this.make_request('history', params, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-deposit-withdrawal-history
     */
    movements(currency, options, cb) {
        const params = { currency };
        if (typeof options === 'function') {
            cb = options;
        }
        else if (options && typeof options === 'object') {
            Object.assign(params, options);
        }
        return this.make_request('history/movements', params, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-past-trades
     */
    past_trades(symbol, options, cb) {
        const params = { symbol };
        if (typeof options === 'function') {
            cb = options;
        }
        else if (options && typeof options === 'object') {
            Object.assign(params, options);
        }
        return this.make_request('mytrades', params, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-deposit
     */
    new_deposit(currency, method, wallet_name, cb) {
        return this.make_request('deposit/new', {
            currency, method, wallet_name
        }, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-new-offer
     */
    new_offer(currency, amount, rate, period, direction, cb) {
        return this.make_request('offer/new', {
            currency, amount, rate, period, direction
        }, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-cancel-offer
     */
    cancel_offer(offer_id, cb) {
        return this.make_request('offer/cancel', {
            offer_id: parseInt(String(offer_id))
        }, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-offer-status
     */
    offer_status(offer_id, cb) {
        return this.make_request('offer/status', {
            offer_id: parseInt(String(offer_id))
        }, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-offers
     */
    active_offers(cb) {
        return this.make_request('offers', {}, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-active-credits
     */
    active_credits(cb) {
        return this.make_request('credits', {}, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-wallet-balances
     */
    wallet_balances(cb) {
        return this.make_request('balances', {}, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-active-funding-used-in-a-margin-position
     */
    taken_swaps(cb) {
        return this.make_request('taken_funds', {}, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-total-taken-funds
     */
    total_taken_swaps(cb) {
        return this.make_request('total_taken_funds', {}, cb);
    }
    close_swap(swap_id, cb) {
        return this.make_request('swap/close', {
            swap_id: parseInt(String(swap_id))
        }, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-account-info
     */
    account_infos(cb) {
        return this.make_request('account_infos', {}, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v1/reference#rest-auth-margin-information
     */
    margin_infos(cb) {
        return this.make_request('margin_infos', {}, cb);
    }
    /**
     * POST /v1/withdraw
     */
    withdraw(withdrawType, walletSelected, amount, address, cb) {
        return this.make_request('withdraw', {
            withdrawType, walletSelected, amount, address
        }, cb);
    }
    /**
     * POST /v1/transfer
     */
    transfer(amount, currency, walletFrom, walletTo, cb) {
        return this.make_request('transfer', {
            amount, currency, walletFrom, walletTo
        }, cb);
    }
}
export default RESTv1;
//# sourceMappingURL=rest1.js.map