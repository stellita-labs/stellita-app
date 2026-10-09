/**
 * Tiny Resend mailer. Reads RESEND_API_KEY + EMAIL_FROM from the environment
 * (loaded from .env.local by server/env.ts). If no key is set, it no-ops with a
 * warning so local dev never crashes on a missing key.
 *
 * The key/from are read lazily (per call) so the failure handling can be
 * unit-tested by varying the environment between calls.
 */
function resendApiKey(): string {
  return process.env.RESEND_API_KEY ?? ''
}

function emailFrom(): string {
  return process.env.EMAIL_FROM ?? 'Stellita <noreply@stellita.app>'
}

export interface SendResult {
  ok: boolean
  id?: string
  error?: string
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}): Promise<SendResult> {
  const apiKey = resendApiKey()
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping send to', to)
    return { ok: false, error: 'email not configured' }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: emailFrom(), to, subject, html }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      return { ok: false, error: body.message ?? `Resend error ${res.status}` }
    }
    const data = (await res.json()) as { id?: string }
    return { ok: true, id: data.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'send failed' }
  }
}
