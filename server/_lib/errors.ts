import type { Response } from 'express'
import { randomUUID } from 'node:crypto'

/**
 * Standard sanitized error responder for API routes.
 *
 * Prevents leaking raw Postgres/Supabase internals (schema names, constraint names,
 * table structures) to clients while maintaining a server-side correlation trail.
 */
export function errorResponse(
  res: Response,
  status: number,
  publicMessage: string,
  err?: unknown,
  context?: { route?: string; projectId?: string | string[]; [key: string]: unknown },
): void {
  const correlationId = randomUUID().slice(0, 8)
  const serializedError =
    err instanceof Error
      ? { message: err.message, stack: err.stack, name: err.name, ...(err as unknown as Record<string, unknown>) }
      : typeof err === 'object' && err !== null
        ? { ...(err as Record<string, unknown>) }
        : err

  const fullContext = {
    correlationId,
    status,
    publicMessage,
    route: context?.route,
    projectId: context?.projectId,
    error: serializedError,
  }

  console.error(`[api-error] ${correlationId}: ${publicMessage}`, JSON.stringify(fullContext))

  res.status(status).json({
    error: publicMessage,
    correlationId,
  })
}
