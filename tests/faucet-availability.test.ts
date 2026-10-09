import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROUTE_PATH = path.resolve('server/routes/contracts.ts')
const NEUTRAL_MESSAGE = 'the testnet faucet is unavailable'

/** Isolate the two faucet handlers from the rest of the router source. */
function faucetSection(src: string): string {
  const start = src.indexOf("router.post('/faucet'")
  const end = src.indexOf("router.post('/mint-nft'")
  assert.ok(start > -1, 'faucet handler must exist')
  assert.ok(end > start, 'mint-nft handler must follow the faucet handler')
  return src.slice(start, end)
}

test('faucet route responds 503 with a neutral message when FAUCET_SECRET is unset', () => {
  const src = fs.readFileSync(ROUTE_PATH, 'utf-8')

  // The neutral message must be a single constant naming no environment variable.
  assert.match(
    src,
    /const FAUCET_UNAVAILABLE = 'the testnet faucet is unavailable'/,
    'must define a neutral unavailable message',
  )
  assert.equal(NEUTRAL_MESSAGE.includes('FAUCET_SECRET'), false)

  const faucet = faucetSection(src)
  assert.match(
    faucet,
    /status\(503\)\.json\(\{\s*error:\s*FAUCET_UNAVAILABLE\s*\}\)/,
    'faucet must return 503 with the neutral error',
  )
})

test('a malformed address is rejected with 400 before the secret check', () => {
  const faucet = faucetSection(fs.readFileSync(ROUTE_PATH, 'utf-8'))

  assert.match(
    faucet,
    /status\(400\)\.json\(\{\s*error:\s*'invalid Stellar address'\s*\}\)/,
    'faucet must reject malformed addresses with 400',
  )

  const addressCheck = faucet.indexOf('isValidAddress(address)')
  const secretCheck = faucet.indexOf('process.env.FAUCET_SECRET')
  assert.ok(addressCheck > -1, 'faucet must validate the address parameter')
  assert.ok(secretCheck > -1, 'faucet must read FAUCET_SECRET')
  assert.ok(
    addressCheck < secretCheck,
    'address validation must run before the secret check (400 before 503)',
  )
})

test('mint-nft route also validates the address and guards the secret', () => {
  const src = fs.readFileSync(ROUTE_PATH, 'utf-8')
  const start = src.indexOf("router.post('/mint-nft'")
  assert.ok(start > -1, 'mint-nft handler must exist')
  const nft = src.slice(start)

  assert.match(nft, /isValidAddress\(address\)/, 'mint-nft must validate the address')
  assert.match(
    nft,
    /status\(503\)\.json\(\{\s*error:\s*FAUCET_UNAVAILABLE\s*\}\)/,
    'mint-nft must return 503 with the neutral error',
  )
  assert.ok(
    nft.indexOf('isValidAddress(address)') < nft.indexOf('process.env.FAUCET_SECRET'),
    'mint-nft address validation must precede the secret check',
  )
})

test('handler ordering simulation: malformed address beats a missing secret', () => {
  const isValid = (a: string) => /^G[A-Z2-7]{55}$/.test(a)

  function handleFaucet(
    address: string | undefined,
    secret: string | undefined,
  ): { status: number; error?: string } {
    if (!address) return { status: 400, error: 'address required' }
    if (!isValid(address)) return { status: 400, error: 'invalid Stellar address' }
    if (!secret) return { status: 503, error: NEUTRAL_MESSAGE }
    return { status: 200 }
  }

  // Malformed address wins over an unconfigured deployment.
  const malformed = handleFaucet('not-an-address', undefined)
  assert.equal(malformed.status, 400)
  assert.equal(malformed.error, 'invalid Stellar address')

  // Missing secret with a valid address → 503, and the body names no env var.
  const validAddress = 'G' + 'A'.repeat(55)
  const unconfigured = handleFaucet(validAddress, undefined)
  assert.equal(unconfigured.status, 503)
  assert.equal(unconfigured.error, NEUTRAL_MESSAGE)

  // Happy path is unchanged.
  assert.equal(handleFaucet(validAddress, 'S-secret').status, 200)
})
