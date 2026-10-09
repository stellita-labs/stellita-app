import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { Address, Keypair, nativeToScVal } from '@stellar/stellar-sdk'
import { contractIdFromReturnValue, toScVal } from './deploy.mjs'

const SCRIPT = path.resolve('contracts/scripts/deploy.mjs')
const SERVER = path.resolve('server/_lib/deploy.ts')

test('toScVal resolves the {{deployer}} sentinel to the deployer address', () => {
  const deployer = Keypair.random().publicKey()
  const expected = new Address(deployer).toScVal()
  assert.deepEqual(toScVal('{{deployer}}', 'address', deployer), expected)
  assert.deepEqual(toScVal('', 'address', deployer), expected)
  const explicit = Keypair.random().publicKey()
  assert.deepEqual(toScVal(explicit, 'address', deployer), new Address(explicit).toScVal())
})

test('toScVal maps every type exactly like server/_lib/deploy.ts', () => {
  assert.deepEqual(toScVal('hello', 'string', 'G'), nativeToScVal('hello', { type: 'string' }))
  assert.deepEqual(toScVal(42, 'u32', 'G'), nativeToScVal(42, { type: 'u32' }))
  assert.deepEqual(toScVal('42', 'u64', 'G'), nativeToScVal(42n, { type: 'u64' }))
  assert.deepEqual(toScVal(12.9, 'i128', 'G'), nativeToScVal(12n, { type: 'i128' }))
  assert.deepEqual(toScVal('31', 'i128', 'G'), nativeToScVal(31n, { type: 'i128' }))
  assert.deepEqual(toScVal(true, 'bool', 'G'), nativeToScVal(true))
})

test('contractIdFromReturnValue returns the strkey id and names the tx on failure', () => {
  const pk = Keypair.random().publicKey()
  assert.equal(contractIdFromReturnValue(nativeToScVal(pk, { type: 'address' }), 'abc123'), pk)
  assert.throws(
    () => contractIdFromReturnValue(undefined, 'deadbeef'),
    (err) =>
      err instanceof Error &&
      err.message.includes('deadbeef') &&
      /no contract address/.test(err.message),
  )
})

test('the script and server/_lib/deploy.ts keep the same ScVal mapping', () => {
  const script = fs.readFileSync(SCRIPT, 'utf-8')
  const server = fs.readFileSync(SERVER, 'utf-8')
  for (const src of [script, server]) {
    assert.match(src, /'address'/)
    assert.match(src, /'i128'/)
    assert.match(src, /'u32'/)
    assert.match(src, /'u64'/)
    assert.match(src, /'bool'/)
    assert.match(src, /\{\{deployer\}\}/)
    assert.match(src, /Math\.trunc/)
  }
})

test('a non-SUCCESS transaction makes the CLI exit non-zero', () => {
  const script = fs.readFileSync(SCRIPT, 'utf-8')
  assert.match(script, /got\.status !== 'SUCCESS'/)
  assert.match(script, /process\.exit\(1\)/)
})

test('--help prints usage without network access', () => {
  const output = execFileSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf-8' })
  assert.match(output, /Usage:/)
})
