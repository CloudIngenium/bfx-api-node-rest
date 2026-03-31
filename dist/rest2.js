import Debug from 'debug';
import BfxUtil from 'bfx-api-node-util';
import Models from 'bfx-api-node-models';
const { genAuthSig, nonce, isClass } = BfxUtil;
const { FundingCredit, FundingLoan, FundingOffer, FundingTrade, MarginInfo, Order, Position, Trade, PublicTrade, TradingTicker, TradingTickerHist, FundingTicker, FundingTickerHist, Wallet, WalletHist, Alert, Candle, Movement, MovementInfo, LedgerEntry, Liquidations, UserInfo, Currency, StatusMessagesDeriv, Notification, Login, ChangeLog, Invoice, SymbolDetails, TransactionFee, AccountSummary, AuthPermission, CoreSettings, WeightedAverages } = Models;
const debug = Debug('bfx:rest2');
const BASE_TIMEOUT = 15000;
const API_URL = 'https://api.bitfinex.com';
// --- Utility functions (lodash replacements) ---
function omitNil(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));
}
function pick(obj, keys) {
    return Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));
}
function _takeResNotify(data) {
    return new Notification(data);
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
export class RESTv2 {
    static url = API_URL;
    _url;
    _apiKey;
    _apiSecret;
    _authToken;
    _company;
    _transform;
    _timeout;
    _affCode;
    _fetch;
    constructor(opts = {}) {
        this._checkOpts(opts);
        this._url = opts.url || API_URL;
        this._apiKey = opts.apiKey || '';
        this._apiSecret = opts.apiSecret || '';
        this._authToken = opts.authToken || '';
        this._company = opts.company || '';
        this._transform = !!opts.transform;
        this._affCode = opts.affCode;
        this._timeout = Number.isInteger(opts.timeout)
            ? opts.timeout
            : BASE_TIMEOUT;
        this._fetch = opts.fetch || globalThis.fetch;
    }
    /**
     * Check constructor options
     * @throws Error if timeout is not an integer
     */
    _checkOpts(opts) {
        if (opts.timeout != null &&
            !Number.isInteger(opts.timeout)) {
            throw new Error('ERR_TIMEOUT_DATA_TYPE_ERROR');
        }
    }
    /** @returns The endpoint URL */
    getURL() {
        return this._url;
    }
    /** @returns Whether a custom fetch function was provided */
    usesAgent() {
        return this._fetch !== globalThis.fetch;
    }
    async _request(url, reqOpts, transformer, cb) {
        try {
            const resp = await this._fetch(url, reqOpts);
            const raw = await resp.text();
            if (!resp.ok) {
                throw this._apiError(resp, raw);
            }
            const json = JSON.parse(raw);
            return this._response(json, transformer, cb);
        }
        catch (err) {
            return this._cb(err, null, cb);
        }
    }
    _apiError(resp, rawBody) {
        const err = new Error(`HTTP code ${resp.status} ${resp.statusText || ''}`);
        err.status = resp.status;
        err.statustext = resp.statusText;
        try {
            const parsed = JSON.parse(rawBody);
            if (Array.isArray(parsed) && parsed.length >= 3) {
                err.code = parsed[1];
                err.response = parsed[2];
            }
            else {
                err.response = parsed;
            }
        }
        catch {
            err.response = rawBody;
        }
        return err;
    }
    /**
     * Make an authenticated request
     */
    async _makeAuthRequest(path, payload = {}, cb, transformer) {
        if ((!this._apiKey || !this._apiSecret) && !this._authToken) {
            const e = new Error('missing api key or secret');
            return this._cb(e, null, cb);
        }
        const url = `${this._url}/v2${path}`;
        const n = nonce();
        const sanitizedPayload = omitNil(payload);
        const keys = () => {
            const sigPayload = `/api/v2${path}${n}${JSON.stringify(sanitizedPayload)}`;
            const { sig } = genAuthSig(this._apiSecret, sigPayload);
            return { 'bfx-apikey': this._apiKey, 'bfx-signature': sig };
        };
        const auth = this._authToken
            ? { 'bfx-token': this._authToken }
            : keys();
        debug('POST %s', url);
        const reqOpts = {
            method: 'POST',
            signal: AbortSignal.timeout(this._timeout),
            headers: {
                'content-type': 'application/json',
                'bfx-nonce': n,
                ...auth
            },
            body: JSON.stringify(sanitizedPayload)
        };
        return this._request(url, reqOpts, transformer ?? null, cb);
    }
    /**
     * Make a public GET request
     */
    async _makePublicRequest(path, cb, transformer) {
        if ((cb !== null && cb !== undefined) && typeof cb !== 'function') {
            throw new Error('_makePublicRequest cb param must be a function');
        }
        const url = `${this._url}/v2${path}`;
        debug('GET %s', url);
        const reqOpts = {
            method: 'GET',
            signal: AbortSignal.timeout(this._timeout)
        };
        return this._request(url, reqOpts, transformer ?? null, cb);
    }
    /**
     * Make a public POST request
     */
    async _makePublicPostRequest(path, payload, cb, transformer) {
        const url = `${this._url}/v2${path}`;
        debug('POST %s', url);
        const sanitizedPayload = omitNil(payload);
        const reqOpts = {
            method: 'POST',
            signal: AbortSignal.timeout(this._timeout),
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify(sanitizedPayload)
        };
        return this._request(url, reqOpts, transformer ?? null, cb);
    }
    _doTransform(data, transformer) {
        if (isClass(transformer)) {
            return this._classTransform(data, transformer);
        }
        else if (typeof transformer === 'function') {
            return transformer(data);
        }
        return data;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _classTransform(data, ModelClass) {
        if (!data || (Array.isArray(data) && data.length === 0))
            return [];
        if (!ModelClass || !this._transform)
            return data;
        if (Array.isArray(data) && Array.isArray(data[0])) {
            return data.map(row => new ModelClass(row, this));
        }
        return new ModelClass(data, this);
    }
    _response(data, transformer, cb) {
        try {
            const res = this._transform
                ? this._doTransform(data, transformer)
                : data;
            return this._cb(null, res, cb);
        }
        catch (e) {
            return this._cb(e, null, cb);
        }
    }
    _cb(err, res, cb) {
        const isCbFunc = typeof cb === 'function';
        if (err) {
            const errRecord = err;
            if (errRecord.error && Array.isArray(errRecord.error) && errRecord.error[1] === 10114) {
                err.message += ' see https://github.com/bitfinexcom/bitfinex-api-node/blob/master/README.md#nonce-too-small for help';
            }
            return isCbFunc ? cb(err) : Promise.reject(err);
        }
        return isCbFunc ? cb(null, res) : Promise.resolve(res);
    }
    /**
     * @returns merged arr of currencies and names sorted with no pairs repeated adding pool and explorer to each
     */
    _genCurrencyList(data) {
        if (!Array.isArray(data) || data.length !== 6) {
            return data;
        }
        const transformArrToObj = (arr) => {
            const obj = {};
            arr.forEach((c) => {
                if (!Array.isArray(c)) {
                    obj[c] = c;
                }
                else if (c.length > 1) {
                    obj[c[0]] = c[1];
                }
            });
            return obj;
        };
        const listedCurr = transformArrToObj(data[0]);
        const mapedCurrSym = transformArrToObj(data[1]);
        const mapedCurrLabel = transformArrToObj(data[2]);
        const pool = transformArrToObj(data[3]);
        const explorer = transformArrToObj(data[4]);
        const walletFx = transformArrToObj(data[5]);
        const allCurrObj = {
            ...listedCurr,
            ...mapedCurrSym,
            ...mapedCurrLabel
        };
        // Assign explorers of pool to currencies
        Object.keys(pool).forEach((key) => {
            if (!explorer[key]) {
                const poolKey = pool[key];
                if (explorer[poolKey]) {
                    explorer[key] = explorer[poolKey];
                }
            }
        });
        const allCurArr = [];
        Object.keys(allCurrObj).forEach((key) => {
            const cPool = pool[key] || null;
            const cExpl = explorer[key] || [];
            const cName = allCurrObj[key];
            const cSymbol = mapedCurrSym[key] || key;
            const cWfx = walletFx[key] || [];
            allCurArr.push([key, cName, cPool, cExpl, cSymbol, cWfx]);
        });
        return allCurArr;
    }
    // ---- Public Market Data ----
    /**
     * Retrieve the order book for a symbol at a given precision level.
     *
     * @param params.symbol - Trading symbol (e.g. `'tBTCUSD'`)
     * @param params.prec - Price aggregation level: `'P0'` (default), `'P1'`, `'P2'`, `'P3'`, `'P4'`, or `'R0'` (raw)
     * @see https://docs.bitfinex.com/v2/reference#rest-public-books
     */
    orderBook(params, cb = null) {
        const { symbol, prec } = params;
        return this._makePublicRequest(`/book/${symbol}/${prec}`, cb);
    }
    /**
     * @see https://docs.bitfinex.com/reference#rest-public-calc-market-average-price
     */
    marketAveragePrice(params, cb = null) {
        const usp = new URLSearchParams(params);
        return this._makePublicPostRequest(`/calc/trade/avg?${usp.toString()}`, {}, cb);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-public-platform-status
     */
    status(_params = {}, cb = null) {
        return this._makePublicRequest('/platform/status', cb);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#status
     */
    statusMessages(params = {}, cb = null) {
        const { type = 'deriv', keys = ['ALL'] } = params;
        const url = `/status/${type}?keys=${keys.join(',')}`;
        const transformer = (type === 'deriv') ? StatusMessagesDeriv : null;
        return this._makePublicRequest(url, cb, transformer);
    }
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
    ticker(params, cb = null) {
        const { symbol } = params;
        const transformer = (data) => {
            const ticker = [symbol, ...data];
            return (symbol[0] === 't')
                ? new TradingTicker(ticker)
                : new FundingTicker(ticker);
        };
        return this._makePublicRequest(`/ticker/${symbol}`, cb, transformer);
    }
    /**
     * Get tickers for one or more symbols. If no symbols provided, returns all.
     *
     * @param params - Tickers parameters
     * @param params.symbols - Array of symbols (e.g. `['tBTCUSD', 'fUSD']`). Defaults to all.
     * @param cb - Optional callback
     * @returns Array of ticker data
     * @see https://docs.bitfinex.com/v2/reference#rest-public-tickers
     */
    tickers(params = {}, cb = null) {
        const { symbols = [] } = params;
        const transformer = (data) => {
            return data.map(ticker => ((ticker[0] || '')[0] === 't'
                ? new TradingTicker(ticker)
                : new FundingTicker(ticker)));
        };
        const url = `/tickers?symbols=${symbols.length ? symbols.join(',') : 'ALL'}`;
        return this._makePublicRequest(url, cb, transformer);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-public-tickers-history
     */
    tickersHistory(params = {}, cb = null) {
        const { symbols = [], start, end, limit = 250 } = params;
        const transformer = (data) => {
            return data.map(ticker => ((ticker[0] || '')[0] === 't'
                ? new TradingTickerHist(ticker)
                : new FundingTickerHist(ticker)));
        };
        const s = start ? `&start=${start}` : '';
        const e = end ? `&end=${end}` : '';
        const query = `?symbols=${symbols.length ? symbols.join(',') : 'ALL'}${s}${e}&limit=${limit}`;
        const url = `/tickers/hist${query}`;
        return this._makePublicRequest(url, cb, transformer);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-public-stats
     */
    stats(params, cb = null) {
        const { key, context } = params;
        return this._makePublicRequest(`/stats1/${key}/${context}`, cb);
    }
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
    candles(params, cb = null) {
        const { timeframe, symbol, section, query = {} } = params;
        let url = `/candles/trade:${timeframe}:${symbol}/${section}`;
        if (Object.keys(query).length > 0) {
            url += `?${new URLSearchParams(query).toString()}`;
        }
        return this._makePublicRequest(url, cb, Candle);
    }
    /**
     * Query configuration information
     */
    conf(params = {}, cb = null) {
        const { keys = [] } = params;
        if (keys.length === 0) {
            return this._response([], null, cb);
        }
        const url = `/conf/${keys.join(',')}`;
        return this._makePublicRequest(url, cb);
    }
    /**
     * Get a list of valid currencies ids, full names, pool and explorer
     * @see https://docs.bitfinex.com/v2/reference#rest-public-currencies
     */
    async currencies(_params = {}, cb = null) {
        const suffix = this._company ? ':' + this._company : '';
        const url = `/conf/${[
            `pub:list:currency${suffix}`,
            `pub:map:currency:sym${suffix}`,
            `pub:map:currency:label${suffix}`,
            `pub:map:currency:pool${suffix}`,
            `pub:map:currency:explorer${suffix}`,
            `pub:map:currency:wfx${suffix}`
        ].join(',')}`;
        return this._makePublicRequest(url, cb, (data) => {
            const res = this._genCurrencyList(data);
            return this._doTransform(res, Currency);
        });
    }
    // ---- Alerts ----
    /**
     * Retrieve price alerts for the authenticated user.
     *
     * @param params.type - Alert type (e.g. `'price'`)
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-alert-list
     */
    alertList(params, cb = null) {
        const { type } = params;
        return this._makeAuthRequest('/auth/r/alerts', { type }, cb, Alert);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-alert-set
     */
    alertSet(params, cb = null) {
        const { type, symbol, price } = params;
        return this._makeAuthRequest('/auth/w/alert/set', { type, symbol, price }, cb, Alert);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-alert-delete
     */
    alertDelete(params, cb = null) {
        const { symbol, price } = params;
        return this._makeAuthRequest('/auth/w/alert/del', { symbol, price }, cb);
    }
    // ---- Trades ----
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
    trades(params, cb = null) {
        const { symbol, start, end, limit, sort } = params;
        const query = omitNil({ start, end, limit, sort });
        let url = `/trades/${symbol}/hist`;
        if (Object.keys(query).length > 0) {
            url += `?${new URLSearchParams(query).toString()}`;
        }
        return this._makePublicRequest(url, cb, PublicTrade);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-public-liquidations
     */
    liquidations(params = {}, cb = null) {
        const { start, end, limit, sort } = params;
        const query = omitNil({ start, end, limit, sort });
        let url = '/liquidations/hist';
        if (Object.keys(query).length > 0) {
            url += `?${new URLSearchParams(query).toString()}`;
        }
        return this._makePublicRequest(url, cb, Liquidations);
    }
    // ---- Account Trades ----
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
    accountTrades(params = {}, cb = null) {
        const { symbol, start, end, limit, sort } = params;
        const url = symbol
            ? `/auth/r/trades/${symbol}/hist`
            : '/auth/r/trades/hist';
        return this._makeAuthRequest(url, {
            start, end, limit, sort
        }, cb, Trade);
    }
    /**
     * Get weighted averages of trades
     */
    getWeightedAverages(params = {}, cb = null) {
        const { symbol, start, end, limit } = params;
        return this._makeAuthRequest('/auth/r/trades/calc', {
            symbol, start, end, limit
        }, cb, WeightedAverages);
    }
    // ---- User ----
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-logins-hist
     */
    logins(params = {}, cb = null) {
        const { start, end, limit } = params;
        return this._makeAuthRequest('/auth/r/logins/hist', {
            start, end, limit
        }, cb, Login);
    }
    /**
     * Retrieve all wallets (exchange, margin, funding) for the authenticated user.
     *
     * @returns Array of Wallet instances (when transform enabled)
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-wallets
     */
    wallets(params = {}, cb = null) {
        return this._makeAuthRequest('/auth/r/wallets', params, cb, Wallet);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-wallets-hist
     */
    walletsHistory(params = {}, cb = null) {
        return this._makeAuthRequest('/auth/r/wallets/hist', params, cb, WalletHist);
    }
    /**
     * @see https://docs.bitfinex.com/reference#rest-auth-info-user
     */
    userInfo(params = {}, cb = null) {
        return this._makeAuthRequest('/auth/r/info/user', params, cb, UserInfo);
    }
    // ---- Orders ----
    /**
     * Retrieve all active orders for the authenticated user.
     *
     * @returns Array of Order instances (when transform enabled)
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-orders
     */
    activeOrders(params = {}, cb = null) {
        return this._makeAuthRequest('/auth/r/orders', params, cb, Order);
    }
    /**
     * Retrieve active orders by their IDs.
     *
     * @param params.ids - Array of order IDs to retrieve
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-orders
     */
    activeOrdersWithIds(params, cb = null) {
        const { ids } = params;
        return this._makeAuthRequest('/auth/r/orders', { id: ids }, cb, Order);
    }
    // ---- Movements ----
    /**
     * Retrieve deposit/withdrawal history for the authenticated user.
     *
     * @param params.ccy - Currency filter (e.g. `'BTC'`). Omit for all currencies.
     * @param params.start - Millisecond timestamp for range start
     * @param params.end - Millisecond timestamp for range end
     * @param params.limit - Max number of records (default 25)
     * @see https://docs.bitfinex.com/v2/reference#movements
     */
    movements(params = {}, cb = null) {
        const { ccy, start, end, limit = 25, id, address } = params;
        const url = ccy
            ? `/auth/r/movements/${ccy}/hist`
            : '/auth/r/movements/hist';
        return this._makeAuthRequest(url, { start, end, limit, id, address }, cb, Movement);
    }
    /**
     * @see https://docs.bitfinex.com/reference/movement-info
     */
    movementInfo(params, cb = null) {
        const { id } = params;
        return this._makeAuthRequest('/auth/r/movements/info', { id }, cb, MovementInfo);
    }
    // ---- Ledgers ----
    /**
     * @see https://docs.bitfinex.com/v2/reference#ledgers
     */
    ledgers(params, cb = null) {
        const { filters, start, end, limit = 25 } = params;
        const parseFilters = (sent) => {
            if (typeof sent === 'string')
                return { ccy: sent };
            return sent || {};
        };
        const { ccy, category } = parseFilters(filters);
        const url = ccy
            ? `/auth/r/ledgers/${ccy}/hist`
            : '/auth/r/ledgers/hist';
        return this._makeAuthRequest(url, {
            start, end, limit, category
        }, cb, LedgerEntry);
    }
    // ---- Order History ----
    /**
     * @see https://docs.bitfinex.com/reference#rest-auth-orders-history
     */
    orderHistory(params = {}, cb = null) {
        const { symbol, start, end, limit } = params;
        const url = symbol
            ? `/auth/r/orders/${symbol}/hist`
            : '/auth/r/orders/hist';
        return this._makeAuthRequest(url, {
            start, end, limit
        }, cb, Order);
    }
    /**
     * @see https://docs.bitfinex.com/reference#rest-auth-orders-history
     */
    orderHistoryWithIds(params, cb = null) {
        const { ids } = params;
        return this._makeAuthRequest('/auth/r/orders/hist', { id: ids }, cb, Order);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-order-trades
     */
    orderTrades(params, cb = null) {
        const { symbol, start, end, limit, orderId } = params;
        return this._makeAuthRequest(`/auth/r/order/${symbol}:${orderId}/trades`, {
            start, end, limit
        }, cb, Trade);
    }
    // ---- Positions ----
    /**
     * Retrieve all active positions for the authenticated user.
     *
     * @returns Array of Position instances (when transform enabled)
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-positions
     */
    positions(params = {}, cb = null) {
        return this._makeAuthRequest('/auth/r/positions', params, cb, Position);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-positions-history
     */
    positionsHistory(params = {}, cb = null) {
        const { start, end, limit = 50 } = params;
        return this._makeAuthRequest('/auth/r/positions/hist', {
            start, end, limit
        }, cb, Position);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-positions-audit
     */
    positionsAudit(params = {}, cb = null) {
        const { id, start, end, limit = 250 } = params;
        return this._makeAuthRequest('/auth/r/positions/audit', {
            id, start, end, limit
        }, cb, Position);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-positions-snap
     */
    positionsSnapshot(params = {}, cb = null) {
        const { start, end, limit = 50 } = params;
        return this._makeAuthRequest('/auth/r/positions/snap', {
            start, end, limit
        }, cb, Position);
    }
    // ---- Funding ----
    /**
     * Retrieve active funding offers for a given currency.
     *
     * @param params.symbol - Funding currency symbol (e.g. `'fUSD'`)
     * @returns Array of FundingOffer instances (when transform enabled)
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-offers
     */
    fundingOffers(params, cb = null) {
        const { symbol } = params;
        return this._makeAuthRequest(`/auth/r/funding/offers/${symbol}`, {}, cb, FundingOffer);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-offers-hist
     */
    fundingOfferHistory(params, cb = null) {
        const { symbol = '', start, end, limit } = params;
        const url = symbol
            ? `/auth/r/funding/offers/${symbol}/hist`
            : '/auth/r/funding/offers/hist';
        return this._makeAuthRequest(url, {
            start, end, limit
        }, cb, FundingOffer);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-loans
     */
    fundingLoans(params, cb = null) {
        const { symbol } = params;
        return this._makeAuthRequest(`/auth/r/funding/loans/${symbol}`, {}, cb, FundingLoan);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-loans-hist
     */
    fundingLoanHistory(params, cb = null) {
        const { symbol = '', start, end, limit } = params;
        const url = symbol
            ? `/auth/r/funding/loans/${symbol}/hist`
            : '/auth/r/funding/loans/hist';
        return this._makeAuthRequest(url, {
            start, end, limit
        }, cb, FundingLoan);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-credits
     */
    fundingCredits(params, cb = null) {
        const { symbol } = params;
        return this._makeAuthRequest(`/auth/r/funding/credits/${symbol}`, {}, cb, FundingCredit);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-credits-hist
     */
    fundingCreditHistory(params, cb = null) {
        const { symbol = '', start, end, limit } = params;
        const url = symbol
            ? `/auth/r/funding/credits/${symbol}/hist`
            : '/auth/r/funding/credits/hist';
        return this._makeAuthRequest(url, {
            start, end, limit
        }, cb, FundingCredit);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-trades-hist
     */
    fundingTrades(params, cb = null) {
        const { symbol = '', start, end, limit } = params;
        const url = symbol
            ? `/auth/r/funding/trades/${symbol}/hist`
            : '/auth/r/funding/trades/hist';
        return this._makeAuthRequest(url, {
            start, end, limit
        }, cb, FundingTrade);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-info-margin
     */
    marginInfo(params = {}, cb = null) {
        const { key = 'base' } = params;
        return this._makeAuthRequest(`/auth/r/info/margin/${key}`, {}, cb, MarginInfo);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-audit-hist
     */
    changeLogs(params = {}, cb = null) {
        const { start, end, limit } = params;
        return this._makeAuthRequest('/auth/r/audit/hist', {
            start, end, limit
        }, cb, ChangeLog);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-info-funding
     */
    fundingInfo(params, cb = null) {
        const { key } = params;
        return this._makeAuthRequest(`/auth/r/info/funding/${key}`, {}, cb);
    }
    /**
     * @see https://docs.bitfinex.com/reference#rest-auth-keep-funding
     */
    keepFunding(params, cb = null) {
        const { type, id } = params;
        return this._makeAuthRequest('/auth/w/funding/keep', { type, id }, cb)
            .then(_takeResNotify);
    }
    /**
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-performance
     */
    performance(params = {}, cb = null) {
        return this._makeAuthRequest('/auth/r/stats/perf:1D/hist', params, cb);
    }
    /**
     * @see https://docs.bitfinex.com/reference/rest-auth-calc-order-avail
     */
    calcAvailableBalance(params, cb = null) {
        return this._makeAuthRequest('/auth/calc/order/avail', params, cb);
    }
    // ---- Symbols & Config ----
    /**
     * Get a list of valid symbol names
     * @see https://docs.bitfinex.com/v2/reference#rest-public-symbols
     */
    symbols(_params = {}, cb = null) {
        return this._makePublicRequest('/conf/pub:list:pair:exchange', cb, (data) => {
            return data && data[0];
        });
    }
    /**
     * Get a list of inactive symbol names
     * @see https://docs.bitfinex.com/v2/reference#rest-public-symbols
     */
    inactiveSymbols(_params = {}, cb = null) {
        return this._makePublicRequest('/conf/pub:list:pair:exchange:inactive', cb, (data) => {
            return data && data[0];
        });
    }
    /**
     * Get a list of valid futures symbol names
     * @see https://docs.bitfinex.com/v2/reference#rest-public-futures
     */
    futures(_params = {}, cb = null) {
        return this._makePublicRequest('/conf/pub:list:pair:futures', cb, (data) => {
            return data && data[0];
        });
    }
    /**
     * Changes the collateral value of an active derivatives position
     * @see https://docs.bitfinex.com/v2/reference#rest-auth-deriv-pos-collateral-set
     */
    derivsPositionCollateralSet(params, cb = null) {
        const { symbol, collateral } = params;
        const isRequestValid = (res) => !!(res && res[0] && res[0][0]);
        return this._makeAuthRequest('/auth/w/deriv/collateral/set', {
            symbol, collateral
        }, cb, isRequestValid);
    }
    /**
     * Get symbol details
     * @see https://docs.bitfinex.com/reference#rest-public-conf
     */
    symbolDetails(params = {}, cb = null) {
        const { includeFuturePairs = true } = params;
        const url = `/conf/pub:info:pair${includeFuturePairs ? ',pub:info:pair:futures' : ''}`;
        const transformer = (data) => {
            return data && this._classTransform(data.flat(), SymbolDetails);
        };
        return this._makePublicRequest(url, cb, transformer);
    }
    /**
     * Request account withdrawal fees
     */
    accountFees(_params = {}, cb = null) {
        const transformer = (data) => {
            return data && this._classTransform(data[0], TransactionFee);
        };
        return this._makePublicRequest('/conf/pub:map:currency:tx:fee', cb, transformer);
    }
    /**
     * Returns a 30-day summary of trading volume and return on margin funding.
     *
     * @returns AccountSummary instance (when transform enabled)
     * @see https://docs.bitfinex.com/reference#rest-auth-summary
     */
    accountSummary(params = {}, cb = null) {
        return this._makeAuthRequest('/auth/r/summary', params, cb, AccountSummary);
    }
    /**
     * Fetch the permissions of the key or token being used
     */
    keyPermissions(params = {}, cb = null) {
        return this._makeAuthRequest('/auth/r/permissions', params, cb, AuthPermission);
    }
    // ---- Position Management ----
    /**
     * @see https://docs.bitfinex.com/reference#rest-auth-submit-order
     */
    closePosition(params, cb = null) {
        return this.positions()
            .then(res => {
            let positions = res;
            if (!this._transform) {
                positions = positions.map(row => new Position(row, this));
            }
            const position = positions
                .find(p => p.id === params.position_id && p.status === 'ACTIVE');
            if (!position)
                throw new Error('position not found');
            return position;
        })
            .then(position => {
            const order = new Order({
                type: Order.type.MARKET,
                symbol: position.symbol,
                amount: position.amount * -1,
                flags: Order.flags.POS_CLOSE
            });
            return this.submitOrder({ order });
        })
            .then(res => this._cb(null, res, cb))
            .catch(err => this._cb(err, null, cb));
    }
    // ---- Settings ----
    /**
     * Update account settings.
     * @see https://docs.bitfinex.com/reference#rest-auth-settings-set
     */
    updateSettings(params, cb = null) {
        const { settings } = params;
        return this._makeAuthRequest('/auth/w/settings/set', { settings }, cb);
    }
    /**
     * Delete account settings by key.
     * @see https://docs.bitfinex.com/reference#rest-auth-settings-del
     */
    deleteSettings(params, cb = null) {
        const { keys } = params;
        return this._makeAuthRequest('/auth/w/settings/del', { keys }, cb);
    }
    /**
     * Retrieve account settings by key.
     * @see https://docs.bitfinex.com/reference#rest-auth-settings
     */
    getSettings(params, cb = null) {
        const { keys } = params;
        return this._makeAuthRequest('/auth/r/settings', { keys }, cb);
    }
    /**
     * Retrieve core platform settings by key.
     * @see https://docs.bitfinex.com/reference#rest-auth-settings-core
     */
    getCoreSettings(params, cb = null) {
        const { keys } = params;
        return this._makeAuthRequest('/auth/r/settings/core', { keys }, cb, CoreSettings);
    }
    // ---- Exchange Rate ----
    /**
     * Get the exchange rate between two currencies.
     */
    async exchangeRate(params, cb = null) {
        const { ccy1, ccy2 } = params;
        const res = await this._makePublicPostRequest('/calc/fx', { ccy1, ccy2 }, null);
        return this._response(res[0], null, cb);
    }
    // ---- Token Management ----
    /**
     * Generate a short-lived authentication token.
     *
     * @param params.scope - Token scope (e.g. `'api'`)
     * @param params.ttl - Time-to-live in seconds
     * @param params.caps - Capabilities array
     * @param params.writePermission - Whether the token has write permissions
     * @see https://docs.bitfinex.com/reference#rest-auth-token
     */
    generateToken(params, cb = null) {
        const opts = omitNil(pick(params || {}, ['ttl', 'scope', 'caps', 'writePermission', '_cust_ip']));
        if (!opts.scope)
            return this._cb(new Error('scope param is required'), null, cb);
        return this._makeAuthRequest('/auth/w/token', opts, cb);
    }
    /**
     * Invalidate (revoke) an authentication token.
     * @see https://docs.bitfinex.com/reference#rest-auth-token-del
     */
    invalidateAuthToken(params, cb = null) {
        const { authToken } = params;
        return this._makeAuthRequest('/auth/w/token/del', { token: authToken }, cb);
    }
    // ---- Orders ----
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
    submitOrder(params, cb = null) {
        const { order } = params;
        const packet = order.toNewOrderPacket();
        if (this._affCode) {
            if (!packet.meta) {
                packet.meta = {};
            }
            const meta = packet.meta;
            meta.aff_code = meta.aff_code || this._affCode;
        }
        return this._makeAuthRequest('/auth/w/order/submit', packet, cb)
            .then((res) => {
            const notify = _takeResNotify(res);
            const orders = notify.notifyInfo || [];
            const data = orders[0] || [];
            return this._transform
                ? this._doTransform(data, Order)
                : data;
        });
    }
    /**
     * Update existing order
     */
    updateOrder(params, cb = null) {
        return this._makeAuthRequest('/auth/w/order/update', params, cb)
            .then(_takeResNotify);
    }
    /**
     * Cancel existing order
     */
    cancelOrder(params, cb = null) {
        const { id } = params;
        return this._makeAuthRequest('/auth/w/order/cancel', { id }, cb)
            .then(_takeResNotify);
    }
    /**
     * Cancel existing order using client ID
     */
    cancelOrderWithCid(params, cb = null) {
        const { cid, date } = params;
        return this._makeAuthRequest('/auth/w/order/cancel', { cid, cid_date: date }, cb)
            .then(_takeResNotify);
    }
    /**
     * Submit multiple orders
     */
    submitOrderMulti(params, cb = null) {
        const { orders } = params;
        if (!Array.isArray(orders)) {
            return this._cb(new Error('orders should be an array'), null, cb);
        }
        const payload = orders.map((order) => {
            const inst = order instanceof Order ? order : new Order(order);
            const pkt = inst.toNewOrderPacket();
            if (this._affCode) {
                const meta = (pkt.meta || {});
                meta.aff_code = meta.aff_code || this._affCode;
                pkt.meta = meta;
            }
            return ['on', pkt];
        });
        return this._makeAuthRequest('/auth/w/order/multi', { ops: payload }, cb)
            .then(_takeResNotify);
    }
    /**
     * Update multiple orders
     */
    updateOrderMulti(params, cb = null) {
        const { orders } = params;
        if (!Array.isArray(orders)) {
            return this._cb(new Error('orders should be an array'), null, cb);
        }
        const payload = orders.map((order) => ['ou', order]);
        return this._makeAuthRequest('/auth/w/order/multi', { ops: payload }, cb)
            .then(_takeResNotify);
    }
    /**
     * Cancel orders by IDs
     */
    cancelOrders(params, cb = null) {
        const { ids } = params;
        if (!Array.isArray(ids)) {
            return this._cb(new Error('ids should be an array'), null, cb);
        }
        const payload = ['oc_multi', { id: ids }];
        return this._makeAuthRequest('/auth/w/order/multi', { ops: [payload] }, cb)
            .then(_takeResNotify);
    }
    /**
     * Send multiple order-related operations
     * @see https://docs.bitfinex.com/reference#rest-auth-order-multi
     */
    orderMultiOp(params, cb = null) {
        let { ops } = params;
        if (!Array.isArray(ops)) {
            return this._cb(new Error('ops should be an array'), null, cb);
        }
        if (ops.some((op) => !Array.isArray(op))) {
            return this._cb(new Error('ops should contain only arrays'), null, cb);
        }
        ops = ops.map((op) => {
            if (op[0] === 'on' && op[1]) {
                const inst = op[1] instanceof Order
                    ? op[1]
                    : new Order(op[1]);
                const pkt = inst.toNewOrderPacket();
                if (this._affCode) {
                    const meta = (pkt.meta || {});
                    meta.aff_code = meta.aff_code || this._affCode;
                    pkt.meta = meta;
                }
                op[1] = pkt;
            }
            return op;
        });
        return this._makeAuthRequest('/auth/w/order/multi', { ops }, cb)
            .then(_takeResNotify);
    }
    /**
     * Cancel multiple orders simultaneously
     * @see https://docs.bitfinex.com/reference#rest-auth-order-cancel-multi
     */
    cancelOrderMulti(params, cb = null) {
        const { id, gid, cid, all } = params;
        const body = {};
        if (id !== undefined)
            body.id = id;
        if (gid !== undefined)
            body.gid = gid;
        if (cid !== undefined)
            body.cid = cid;
        if (all !== undefined)
            body.all = all;
        return this._makeAuthRequest('/auth/w/order/cancel/multi', body, cb)
            .then(_takeResNotify);
    }
    // ---- Position Claims ----
    /**
     * Claim existing open position
     */
    claimPosition(params, cb = null) {
        const { id, amount } = params;
        const body = { id };
        if (amount !== undefined)
            body.amount = String(amount);
        return this._makeAuthRequest('/auth/w/position/claim', body, cb)
            .then(_takeResNotify);
    }
    // ---- Funding Operations ----
    /**
     * Submit a new funding offer.
     *
     * If an `affCode` was set in the constructor options, it is automatically
     * injected into the offer metadata.
     *
     * @param params.offer - A `FundingOffer` model instance (from `bfx-api-node-models`)
     * @see https://docs.bitfinex.com/reference#rest-auth-submit-funding-offer
     */
    submitFundingOffer(params, cb = null) {
        const { offer } = params;
        const packet = offer.toNewOfferPacket();
        if (this._affCode) {
            if (!packet.meta) {
                packet.meta = {};
            }
            const meta = packet.meta;
            meta.aff_code = meta.aff_code || this._affCode;
        }
        return this._makeAuthRequest('/auth/w/funding/offer/submit', packet, cb)
            .then(_takeResNotify);
    }
    /**
     * Cancel existing funding offer
     */
    cancelFundingOffer(params, cb = null) {
        const { id } = params;
        return this._makeAuthRequest('/auth/w/funding/offer/cancel', { id }, cb)
            .then(_takeResNotify);
    }
    /**
     * Cancel all existing funding offers
     */
    cancelAllFundingOffers(params, cb = null) {
        const { currency } = params;
        return this._makeAuthRequest('/auth/w/funding/offer/cancel/all', { currency }, cb)
            .then(_takeResNotify);
    }
    /**
     * Close funding
     */
    closeFunding(params, cb = null) {
        const { id, type } = params;
        return this._makeAuthRequest('/auth/w/funding/close', { id, type }, cb)
            .then(_takeResNotify);
    }
    /**
     * Submit automatic funding
     */
    submitAutoFunding(params, cb = null) {
        const { status, currency, amount, rate, period } = params;
        return this._makeAuthRequest('/auth/w/funding/auto', { status, currency, amount, rate, period }, cb)
            .then(_takeResNotify);
    }
    // ---- Transfers & Deposits ----
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
    transfer(params, cb = null) {
        const opts = pick(params, ['amount', 'from', 'to', 'currency']);
        opts.currency_to = params.currencyTo;
        return this._makeAuthRequest('/auth/w/transfer', opts, cb)
            .then(_takeResNotify);
    }
    /**
     * Get or generate a deposit address for the given wallet and method.
     * @see https://docs.bitfinex.com/reference#rest-auth-deposit-address
     */
    getDepositAddress(params, cb = null) {
        const opts = pick(params, ['wallet', 'method']);
        opts.op_renew = params.opRenew;
        return this._makeAuthRequest('/auth/w/deposit/address', opts, cb)
            .then(_takeResNotify);
    }
    /**
     * Request a withdrawal from the platform.
     * @see https://docs.bitfinex.com/reference#rest-auth-withdraw
     */
    withdraw(params, cb = null) {
        return this._makeAuthRequest('/auth/w/withdraw', params, cb)
            .then(_takeResNotify);
    }
    /**
     * @see https://docs.bitfinex.com/reference#rest-auth-deposit-invoice
     */
    generateInvoice(params, cb = null) {
        const { currency, wallet, amount } = params;
        return this._makeAuthRequest('/auth/w/deposit/invoice', { currency, wallet, amount }, cb, Invoice);
    }
    /**
     * @see https://docs.bitfinex.com/reference/lnx-invoice-payments
     */
    lnxInvoicePayments(params, cb = null) {
        const { action, query } = params;
        return this._makeAuthRequest('/auth/r/ext/invoice/payments', { action, query }, cb);
    }
    // ---- Recurring Algo Orders ----
    /**
     * Create a new recurring algorithmic order.
     */
    submitRecurringAlgoOrder(params = { order: {} }, cb = null) {
        const { order } = params;
        return this._makeAuthRequest('/auth/w/ext/recurring-ao/create', order, cb);
    }
    /**
     * Retrieve details for a specific recurring algorithmic order.
     */
    getRecurringAlgoOrder(params = { algoOrderId: '' }, cb = null) {
        const { algoOrderId } = params;
        return this._makeAuthRequest(`/auth/r/ext/recurring-ao/detail/${algoOrderId}`, {}, cb);
    }
    /**
     * Update an existing recurring algorithmic order.
     */
    updateRecurringAlgoOrder(params = { order: { algoOrderId: '' } }, cb = null) {
        const { order } = params;
        return this._makeAuthRequest(`/auth/w/ext/recurring-ao/update/${order.algoOrderId}`, order, cb);
    }
    /**
     * Cancel a recurring algorithmic order.
     */
    cancelRecurringAlgoOrder(params = { algoOrderId: '' }, cb = null) {
        const { algoOrderId } = params;
        return this._makeAuthRequest(`/auth/w/ext/recurring-ao/cancel/${algoOrderId}`, {}, cb);
    }
    /**
     * List all recurring algorithmic orders.
     */
    getRecurringAlgoOrders(params = {}, cb = null) {
        return this._makeAuthRequest('/auth/r/ext/recurring-ao/list', params, cb);
    }
    /**
     * List child orders generated by recurring algorithmic orders.
     */
    getRecurringAoOrders(params = {}, cb = null) {
        return this._makeAuthRequest('/auth/r/ext/recurring-ao/order/list', params, cb);
    }
    // ---- Currency Conversion ----
    /**
     * Convert between currencies
     */
    currencyConversion(params, cb = null) {
        const { ccy1, ccy2, amount } = params;
        return this._makeAuthRequest('/auth/w/ext/currency/conversion', { ccy1, ccy2, amount }, cb);
    }
}
export default RESTv2;
//# sourceMappingURL=rest2.js.map