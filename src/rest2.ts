import Debug from 'debug'
import BfxUtil from 'bfx-api-node-util'
import Models from 'bfx-api-node-models'

const { genAuthSig, nonce, isClass } = BfxUtil
const {
  FundingCredit,
  FundingLoan,
  FundingOffer,
  FundingTrade,
  MarginInfo,
  Order,
  Position,
  Trade,
  PublicTrade,
  TradingTicker,
  TradingTickerHist,
  FundingTicker,
  FundingTickerHist,
  Wallet,
  WalletHist,
  Alert,
  Candle,
  Movement,
  MovementInfo,
  LedgerEntry,
  Liquidations,
  UserInfo,
  Currency,
  StatusMessagesDeriv,
  Notification,
  Login,
  ChangeLog,
  Invoice,
  SymbolDetails,
  TransactionFee,
  AccountSummary,
  AuthPermission,
  CoreSettings,
  WeightedAverages
} = Models

const debug = Debug('bfx:rest2')

const BASE_TIMEOUT = 15000
const API_URL = 'https://api.bitfinex.com'

// --- Utility functions (lodash replacements) ---

function omitNil (obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v != null)
  )
}

function pick<T extends Record<string, unknown>> (obj: T, keys: string[]): Partial<T> {
  return Object.fromEntries(
    keys.filter(k => k in obj).map(k => [k, obj[k]])
  ) as Partial<T>
}

// --- Types ---

/** Node-style callback: `(err, result)` */
export type Callback = (err: Error | null, res?: unknown) => void
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Transformer = (new (...args: any[]) => unknown) | ((data: unknown) => unknown) | null
type FetchFn = typeof globalThis.fetch

/**
 * Error returned by the Bitfinex API.
 *
 * Extends the standard `Error` with HTTP status, API error code, and the raw response body.
 */
export interface APIError extends Error {
  /** HTTP status code (e.g. 400, 500) */
  status?: number
  /** HTTP status text (e.g. "Bad Request") */
  statustext?: string
  /** Bitfinex API error code (e.g. 10010 for rate limit, 10114 for nonce too small) */
  code?: number | string
  /** Parsed response body — may be a string, object, or the raw error message from the API */
  response?: unknown
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
  affCode?: string | null
  /** Bitfinex API key for authenticated requests */
  apiKey?: string
  /** Bitfinex API secret for signing authenticated requests */
  apiSecret?: string
  /** Auth token — takes priority over apiKey/apiSecret when set */
  authToken?: string
  /** Company identifier used for currency configuration endpoints */
  company?: string
  /** Base API URL. Default: `'https://api.bitfinex.com'` */
  url?: string
  /** When `true`, responses are transformed into model class instances from `bfx-api-node-models`. Default: `false` */
  transform?: boolean
  /** Request timeout in milliseconds. Must be a positive integer. Default: `15000` */
  timeout?: number
  /** Custom fetch function for proxy support or testing. Default: `globalThis.fetch` */
  fetch?: FetchFn
}

interface PaginationParams {
  start?: number
  end?: number
  limit?: number
  sort?: number
}

// --- Helper ---

type BfxNotification = InstanceType<typeof Notification>

