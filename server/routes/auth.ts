import { Router } from 'express'
import type { User } from '@supabase/supabase-js'
import { serverClient } from '../lib/supabase.js'
import { requireUser } from '../middleware/auth.js'
import { errorResponse } from '../_lib/errors.js'

const router = Router()

/**
 * Shape the raw Supabase auth user into the contract the frontend expects:
 * { id, name, email, avatar_url }. Email-OTP users have no name → derive one
 * from the email local-part so the UI never sees undefined.
 */
function publicUser(u: User) {
  const meta = u.user_metadata ?? {}
  const email = u.email ?? ''
  const name =
    (meta['full_name'] as string | undefined) ??
    (meta['name'] as string | undefined) ??
    (email ? email.split('@')[0] : 'user')
  return {
    id: u.id,
    name,
    email,
    avatar_url: meta['avatar_url'] as string | undefined,
  }
}

// First entry is the canonical origin (post-login redirect target).
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173')
  .split(',')[0]
  .trim()
const API_BASE = process.env.API_BASE ?? 'http://localhost:8787'
const IS_PROD = process.env.NODE_ENV === 'production'

/**
 * POST /auth/otp/start
 * Sends a magic-link / OTP to the given email.
 */
router.post('/otp/start', async (req, res) => {
  const { email } = req.body as { email?: string }
  if (!email) {
    res.status(400).json({ error: 'email required' })
    return
  }
  const supabase = serverClient(req, res)
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  })
  if (error) {
    errorResponse(res, 400, 'Unable to send login email', error, { route: 'POST /auth/otp/start' })
    return
  }
  res.json({ ok: true })
})

/**
 * POST /auth/otp/verify
 * Verifies the OTP token and sets session cookies via the SSR adapter.
 */
router.post('/otp/verify', async (req, res) => {
  const { email, token } = req.body as { email?: string; token?: string }
  if (!email || !token) {
    res.status(400).json({ error: 'email and token required' })
    return
  }
  const supabase = serverClient(req, res)
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })
  if (error) {
    errorResponse(res, 400, 'Invalid or expired login code', error, { route: 'POST /auth/otp/verify' })
    return
  }
  res.json({ user: data.user ? publicUser(data.user) : null })
})

/**
 * GET /auth/google
 * Initiates Google OAuth flow — redirects to provider.
 */
/** Only allow relative paths as the post-login return target (no open redirect). */
function safeNext(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

router.get('/google', async (req, res) => {
  const next = safeNext(req.query['next'])
  // Stash `next` in a short-lived cookie instead of appending it to redirect_to.
  // Supabase validates redirect_to against the allow-list with EXACT matching
  // (no implicit query-string wildcard): a `?next=...` suffix fails the match
  // and Supabase silently falls back to the Site URL — which is why Google
  // login was landing on the frontend with a raw `?code=`. Keeping redirect_to
  // exactly `${API_BASE}/auth/callback` matches the allow-list entry verbatim.
  res.cookie('oauth_next', next, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/auth',
    maxAge: 10 * 60 * 1000,
  })
  const supabase = serverClient(req, res)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${API_BASE}/auth/callback` },
  })
  if (error || !data.url) {
    errorResponse(res, 500, 'OAuth initiation failed', error, { route: 'GET /auth/google' })
    return
  }
  res.redirect(data.url)
})

/**
 * GET /auth/callback?code=...
 * Exchanges the OAuth code for a session, sets cookies, and redirects back to
 * where the user started (`next`, read from the oauth_next cookie set in
 * /auth/google), defaulting to the app root.
 */
router.get('/callback', async (req, res) => {
  const code = req.query['code'] as string | undefined
  const cookies = req.cookies as Record<string, string> | undefined
  const next = safeNext(cookies?.['oauth_next'])
  res.clearCookie('oauth_next', { path: '/auth' })
  if (!code) {
    res.status(400).json({ error: 'missing code' })
    return
  }
  const supabase = serverClient(req, res)
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    errorResponse(res, 400, 'Authentication callback failed', error, { route: 'GET /auth/callback' })
    return
  }
  res.redirect(`${FRONTEND_ORIGIN}${next}`)
})

/**
 * POST /auth/logout
 * Signs out the user and clears the session.
 */
router.post('/logout', async (req, res) => {
  const supabase = serverClient(req, res)
  await supabase.auth.signOut()
  res.json({ ok: true })
})

/**
 * GET /auth/me
 * Returns the current user + their profile row.
 */
router.get('/me', requireUser, async (req, res) => {
  const [profileRes, creditsRes] = await Promise.all([
    req.supabase.from('profiles').select('*').eq('id', req.user.id).single(),
    // Read-only credit status (never consumes) — computed server-side.
    req.supabase.rpc('prompt_status'),
  ])

  if (profileRes.error) {
    errorResponse(res, 500, 'Failed to fetch user profile', profileRes.error, { route: 'GET /auth/me' })
    return
  }
  res.json({
    user: publicUser(req.user),
    profile: profileRes.data,
    credits: creditsRes.data ?? null,
  })
})

/**
 * GET /auth/usage
 * Per-day prompt usage history for the current user (last 30 days).
 */
router.get('/usage', requireUser, async (req, res) => {
  const { data, error } = await req.supabase.rpc('usage_daily', { p_days: 30 })
  if (error) {
    errorResponse(res, 500, 'Failed to fetch usage history', error, { route: 'GET /auth/usage' })
    return
  }
  res.json({ days: data ?? [] })
})

export default router
