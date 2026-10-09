import type { Request, Response, NextFunction } from 'express'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { serverClient } from '../lib/supabase.js'

// Augment Express Request to carry the per-request supabase client + user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      supabase: SupabaseClient
      user: User
    }
  }
}

/**
 * Build the auth middleware around an injectable client factory.
 *
 * Validates the session cookie and attaches `req.supabase` + `req.user`.
 * Uses getUser() (not getSession()) to validate the JWT server-side.
 * Returns 401 if there is no valid session.
 *
 * The factory seam (`clientFor`) exists so the 401/valid branches can be unit
 * tested without a live Supabase project; production always uses the real
 * per-request `serverClient`.
 */
export function createRequireUser(clientFor: typeof serverClient = serverClient) {
  return async function requireUserMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const supabase = clientFor(req, res)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    req.supabase = supabase
    req.user = user
    next()
  }
}

/** The single auth gate mounted on every protected route. */
export const requireUser = createRequireUser()