function _takeResNotify (data: unknown): BfxNotification {
  return new Notification(data as unknown[])
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
  static url = API_URL

  private _url: string
  private _apiKey: string
  private _apiSecret: string
  private _authToken: string
  private _company: string
  private _transform: boolean
  private _timeout: number
  private _affCode: string | null | undefined
  private _fetch: FetchFn

  constructor (opts: RESTv2Options = {}) {
    this._checkOpts(opts)

    this._url = opts.url || API_URL
    this._apiKey = opts.apiKey || ''
    this._apiSecret = opts.apiSecret || ''
    this._authToken = opts.authToken || ''
    this._company = opts.company || ''
    this._transform = !!opts.transform
    this._affCode = opts.affCode
    this._timeout = Number.isInteger(opts.timeout as number)
      ? opts.timeout as number
      : BASE_TIMEOUT
    this._fetch = opts.fetch || globalThis.fetch
  }

  /**
   * Check constructor options
   * @throws Error if timeout is not an integer
   */
  private _checkOpts (opts: RESTv2Options): void {
    if (
      opts.timeout != null &&
      !Number.isInteger(opts.timeout)
    ) {
      throw new Error('ERR_TIMEOUT_DATA_TYPE_ERROR')
    }
  }

  /** @returns The endpoint URL */
  getURL (): string {
    return this._url
  }

  /** @returns Whether a custom fetch function was provided */
  usesAgent (): boolean {
    return this._fetch !== globalThis.fetch
  }

  private async _request (
    url: string,
    reqOpts: RequestInit,
    transformer: Transformer,
    cb: Callback | null
  ): Promise<unknown> {
    try {
      const resp = await this._fetch(url, reqOpts)
      const raw = await resp.text()
      if (!resp.ok) {
        throw this._apiError(resp, raw)
      }
      const json = JSON.parse(raw)
      return this._response(json, transformer, cb)
    } catch (err) {
      return this._cb(err as Error, null, cb)
    }
  }

  private _apiError (resp: Response, rawBody: string): APIError {
    const err: APIError = new Error(`HTTP code ${resp.status} ${resp.statusText || ''}`)
    err.status = resp.status
    err.statustext = resp.statusText
    try {
      const parsed = JSON.parse(rawBody)
      if (Array.isArray(parsed) && parsed.length >= 3) {
        err.code = parsed[1]
        err.response = parsed[2]
      } else {
        err.response = parsed
      }
    } catch {
      err.response = rawBody
    }
    return err
  }

  /**
   * Make an authenticated request
   */
  async _makeAuthRequest (
    path: string,
    payload: Record<string, unknown> = {},
    cb: Callback | null,
    transformer?: Transformer
  ): Promise<unknown> {
    if ((!this._apiKey || !this._apiSecret) && !this._authToken) {
      const e = new Error('missing api key or secret')
      return this._cb(e, null, cb)
    }

    const url = `${this._url}/v2${path}`
    const n = nonce()
    const sanitizedPayload = omitNil(payload)
    const keys = (): Record<string, string> => {
      const sigPayload = `/api/v2${path}${n}${JSON.stringify(sanitizedPayload)}`
      const { sig } = genAuthSig(this._apiSecret, sigPayload)
      return { 'bfx-apikey': this._apiKey, 'bfx-signature': sig }
    }
    const auth = this._authToken
      ? { 'bfx-token': this._authToken }
      : keys()

    debug('POST %s', url)

    const reqOpts: RequestInit = {
      method: 'POST',
      signal: AbortSignal.timeout(this._timeout),
      headers: {
        'content-type': 'application/json',
        'bfx-nonce': n,
        ...auth
      },
      body: JSON.stringify(sanitizedPayload)
    }

    return this._request(url, reqOpts, transformer ?? null, cb)
  }

  /**
   * Make a public GET request
   */
  async _makePublicRequest (
    path: string,
    cb: Callback | null,
    transformer?: Transformer
  ): Promise<unknown> {
    if ((cb !== null && cb !== undefined) && typeof cb !== 'function') {
      throw new Error('_makePublicRequest cb param must be a function')
    }
    const url = `${this._url}/v2${path}`

    debug('GET %s', url)

    const reqOpts: RequestInit = {
      method: 'GET',
      signal: AbortSignal.timeout(this._timeout)
    }

    return this._request(url, reqOpts, transformer ?? null, cb)
  }

  /**
   * Make a public POST request
   */
  async _makePublicPostRequest (
    path: string,
    payload: Record<string, unknown>,
    cb: Callback | null,
    transformer?: Transformer
  ): Promise<unknown> {
    const url = `${this._url}/v2${path}`

    debug('POST %s', url)

    const sanitizedPayload = omitNil(payload)

    const reqOpts: RequestInit = {
      method: 'POST',
      signal: AbortSignal.timeout(this._timeout),
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(sanitizedPayload)
    }

    return this._request(url, reqOpts, transformer ?? null, cb)
  }

  private _doTransform (data: unknown, transformer: Transformer): unknown {
    if (isClass(transformer)) {
      return this._classTransform(data, transformer as new (...args: unknown[]) => unknown)
    } else if (typeof transformer === 'function') {
      return (transformer as (data: unknown) => unknown)(data)
    }
    return data
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _classTransform (data: unknown, ModelClass: new (...args: any[]) => unknown): unknown {
    if (!data || (Array.isArray(data) && data.length === 0)) return []
    if (!ModelClass || !this._transform) return data

    if (Array.isArray(data) && Array.isArray(data[0])) {
      return data.map(row => new ModelClass(row, this))
    }

    return new ModelClass(data, this)
  }

  _response (data: unknown, transformer: Transformer, cb: Callback | null): unknown {
    try {
      const res = this._transform
        ? this._doTransform(data, transformer)
        : data

      return this._cb(null, res, cb)
    } catch (e) {
      return this._cb(e as Error, null, cb)
    }
  }

  _cb (err: Error | null, res: unknown, cb: Callback | null | undefined): unknown {
    const isCbFunc = typeof cb === 'function'

    if (err) {
      const errRecord = err as unknown as Record<string, unknown>
      if (errRecord.error && Array.isArray(errRecord.error) && errRecord.error[1] === 10114) {
        err.message += ' see https://github.com/bitfinexcom/bitfinex-api-node/blob/master/README.md#nonce-too-small for help'
      }
      return isCbFunc ? cb!(err) : Promise.reject(err)
    }

    return isCbFunc ? cb!(null, res) : Promise.resolve(res)
  }

  /**
   * @returns merged arr of currencies and names sorted with no pairs repeated adding pool and explorer to each
   */
  private _genCurrencyList (data: unknown): unknown {
    if (!Array.isArray(data) || data.length !== 6) {
      return data
    }

    const transformArrToObj = (arr: unknown[]): Record<string, unknown> => {
      const obj: Record<string, unknown> = {}
      arr.forEach((c) => {
        if (!Array.isArray(c)) {
          obj[c as string] = c
        } else if (c.length > 1) {
          obj[c[0] as string] = c[1]
        }
      })
      return obj
    }

    const listedCurr = transformArrToObj(data[0] as unknown[])
    const mapedCurrSym = transformArrToObj(data[1] as unknown[])
    const mapedCurrLabel = transformArrToObj(data[2] as unknown[])
    const pool = transformArrToObj(data[3] as unknown[])
    const explorer = transformArrToObj(data[4] as unknown[]) as Record<string, unknown>
    const walletFx = transformArrToObj(data[5] as unknown[])

    const allCurrObj: Record<string, unknown> = {
      ...listedCurr,
      ...mapedCurrSym,
      ...mapedCurrLabel
    }

    // Assign explorers of pool to currencies
    Object.keys(pool).forEach((key) => {
      if (!explorer[key]) {
        const poolKey = pool[key] as string
        if (explorer[poolKey]) {
          explorer[key] = explorer[poolKey]
        }
      }
    })

    const allCurArr: unknown[][] = []
    Object.keys(allCurrObj).forEach((key) => {
      const cPool = pool[key] || null
      const cExpl = explorer[key] || []
      const cName = allCurrObj[key]
      const cSymbol = mapedCurrSym[key] || key
      const cWfx = walletFx[key] || []
      allCurArr.push([key, cName, cPool, cExpl, cSymbol, cWfx])
    })

    return allCurArr
  }

  // ---- Public Market Data ----

  /**
   * Retrieve the order book for a symbol at a given precision level.
   *
   * @param params.symbol - Trading symbol (e.g. `'tBTCUSD'`)
   * @param params.prec - Price aggregation level: `'P0'` (default), `'P1'`, `'P2'`, `'P3'`, `'P4'`, or `'R0'` (raw)
   * @see https://docs.bitfinex.com/v2/reference#rest-public-books
   */
  orderBook (params: { symbol: string; prec: string }, cb: Callback | null = null) {
    const { symbol, prec } = params
    return this._makePublicRequest(`/book/${symbol}/${prec}`, cb)
  }

  /**
   * @see https://docs.bitfinex.com/reference#rest-public-calc-market-average-price
   */
  marketAveragePrice (params: { symbol: string; amount: number; period?: string; rate_limit?: string }, cb: Callback | null = null) {
    const usp = new URLSearchParams(params as unknown as Record<string, string>)
    return this._makePublicPostRequest(`/calc/trade/avg?${usp.toString()}`, {}, cb)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-public-platform-status
   */
  status (_params: Record<string, unknown> = {}, cb: Callback | null = null) {
    return this._makePublicRequest('/platform/status', cb)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#status
   */
  statusMessages (params: { type?: string; keys?: string[] } = {}, cb: Callback | null = null) {
    const { type = 'deriv', keys = ['ALL'] } = params
    const url = `/status/${type}?keys=${keys.join(',')}`
    const transformer = (type === 'deriv') ? StatusMessagesDeriv : null
    return this._makePublicRequest(url, cb, transformer)
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
  ticker (params: { symbol: string }, cb: Callback | null = null) {
    const { symbol } = params
    const transformer = (data: unknown) => {
      const ticker = [symbol, ...(data as unknown[])]
      return (symbol[0] === 't')
        ? new TradingTicker(ticker)
        : new FundingTicker(ticker)
    }
    return this._makePublicRequest(`/ticker/${symbol}`, cb, transformer)
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
  tickers (params: { symbols?: string[] } = {}, cb: Callback | null = null) {
    const { symbols = [] } = params
    const transformer = (data: unknown) => {
      return (data as unknown[][]).map(ticker => (
        ((ticker[0] as string) || '')[0] === 't'
          ? new TradingTicker(ticker)
          : new FundingTicker(ticker)
      ))
    }
    const url = `/tickers?symbols=${symbols.length ? symbols.join(',') : 'ALL'}`
    return this._makePublicRequest(url, cb, transformer)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-public-tickers-history
   */
  tickersHistory (params: { symbols?: string[]; start?: number; end?: number; limit?: number } = {}, cb: Callback | null = null) {
    const { symbols = [], start, end, limit = 250 } = params
    const transformer = (data: unknown) => {
      return (data as unknown[][]).map(ticker => (
        ((ticker[0] as string) || '')[0] === 't'
          ? new TradingTickerHist(ticker)
          : new FundingTickerHist(ticker)
      ))
    }

    const s = start ? `&start=${start}` : ''
    const e = end ? `&end=${end}` : ''
    const query = `?symbols=${symbols.length ? symbols.join(',') : 'ALL'}${s}${e}&limit=${limit}`
    const url = `/tickers/hist${query}`

    return this._makePublicRequest(url, cb, transformer)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-public-stats
   */
  stats (params: { key: string; context: string }, cb: Callback | null = null) {
    const { key, context } = params
    return this._makePublicRequest(`/stats1/${key}/${context}`, cb)
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
  candles (params: { timeframe: string; symbol: string; section: string; query?: Record<string, string> }, cb: Callback | null = null) {
    const { timeframe, symbol, section, query = {} } = params
    let url = `/candles/trade:${timeframe}:${symbol}/${section}`

    if (Object.keys(query).length > 0) {
      url += `?${new URLSearchParams(query).toString()}`
    }

    return this._makePublicRequest(url, cb, Candle)
  }

  /**
   * Query configuration information
   */
  conf (params: { keys?: string[] } = {}, cb: Callback | null = null) {
    const { keys = [] } = params
    if (keys.length === 0) {
      return this._response([], null, cb)
    }

    const url = `/conf/${keys.join(',')}`
    return this._makePublicRequest(url, cb)
  }

  /**
   * Get a list of valid currencies ids, full names, pool and explorer
   * @see https://docs.bitfinex.com/v2/reference#rest-public-currencies
   */
  async currencies (_params: Record<string, unknown> = {}, cb: Callback | null = null) {
    const suffix = this._company ? ':' + this._company : ''
    const url = `/conf/${[
      `pub:list:currency${suffix}`,
      `pub:map:currency:sym${suffix}`,
      `pub:map:currency:label${suffix}`,
      `pub:map:currency:pool${suffix}`,
      `pub:map:currency:explorer${suffix}`,
      `pub:map:currency:wfx${suffix}`
    ].join(',')}`

    return this._makePublicRequest(url, cb, (data: unknown) => {
      const res = this._genCurrencyList(data)
      return this._doTransform(res, Currency)
    })
  }

  // ---- Alerts ----

  /**
   * Retrieve price alerts for the authenticated user.
   *
   * @param params.type - Alert type (e.g. `'price'`)
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-alert-list
   */
  alertList (params: { type: string }, cb: Callback | null = null) {
    const { type } = params
    return this._makeAuthRequest('/auth/r/alerts', { type }, cb, Alert)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-alert-set
   */
  alertSet (params: { type: string; symbol: string; price: number }, cb: Callback | null = null) {
    const { type, symbol, price } = params
    return this._makeAuthRequest('/auth/w/alert/set', { type, symbol, price }, cb, Alert)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-alert-delete
   */
  alertDelete (params: { symbol: string; price: number }, cb: Callback | null = null) {
    const { symbol, price } = params
    return this._makeAuthRequest('/auth/w/alert/del', { symbol, price }, cb)
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
  trades (params: { symbol: string } & PaginationParams, cb: Callback | null = null) {
    const { symbol, start, end, limit, sort } = params
    const query = omitNil({ start, end, limit, sort } as Record<string, unknown>)

    let url = `/trades/${symbol}/hist`

    if (Object.keys(query).length > 0) {
      url += `?${new URLSearchParams(query as Record<string, string>).toString()}`
    }

    return this._makePublicRequest(url, cb, PublicTrade)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-public-liquidations
   */
  liquidations (params: PaginationParams = {}, cb: Callback | null = null) {
    const { start, end, limit, sort } = params
    const query = omitNil({ start, end, limit, sort } as Record<string, unknown>)

    let url = '/liquidations/hist'

    if (Object.keys(query).length > 0) {
      url += `?${new URLSearchParams(query as Record<string, string>).toString()}`
    }

    return this._makePublicRequest(url, cb, Liquidations)
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
  accountTrades (params: { symbol?: string } & PaginationParams = {}, cb: Callback | null = null) {
    const { symbol, start, end, limit, sort } = params
    const url = symbol
      ? `/auth/r/trades/${symbol}/hist`
      : '/auth/r/trades/hist'

    return this._makeAuthRequest(url, {
      start, end, limit, sort
    }, cb, Trade)
  }

  /**
   * Get weighted averages of trades
   */
  getWeightedAverages (params: { symbol?: string; start?: number; end?: number; limit?: number } = {}, cb: Callback | null = null) {
    const { symbol, start, end, limit } = params
    return this._makeAuthRequest('/auth/r/trades/calc', {
      symbol, start, end, limit
    }, cb, WeightedAverages)
  }

  // ---- User ----

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-logins-hist
   */
  logins (params: { start?: number; end?: number; limit?: number } = {}, cb: Callback | null = null) {
    const { start, end, limit } = params
    return this._makeAuthRequest('/auth/r/logins/hist', {
      start, end, limit
    }, cb, Login)
  }

  /**
   * Retrieve all wallets (exchange, margin, funding) for the authenticated user.
   *
   * @returns Array of Wallet instances (when transform enabled)
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-wallets
   */
  wallets (params: Record<string, unknown> = {}, cb: Callback | null = null) {
    return this._makeAuthRequest('/auth/r/wallets', params, cb, Wallet)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-wallets-hist
   */
  walletsHistory (params: { end?: number; currency?: string } = {}, cb: Callback | null = null) {
    return this._makeAuthRequest('/auth/r/wallets/hist', params, cb, WalletHist)
  }

  /**
   * @see https://docs.bitfinex.com/reference#rest-auth-info-user
   */
  userInfo (params: Record<string, unknown> = {}, cb: Callback | null = null) {
    return this._makeAuthRequest('/auth/r/info/user', params, cb, UserInfo)
  }

  // ---- Orders ----

  /**
   * Retrieve all active orders for the authenticated user.
   *
   * @returns Array of Order instances (when transform enabled)
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-orders
   */
  activeOrders (params: Record<string, unknown> = {}, cb: Callback | null = null) {
    return this._makeAuthRequest('/auth/r/orders', params, cb, Order)
  }

  /**
   * Retrieve active orders by their IDs.
   *
   * @param params.ids - Array of order IDs to retrieve
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-orders
   */
  activeOrdersWithIds (params: { ids: number[] }, cb: Callback | null = null) {
    const { ids } = params
    return this._makeAuthRequest('/auth/r/orders', { id: ids }, cb, Order)
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
  movements (params: { ccy?: string; start?: number; end?: number; limit?: number; id?: number[]; address?: string } = {}, cb: Callback | null = null) {
    const { ccy, start, end, limit = 25, id, address } = params
    const url = ccy
      ? `/auth/r/movements/${ccy}/hist`
      : '/auth/r/movements/hist'

    return this._makeAuthRequest(url, { start, end, limit, id, address }, cb, Movement)
  }

  /**
   * @see https://docs.bitfinex.com/reference/movement-info
   */
  movementInfo (params: { id: number }, cb: Callback | null = null) {
    const { id } = params
    return this._makeAuthRequest('/auth/r/movements/info', { id }, cb, MovementInfo)
  }

  // ---- Ledgers ----

  /**
   * @see https://docs.bitfinex.com/v2/reference#ledgers
   */
  ledgers (params: { filters: string | { ccy?: string; category?: number }; start?: number; end?: number; limit?: number }, cb: Callback | null = null) {
    const { filters, start, end, limit = 25 } = params
    const parseFilters = (sent: string | Record<string, unknown>) => {
      if (typeof sent === 'string') return { ccy: sent }
      return sent || {}
    }

    const { ccy, category } = parseFilters(filters) as { ccy?: string; category?: number }
    const url = ccy
      ? `/auth/r/ledgers/${ccy}/hist`
      : '/auth/r/ledgers/hist'

    return this._makeAuthRequest(url, {
      start, end, limit, category
    }, cb, LedgerEntry)
  }

  // ---- Order History ----

  /**
   * @see https://docs.bitfinex.com/reference#rest-auth-orders-history
   */
  orderHistory (params: { symbol?: string; start?: number; end?: number; limit?: number } = {}, cb: Callback | null = null) {
    const { symbol, start, end, limit } = params
    const url = symbol
      ? `/auth/r/orders/${symbol}/hist`
      : '/auth/r/orders/hist'

    return this._makeAuthRequest(url, {
      start, end, limit
    }, cb, Order)
  }

  /**
   * @see https://docs.bitfinex.com/reference#rest-auth-orders-history
   */
  orderHistoryWithIds (params: { ids: number[] }, cb: Callback | null = null) {
    const { ids } = params
    return this._makeAuthRequest('/auth/r/orders/hist', { id: ids }, cb, Order)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-order-trades
   */
  orderTrades (params: { symbol: string; orderId: number; start?: number; end?: number; limit?: number }, cb: Callback | null = null) {
    const { symbol, start, end, limit, orderId } = params
    return this._makeAuthRequest(`/auth/r/order/${symbol}:${orderId}/trades`, {
      start, end, limit
    }, cb, Trade)
  }

  // ---- Positions ----

  /**
   * Retrieve all active positions for the authenticated user.
   *
   * @returns Array of Position instances (when transform enabled)
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-positions
   */
  positions (params: Record<string, unknown> = {}, cb: Callback | null = null) {
    return this._makeAuthRequest('/auth/r/positions', params, cb, Position)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-positions-history
   */
  positionsHistory (params: { start?: number; end?: number; limit?: number } = {}, cb: Callback | null = null) {
    const { start, end, limit = 50 } = params
    return this._makeAuthRequest('/auth/r/positions/hist', {
      start, end, limit
    }, cb, Position)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-positions-audit
   */
  positionsAudit (params: { id?: number[]; start?: number; end?: number; limit?: number } = {}, cb: Callback | null = null) {
    const { id, start, end, limit = 250 } = params
    return this._makeAuthRequest('/auth/r/positions/audit', {
      id, start, end, limit
    }, cb, Position)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-positions-snap
   */
  positionsSnapshot (params: { start?: number; end?: number; limit?: number } = {}, cb: Callback | null = null) {
    const { start, end, limit = 50 } = params
    return this._makeAuthRequest('/auth/r/positions/snap', {
      start, end, limit
    }, cb, Position)
  }

  // ---- Funding ----

  /**
   * Retrieve active funding offers for a given currency.
   *
   * @param params.symbol - Funding currency symbol (e.g. `'fUSD'`)
   * @returns Array of FundingOffer instances (when transform enabled)
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-offers
   */
  fundingOffers (params: { symbol: string }, cb: Callback | null = null) {
    const { symbol } = params
    return this._makeAuthRequest(`/auth/r/funding/offers/${symbol}`, {}, cb, FundingOffer)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-offers-hist
   */
  fundingOfferHistory (params: { symbol?: string; start?: number; end?: number; limit?: number }, cb: Callback | null = null) {
    const { symbol = '', start, end, limit } = params
    const url = symbol
      ? `/auth/r/funding/offers/${symbol}/hist`
      : '/auth/r/funding/offers/hist'
    return this._makeAuthRequest(url, {
      start, end, limit
    }, cb, FundingOffer)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-loans
   */
  fundingLoans (params: { symbol: string }, cb: Callback | null = null) {
    const { symbol } = params
    return this._makeAuthRequest(`/auth/r/funding/loans/${symbol}`, {}, cb, FundingLoan)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-loans-hist
   */
  fundingLoanHistory (params: { symbol?: string; start?: number; end?: number; limit?: number }, cb: Callback | null = null) {
    const { symbol = '', start, end, limit } = params
    const url = symbol
      ? `/auth/r/funding/loans/${symbol}/hist`
      : '/auth/r/funding/loans/hist'
    return this._makeAuthRequest(url, {
      start, end, limit
    }, cb, FundingLoan)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-credits
   */
  fundingCredits (params: { symbol: string }, cb: Callback | null = null) {
    const { symbol } = params
    return this._makeAuthRequest(`/auth/r/funding/credits/${symbol}`, {}, cb, FundingCredit)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-credits-hist
   */
  fundingCreditHistory (params: { symbol?: string; start?: number; end?: number; limit?: number }, cb: Callback | null = null) {
    const { symbol = '', start, end, limit } = params
    const url = symbol
      ? `/auth/r/funding/credits/${symbol}/hist`
      : '/auth/r/funding/credits/hist'
    return this._makeAuthRequest(url, {
      start, end, limit
    }, cb, FundingCredit)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-funding-trades-hist
   */
  fundingTrades (params: { symbol?: string; start?: number; end?: number; limit?: number }, cb: Callback | null = null) {
    const { symbol = '', start, end, limit } = params
    const url = symbol
      ? `/auth/r/funding/trades/${symbol}/hist`
      : '/auth/r/funding/trades/hist'

    return this._makeAuthRequest(url, {
      start, end, limit
    }, cb, FundingTrade)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-info-margin
   */
  marginInfo (params: { key?: string } = {}, cb: Callback | null = null) {
    const { key = 'base' } = params
    return this._makeAuthRequest(`/auth/r/info/margin/${key}`, {}, cb, MarginInfo)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-audit-hist
   */
  changeLogs (params: { start?: number; end?: number; limit?: number } = {}, cb: Callback | null = null) {
    const { start, end, limit } = params
    return this._makeAuthRequest('/auth/r/audit/hist', {
      start, end, limit
    }, cb, ChangeLog)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-info-funding
   */
  fundingInfo (params: { key: string }, cb: Callback | null = null) {
    const { key } = params
    return this._makeAuthRequest(`/auth/r/info/funding/${key}`, {}, cb)
  }

  /**
   * @see https://docs.bitfinex.com/reference#rest-auth-keep-funding
   */
  keepFunding (params: { type: string; id: string | number }, cb: Callback | null = null) {
    const { type, id } = params
    return (this._makeAuthRequest('/auth/w/funding/keep', { type, id }, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-performance
   */
  performance (params: Record<string, unknown> = {}, cb: Callback | null = null) {
    return this._makeAuthRequest('/auth/r/stats/perf:1D/hist', params, cb)
  }

  /**
   * @see https://docs.bitfinex.com/reference/rest-auth-calc-order-avail
   */
  calcAvailableBalance (params: { symbol: string; type: string; dir?: string; rate?: number; lev?: string }, cb: Callback | null = null) {
    return this._makeAuthRequest('/auth/calc/order/avail', params, cb)
  }

  // ---- Symbols & Config ----

  /**
   * Get a list of valid symbol names
   * @see https://docs.bitfinex.com/v2/reference#rest-public-symbols
   */
  symbols (_params: Record<string, unknown> = {}, cb: Callback | null = null) {
    return this._makePublicRequest('/conf/pub:list:pair:exchange', cb, (data: unknown) => {
      return data && (data as unknown[])[0]
    })
  }

  /**
   * Get a list of inactive symbol names
   * @see https://docs.bitfinex.com/v2/reference#rest-public-symbols
   */
  inactiveSymbols (_params: Record<string, unknown> = {}, cb: Callback | null = null) {
    return this._makePublicRequest('/conf/pub:list:pair:exchange:inactive', cb, (data: unknown) => {
      return data && (data as unknown[])[0]
    })
  }

  /**
   * Get a list of valid futures symbol names
   * @see https://docs.bitfinex.com/v2/reference#rest-public-futures
   */
  futures (_params: Record<string, unknown> = {}, cb: Callback | null = null) {
    return this._makePublicRequest('/conf/pub:list:pair:futures', cb, (data: unknown) => {
      return data && (data as unknown[])[0]
    })
  }

  /**
   * Changes the collateral value of an active derivatives position
   * @see https://docs.bitfinex.com/v2/reference#rest-auth-deriv-pos-collateral-set
   */
  derivsPositionCollateralSet (params: { symbol: string; collateral: number }, cb: Callback | null = null) {
    const { symbol, collateral } = params
    const isRequestValid = (res: unknown) => !!(res && (res as unknown[][])[0] && (res as unknown[][])[0][0])
    return this._makeAuthRequest('/auth/w/deriv/collateral/set', {
      symbol, collateral
    }, cb, isRequestValid)
  }

  /**
   * Get symbol details
   * @see https://docs.bitfinex.com/reference#rest-public-conf
   */
  symbolDetails (params: { includeFuturePairs?: boolean } = {}, cb: Callback | null = null) {
    const { includeFuturePairs = true } = params
    const url = `/conf/pub:info:pair${includeFuturePairs ? ',pub:info:pair:futures' : ''}`

    const transformer = (data: unknown) => {
      return data && this._classTransform((data as unknown[][]).flat(), SymbolDetails)
    }

    return this._makePublicRequest(url, cb, transformer)
  }

  /**
   * Request account withdrawal fees
   */
  accountFees (_params: Record<string, unknown> = {}, cb: Callback | null = null) {
    const transformer = (data: unknown) => {
      return data && this._classTransform((data as unknown[][])[0], TransactionFee)
    }
    return this._makePublicRequest('/conf/pub:map:currency:tx:fee', cb, transformer)
  }

  /**
   * Returns a 30-day summary of trading volume and return on margin funding.
   *
   * @returns AccountSummary instance (when transform enabled)
   * @see https://docs.bitfinex.com/reference#rest-auth-summary
   */
  accountSummary (params: Record<string, unknown> = {}, cb: Callback | null = null) {
    return this._makeAuthRequest('/auth/r/summary', params, cb, AccountSummary)
  }

  /**
   * Fetch the permissions of the key or token being used
   */
  keyPermissions (params: Record<string, unknown> = {}, cb: Callback | null = null) {
    return this._makeAuthRequest('/auth/r/permissions', params, cb, AuthPermission)
  }

  // ---- Position Management ----

  /**
   * @see https://docs.bitfinex.com/reference#rest-auth-submit-order
   */
  closePosition (params: { position_id: number }, cb: Callback | null = null) {
    return (this.positions() as Promise<unknown>)
      .then(res => {
        let positions = res as unknown[]
        if (!this._transform) {
          positions = positions.map(row => new Position(row as unknown[], this))
        }

        const position = (positions as Array<{ id: number; status: string; symbol: string; amount: number }>)
          .find(p => p.id === params.position_id && p.status === 'ACTIVE')
        if (!position) throw new Error('position not found')

        return position
      })
      .then(position => {
        const order = new Order({
          type: Order.type.MARKET,
          symbol: position.symbol,
          amount: position.amount * -1,
          flags: Order.flags.POS_CLOSE
        })

        return this.submitOrder({ order })
      })
      .then(res => this._cb(null, res, cb))
      .catch(err => this._cb(err, null, cb))
  }

  // ---- Settings ----

  /**
   * Update account settings.
   * @see https://docs.bitfinex.com/reference#rest-auth-settings-set
   */
  updateSettings (params: { settings: Record<string, unknown> }, cb: Callback | null = null) {
    const { settings } = params
    return this._makeAuthRequest('/auth/w/settings/set', { settings }, cb)
  }

  /**
   * Delete account settings by key.
   * @see https://docs.bitfinex.com/reference#rest-auth-settings-del
   */
  deleteSettings (params: { keys: string[] }, cb: Callback | null = null) {
    const { keys } = params
    return this._makeAuthRequest('/auth/w/settings/del', { keys }, cb)
  }

  /**
   * Retrieve account settings by key.
   * @see https://docs.bitfinex.com/reference#rest-auth-settings
   */
  getSettings (params: { keys: string[] }, cb: Callback | null = null) {
    const { keys } = params
    return this._makeAuthRequest('/auth/r/settings', { keys }, cb)
  }

  /**
   * Retrieve core platform settings by key.
   * @see https://docs.bitfinex.com/reference#rest-auth-settings-core
   */
  getCoreSettings (params: { keys: string[] }, cb: Callback | null = null) {
    const { keys } = params
    return this._makeAuthRequest('/auth/r/settings/core', { keys }, cb, CoreSettings)
  }

  // ---- Exchange Rate ----

  /**
   * Get the exchange rate between two currencies.
   */
  async exchangeRate (params: { ccy1: string; ccy2: string }, cb: Callback | null = null) {
    const { ccy1, ccy2 } = params
    const res = await this._makePublicPostRequest('/calc/fx', { ccy1, ccy2 }, null)
    return this._response((res as unknown[])[0], null, cb)
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
  generateToken (params: { scope: string; ttl?: number; caps?: string[]; writePermission?: boolean; _cust_ip?: string }, cb: Callback | null = null) {
    const opts = omitNil(
      pick(params || {}, ['ttl', 'scope', 'caps', 'writePermission', '_cust_ip'])
    )
    if (!opts.scope) return this._cb(new Error('scope param is required'), null, cb)

    return this._makeAuthRequest('/auth/w/token', opts as Record<string, unknown>, cb)
  }

  /**
   * Invalidate (revoke) an authentication token.
   * @see https://docs.bitfinex.com/reference#rest-auth-token-del
   */
  invalidateAuthToken (params: { authToken: string }, cb: Callback | null = null) {
    const { authToken } = params
    return this._makeAuthRequest('/auth/w/token/del', { token: authToken }, cb)
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
  submitOrder (params: { order: InstanceType<typeof Order> }, cb: Callback | null = null) {
    const { order } = params
    const packet = order.toNewOrderPacket()

    if (this._affCode) {
      if (!packet.meta) {
        packet.meta = {}
      }
      const meta = packet.meta as Record<string, unknown>
      meta.aff_code = meta.aff_code || this._affCode
    }

    return (this._makeAuthRequest('/auth/w/order/submit', packet, cb) as Promise<unknown>)
      .then((res) => {
        const notify = _takeResNotify(res)
        const orders = (notify as unknown as { notifyInfo: unknown[] }).notifyInfo || []
        const data = (orders as unknown[])[0] || []

        return this._transform
          ? this._doTransform(data, Order)
          : data
      })
  }

  /**
   * Update existing order
   */
  updateOrder (params: Record<string, unknown>, cb: Callback | null = null) {
    return (this._makeAuthRequest('/auth/w/order/update', params, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * Cancel existing order
   */
  cancelOrder (params: { id: number }, cb: Callback | null = null) {
    const { id } = params
    return (this._makeAuthRequest('/auth/w/order/cancel', { id }, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * Cancel existing order using client ID
   */
  cancelOrderWithCid (params: { cid: number; date: string }, cb: Callback | null = null) {
    const { cid, date } = params
    return (this._makeAuthRequest('/auth/w/order/cancel', { cid, cid_date: date }, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * Submit multiple orders
   */
  submitOrderMulti (params: { orders: unknown[] }, cb: Callback | null = null) {
    const { orders } = params
    if (!Array.isArray(orders)) {
      return this._cb(new Error('orders should be an array'), null, cb)
    }

    const payload = orders.map((order) => {
      const inst = order instanceof Order ? order : new Order(order as unknown[])
      const pkt = inst.toNewOrderPacket()
      if (this._affCode) {
        const meta = (pkt.meta || {}) as Record<string, unknown>
        meta.aff_code = meta.aff_code || this._affCode
        pkt.meta = meta
      }
      return ['on', pkt]
    })

    return (this._makeAuthRequest('/auth/w/order/multi', { ops: payload }, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * Update multiple orders
   */
  updateOrderMulti (params: { orders: unknown[] }, cb: Callback | null = null) {
    const { orders } = params
    if (!Array.isArray(orders)) {
      return this._cb(new Error('orders should be an array'), null, cb)
    }

    const payload = orders.map((order) => ['ou', order])

    return (this._makeAuthRequest('/auth/w/order/multi', { ops: payload }, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * Cancel orders by IDs
   */
  cancelOrders (params: { ids: number[] }, cb: Callback | null = null) {
    const { ids } = params
    if (!Array.isArray(ids)) {
      return this._cb(new Error('ids should be an array'), null, cb)
    }

    const payload = ['oc_multi', { id: ids }]

    return (this._makeAuthRequest('/auth/w/order/multi', { ops: [payload] }, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * Send multiple order-related operations
   * @see https://docs.bitfinex.com/reference#rest-auth-order-multi
   */
  orderMultiOp (params: { ops: unknown[][] }, cb: Callback | null = null) {
    let { ops } = params
    if (!Array.isArray(ops)) {
      return this._cb(new Error('ops should be an array'), null, cb)
    }

    if (ops.some((op) => !Array.isArray(op))) {
      return this._cb(new Error('ops should contain only arrays'), null, cb)
    }

    ops = ops.map((op) => {
      if (op[0] === 'on' && op[1]) {
        const inst = op[1] instanceof Order
          ? op[1]
          : new Order(op[1] as unknown[])
        const pkt = inst.toNewOrderPacket()

        if (this._affCode) {
          const meta = (pkt.meta || {}) as Record<string, unknown>
          meta.aff_code = meta.aff_code || this._affCode
          pkt.meta = meta
        }

        op[1] = pkt
      }
      return op
    })

    return (this._makeAuthRequest('/auth/w/order/multi', { ops }, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * Cancel multiple orders simultaneously
   * @see https://docs.bitfinex.com/reference#rest-auth-order-cancel-multi
   */
  cancelOrderMulti (params: { id?: number[]; gid?: number[]; cid?: number[][]; all?: number }, cb: Callback | null = null) {
    const { id, gid, cid, all } = params
    const body: Record<string, unknown> = {}
    if (id !== undefined) body.id = id
    if (gid !== undefined) body.gid = gid
    if (cid !== undefined) body.cid = cid
    if (all !== undefined) body.all = all
    return (this._makeAuthRequest('/auth/w/order/cancel/multi', body, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  // ---- Position Claims ----

  /**
   * Claim existing open position
   */
  claimPosition (params: { id: number; amount?: number | string }, cb: Callback | null = null) {
    const { id, amount } = params
    const body: Record<string, unknown> = { id }
    if (amount !== undefined) body.amount = String(amount)
    return (this._makeAuthRequest('/auth/w/position/claim', body, cb) as Promise<unknown>)
      .then(_takeResNotify)
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
  submitFundingOffer (params: { offer: InstanceType<typeof FundingOffer> }, cb: Callback | null = null) {
    const { offer } = params
    const packet = offer.toNewOfferPacket()

    if (this._affCode) {
      if (!packet.meta) {
        packet.meta = {}
      }
      const meta = packet.meta as Record<string, unknown>
      meta.aff_code = meta.aff_code || this._affCode
    }

    return (this._makeAuthRequest('/auth/w/funding/offer/submit', packet, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * Cancel existing funding offer
   */
  cancelFundingOffer (params: { id: number }, cb: Callback | null = null) {
    const { id } = params
    return (this._makeAuthRequest('/auth/w/funding/offer/cancel', { id }, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * Cancel all existing funding offers
   */
  cancelAllFundingOffers (params: { currency: string }, cb: Callback | null = null) {
    const { currency } = params
    return (this._makeAuthRequest('/auth/w/funding/offer/cancel/all', { currency }, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * Close funding
   */
  closeFunding (params: { id: number; type: string }, cb: Callback | null = null) {
    const { id, type } = params
    return (this._makeAuthRequest('/auth/w/funding/close', { id, type }, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * Submit automatic funding
   */
  submitAutoFunding (params: { status: number; currency: string; amount: number; rate: number; period: number }, cb: Callback | null = null) {
    const { status, currency, amount, rate, period } = params
    return (this._makeAuthRequest('/auth/w/funding/auto', { status, currency, amount, rate, period }, cb) as Promise<unknown>)
      .then(_takeResNotify)
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
  transfer (params: { amount: string; from: string; to: string; currency: string; currencyTo: string }, cb: Callback | null = null) {
    const opts: Record<string, unknown> = pick(params, ['amount', 'from', 'to', 'currency'])
    opts.currency_to = params.currencyTo
    return (this._makeAuthRequest('/auth/w/transfer', opts, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * Get or generate a deposit address for the given wallet and method.
   * @see https://docs.bitfinex.com/reference#rest-auth-deposit-address
   */
  getDepositAddress (params: { wallet: string; method: string; opRenew?: number }, cb: Callback | null = null) {
    const opts: Record<string, unknown> = pick(params, ['wallet', 'method'])
    opts.op_renew = params.opRenew
    return (this._makeAuthRequest('/auth/w/deposit/address', opts, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * Request a withdrawal from the platform.
   * @see https://docs.bitfinex.com/reference#rest-auth-withdraw
   */
  withdraw (params: Record<string, unknown>, cb: Callback | null = null) {
    return (this._makeAuthRequest('/auth/w/withdraw', params, cb) as Promise<unknown>)
      .then(_takeResNotify)
  }

  /**
   * @see https://docs.bitfinex.com/reference#rest-auth-deposit-invoice
   */
  generateInvoice (params: { currency: string; wallet: string; amount: string }, cb: Callback | null = null) {
    const { currency, wallet, amount } = params
    return this._makeAuthRequest('/auth/w/deposit/invoice', { currency, wallet, amount }, cb, Invoice)
  }

  /**
   * @see https://docs.bitfinex.com/reference/lnx-invoice-payments
   */
  lnxInvoicePayments (params: { action: string; query: Record<string, unknown> }, cb: Callback | null = null) {
    const { action, query } = params
    return this._makeAuthRequest('/auth/r/ext/invoice/payments', { action, query }, cb)
  }

  // ---- Recurring Algo Orders ----

  /**
   * Create a new recurring algorithmic order.
   */
  submitRecurringAlgoOrder (params: { order: Record<string, unknown> } = { order: {} }, cb: Callback | null = null) {
    const { order } = params
    return this._makeAuthRequest('/auth/w/ext/recurring-ao/create', order, cb)
  }

  /**
   * Retrieve details for a specific recurring algorithmic order.
   */
  getRecurringAlgoOrder (params: { algoOrderId: string } = { algoOrderId: '' }, cb: Callback | null = null) {
    const { algoOrderId } = params
    return this._makeAuthRequest(`/auth/r/ext/recurring-ao/detail/${algoOrderId}`, {}, cb)
  }

  /**
   * Update an existing recurring algorithmic order.
   */
  updateRecurringAlgoOrder (params: { order: Record<string, unknown> & { algoOrderId: string } } = { order: { algoOrderId: '' } }, cb: Callback | null = null) {
    const { order } = params
    return this._makeAuthRequest(`/auth/w/ext/recurring-ao/update/${order.algoOrderId}`, order, cb)
  }

  /**
   * Cancel a recurring algorithmic order.
   */
  cancelRecurringAlgoOrder (params: { algoOrderId: string } = { algoOrderId: '' }, cb: Callback | null = null) {
    const { algoOrderId } = params
    return this._makeAuthRequest(`/auth/w/ext/recurring-ao/cancel/${algoOrderId}`, {}, cb)
  }

  /**
   * List all recurring algorithmic orders.
   */
  getRecurringAlgoOrders (params: Record<string, unknown> = {}, cb: Callback | null = null) {
    return this._makeAuthRequest('/auth/r/ext/recurring-ao/list', params, cb)
  }

  /**
   * List child orders generated by recurring algorithmic orders.
   */
  getRecurringAoOrders (params: Record<string, unknown> = {}, cb: Callback | null = null) {
    return this._makeAuthRequest('/auth/r/ext/recurring-ao/order/list', params, cb)
  }

  // ---- Currency Conversion ----

  /**
   * Convert between currencies
   */
  currencyConversion (params: { ccy1: string; ccy2: string; amount: number }, cb: Callback | null = null) {
    const { ccy1, ccy2, amount } = params
    return this._makeAuthRequest('/auth/w/ext/currency/conversion', { ccy1, ccy2, amount }, cb)
  }
}

export default RESTv2
