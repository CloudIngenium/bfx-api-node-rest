import assert from 'assert'
import {
  getEnvVar,
  getRequiredEnvVar,
  getEnvVarAsNumber,
  getEnvVarAsInt,
  getEnvVarAsBoolean,
  getEnvVarAsArray
} from '../../dist/index.js'

const ORIGINAL_ENV = { ...process.env }

describe('env helpers', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  after(() => {
    process.env = ORIGINAL_ENV
  })

  it('getEnvVar returns default for missing values', () => {
    delete process.env.TEST_ENV_VALUE
    assert.strictEqual(getEnvVar('TEST_ENV_VALUE', 'fallback'), 'fallback')
  })

  it('getEnvVar returns actual value when present', () => {
    process.env.TEST_ENV_VALUE = 'hello'
    assert.strictEqual(getEnvVar('TEST_ENV_VALUE', 'fallback'), 'hello')
  })

  it('getRequiredEnvVar throws when missing', () => {
    delete process.env.TEST_REQUIRED_ENV
    assert.throws(
      () => getRequiredEnvVar('TEST_REQUIRED_ENV'),
      { message: 'Required environment variable not found: TEST_REQUIRED_ENV' }
    )
  })

  it('getEnvVarAsInt parses integers and falls back on invalid input', () => {
    process.env.TEST_ENV_INT = '42'
    assert.strictEqual(getEnvVarAsInt('TEST_ENV_INT', 7), 42)

    process.env.TEST_ENV_INT = 'NaN'
    assert.strictEqual(getEnvVarAsInt('TEST_ENV_INT', 7), 7)
  })

  it('getEnvVarAsNumber parses floats and falls back on invalid input', () => {
    process.env.TEST_ENV_NUMBER = '3.1416'
    assert.strictEqual(getEnvVarAsNumber('TEST_ENV_NUMBER', 7), 3.1416)

    process.env.TEST_ENV_NUMBER = 'NaN'
    assert.strictEqual(getEnvVarAsNumber('TEST_ENV_NUMBER', 7), 7)
  })

  it('getEnvVarAsBoolean recognizes common truthy values', () => {
    process.env.TEST_ENV_BOOL = 'yes'
    assert.strictEqual(getEnvVarAsBoolean('TEST_ENV_BOOL', false), true)

    process.env.TEST_ENV_BOOL = 'off'
    assert.strictEqual(getEnvVarAsBoolean('TEST_ENV_BOOL', true), false)
  })

  it('getEnvVarAsArray splits and trims comma-separated values', () => {
    process.env.TEST_ENV_ARRAY = 'btc, eth , sol,, xaut '
    assert.deepStrictEqual(getEnvVarAsArray('TEST_ENV_ARRAY'), ['btc', 'eth', 'sol', 'xaut'])
  })
})