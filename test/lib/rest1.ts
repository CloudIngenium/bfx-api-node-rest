import assert from 'assert'
import dns from 'dns'
import { RESTv1 } from '../../dist/index.js'

describe('REST v1', () => {
  let skipPublic = !!process.env.SKIP_PUBLIC_REST

  if (!skipPublic) {
    before((done) => {
      dns.resolve('api.bitfinex.com', (err) => {
        if (err) skipPublic = true
        done()
      })
    })
  }

  describe('errors', function () {
    const bfxRest = new RESTv1()
    this.timeout(5000)

    it('should error out if a bad endpoint is given', (done) => {
      bfxRest.make_public_request('', (err) => {
        assert.ok(err)
        assert.strictEqual(err!.message, 'path is missing')
        done()
      })
    })

    it('should fail on authenticated requests if no api_key and api_secret', (done) => {
      bfxRest.make_request('account_infos', {}, (err) => {
        assert.ok(err)
        assert.strictEqual(err!.message, 'missing api key or secret')
        done()
      })
    })
  })

  describe('public endpoints', function () {
    const bfxRest = new RESTv1()
    this.timeout(30000)
    this.retries(2)

    it('should get a ticker', (done) => {
      if (skipPublic) return done()

      bfxRest.ticker('BTCUSD', (error, data) => {
        assert(!error)
        assert.ok(data)
        const d = data as Record<string, unknown>
        assert.ok('mid' in d)
        assert.ok('bid' in d)
        assert.ok('ask' in d)
        done()
      })
    })

    it('should get the today endpoint', (done) => {
      if (skipPublic) return done()

      bfxRest.today('BTCUSD', (error, data) => {
        assert(!error)
        assert.ok(data)
        done()
      })
    })

    it('should get the stats', (done) => {
      if (skipPublic) return done()

      bfxRest.stats('BTCUSD', (error, data) => {
        assert(!error)
        assert.ok(data)
        assert.ok(Array.isArray(data))
        done()
      })
    })

    it('should get the fundingbook', (done) => {
      if (skipPublic) return done()

      bfxRest.fundingbook('USD', (error, data) => {
        assert(!error)
        assert.ok(data)
        const d = data as Record<string, unknown[]>
        assert.ok('bids' in d)
        assert.ok('asks' in d)
        assert.ok(Object.keys(d.bids[0]).includes('rate'))
        assert.ok(Object.keys(d.asks[0]).includes('rate'))
        done()
      })
    })

    it('should get the orderbook', (done) => {
      if (skipPublic) return done()

      bfxRest.orderbook('BTCUSD', (error, data) => {
        assert(!error)
        assert.ok(data)
        const d = data as Record<string, unknown[]>
        assert.deepStrictEqual(Object.keys(d), ['bids', 'asks'])
        assert.ok(Object.keys(d.bids[0]).includes('price'))
        assert.ok(Object.keys(d.asks[0]).includes('price'))
        done()
      })
    })

    it('should get recent trades', (done) => {
      if (skipPublic) return done()

      bfxRest.trades('BTCUSD', (error, data) => {
        assert(!error)
        assert.ok(Array.isArray(data))
        done()
      })
    })

    it('should get recent lends', (done) => {
      if (skipPublic) return done()

      bfxRest.lends('USD', (error, data) => {
        assert(!error)
        assert.ok(data)
        assert.ok(Array.isArray(data))
        done()
      })
    })

    it('should get symbols', (done) => {
      if (skipPublic) return done()

      bfxRest.get_symbols((error, data) => {
        assert(!error)
        assert.ok(Array.isArray(data))
        assert.strictEqual((data as string[])[0], 'btcusd')
        done()
      })
    })

    it('should get symbol details', (done) => {
      if (skipPublic) return done()

      bfxRest.symbols_details((error, data) => {
        assert(!error)
        assert.ok(data)
        assert.strictEqual((data as Array<{ pair: string }>)[0].pair, 'btcusd')
        done()
      })
    })
  })

  describe('nonce error handling', () => {
    it('should append help link on nonce too small error', (done) => {
      const rest = new RESTv1({
        apiKey: 'key',
        apiSecret: 'secret',
        fetch: async () => new Response(JSON.stringify({ message: 'Nonce is too small' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      })

      rest.make_request('test', {}, (err) => {
        assert.ok(err)
        assert.ok(err!.message.includes('nonce'))
        assert.ok(err!.message.includes('README'))
        done()
      })
    })
  })

  describe('URLSearchParams for query strings', () => {
    it('fundingbook builds proper query string', (done) => {
      const rest = new RESTv1({
        fetch: async (url) => {
          assert.ok((url as string).includes('?limit_bids=0&limit_asks=10'))
          assert.ok(!(url as string).includes('/?'))
          return new Response(JSON.stringify({ bids: [], asks: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        }
      })

      rest.fundingbook('USD', { limit_bids: '0', limit_asks: '10' }, (err) => {
        assert.ok(!err)
        done()
      })
    })

    it('orderbook builds proper query string', (done) => {
      const rest = new RESTv1({
        fetch: async (url) => {
          assert.ok((url as string).includes('?limit_bids=0&limit_asks=25'))
          return new Response(JSON.stringify({ bids: [], asks: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        }
      })

      rest.orderbook('BTCUSD', { limit_bids: '0', limit_asks: '25' }, (err) => {
        assert.ok(!err)
        done()
      })
    })
  })
})
