import test from 'node:test'
import assert from 'node:assert/strict'
import type { Request, Response } from 'express'

// supabase.ts reads these at module load, so set them BEFORE the dynamic import.
process.env.SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key'
process.env.SUPABASE_SECRET_KEY = 'secret-test-key'

const { serverClient, adminClient, cookieWriteOptions } = await import('./supabase.js')

test('development never sets a cookie domain, even with COOKIE_DOMAIN present', () => {
  const opts = cookieWriteOptions({ isProd: false, cookieDomain: '.stellita.app' })
  assert.equal(opts.domain, undefined)
  assert.equal(opts.secure, false)
  assert.equal(opts.sameSite, 'lax')
})

test('production applies the configured apex domain', () => {
  const opts = cookieWriteOptions({ isProd: true, cookieDomain: '.stellita.app' })
  assert.equal(opts.domain, '.stellita.app')
  assert.equal(opts.secure, true)
  assert.equal(opts.sameSite, 'none')
})

test('production with an empty COOKIE_DOMAIN yields a host-only cookie, not ""', () => {
  assert.equal(cookieWriteOptions({ isProd: true, cookieDomain: '' }).domain, undefined)
  assert.equal(cookieWriteOptions({ isProd: true }).domain, undefined)
})

test('httpOnly is always enabled', () => {
  assert.equal(cookieWriteOptions({ isProd: true, cookieDomain: '.stellita.app' }).httpOnly, true)
  assert.equal(cookieWriteOptions({ isProd: false }).httpOnly, true)
})

function fakeReq(): Request {
  return { cookies: {} } as unknown as Request
}

function fakeRes(): Response {
  return { cookie: () => undefined } as unknown as Response
}

test('serverClient is built with the publishable key, never the secret key', () => {
  const client = serverClient(fakeReq(), fakeRes()) as unknown as { supabaseKey?: string }
  assert.equal(client.supabaseKey, 'publishable-test-key')
  assert.notEqual(client.supabaseKey, 'secret-test-key')
})

test('adminClient is built with the service/secret key', () => {
  const client = adminClient() as unknown as { supabaseKey?: string }
  assert.equal(client.supabaseKey, 'secret-test-key')
})
