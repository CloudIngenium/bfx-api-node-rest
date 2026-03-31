# Bitfinex RESTv1 & RESTv2 APIs for Node.JS

[![CI](https://github.com/CloudIngenium/bfx-api-node-rest/actions/workflows/ci.yml/badge.svg)](https://github.com/CloudIngenium/bfx-api-node-rest/actions/workflows/ci.yml)

A Node.JS reference implementation of the Bitfinex REST APIs

To use, construct a new instance of either the `RESTv1` or `RESTv2` classes.
All API methods return promises and accept a callback as the last parameter; the
callback will be called with `(error, response)`.

To minimize the data sent over the network the transmitted data is structured in
arrays. In order to reconstruct key / value pairs, set `opts.transform` to `true`
when creating an interface.

## Features

* Official implementation
* REST v2 API
* REST v1 API (deprecated)
* Full TypeScript support with type declarations
* ESM native (no CommonJS)
* Native `fetch` (no polyfills)
* Zero dependency on `lodash`

## Requirements

* Node.js >= 24.0.0

## Installation

```bash
npm i --save @cloudingenium/bfx-api-node-rest
```

### Quickstart

```typescript
import { RESTv2 } from '@cloudingenium/bfx-api-node-rest'

const rest = new RESTv2({ transform: true })

const tickers = await rest.tickers({ symbols: ['tBTCUSD'] })
console.log(tickers)
```

### Docs

Documentation at [https://docs.bitfinex.com/v2/reference](https://docs.bitfinex.com/v2/reference)

## Example

```typescript
import { RESTv2 } from '@cloudingenium/bfx-api-node-rest'

const rest = new RESTv2({
  apiKey: '...',
  apiSecret: '...',
  authToken: '...', // optional, has priority over API key/secret
  url: '...',       // optional
  transform: true,  // to have full models returned by all methods
  fetch: null,      // optional custom fetch function (for proxies, etc.)
})

const candles = await rest.candles({
  timeframe: '1m',
  symbol: 'tBTCUSD',
  query: {
    start: String(Date.now() - (24 * 60 * 60 * 1000)),
    end: String(Date.now()),
    limit: '1000',
  }
})

console.log(candles)
```

## Migration from v7 to v8

### Breaking changes

* **Node.js >= 24 required** — upgrade from the previous minimum of Node 8.3
* **ESM only** — `require()` is no longer supported; use `import` instead
* **`agent` option removed** — use a custom `fetch` function for proxy support:
  ```typescript
  import { ProxyAgent } from 'undici'
  import { RESTv2 } from '@cloudingenium/bfx-api-node-rest'

  const dispatcher = new ProxyAgent('http://proxy:8080')
  const rest = new RESTv2({
    fetch: (url, opts) => fetch(url, { ...opts, dispatcher })
  })
  ```
* **TypeScript rewrite** — all source is now TypeScript with full type declarations
* **`node-fetch` removed** — uses the native `fetch` API built into Node 22+
* **`lodash` removed** — replaced with native JS equivalents
* **RESTv1 deprecated** — still available but marked as deprecated
* **`generateToken` bug fix** — now correctly picks only the documented params

## FAQ

### nonce too small

I make multiple parallel request and I receive an error that the nonce is too
small. What does it mean?

Nonces are used to guard against replay attacks. When multiple HTTP requests
arrive at the API with the wrong nonce, e.g. because of an async timing issue,
the API will reject the request.

If you need to go parallel, you have to use multiple API keys right now.

### Contributing

1. Fork it
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a new Pull Request
