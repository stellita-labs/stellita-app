/**
 * Streaming helpers for the chat UI: derive live activity + the partial message
 * from the model's streamed JSON. The actual chat request goes through the
 * backend (src/lib/backend.ts → POST /api/projects/:id/chat).
 */

/** Live activity derived from the partial JSON stream (cosmetic). */
export interface Activity {
  op: 'create' | 'edit' | 'delete'
  path: string
}

/** Extract file ops seen so far from the partial JSON text. */
export function parseActivity(text: string): Activity[] {
  const activity: Activity[] = []
  // One scan pairs each `op` with the `path` that follows it in the SAME
  // file-op object. Independent op/path scans drift as soon as a file's
  // *content* contains the literal text "path" (e.g. a fetch helper), which
  // used to mislabel a delete as a create in the live activity feed.
  const opPath = /"op"\s*:\s*"(create|edit|delete)"[\s\S]*?"path"\s*:\s*"([^"]+)"/g
  for (const match of text.matchAll(opPath)) {
    activity.push({ op: match[1] as Activity['op'], path: match[2] })
  }
  return activity
}

/** Extract the (possibly partial) chat message from the streaming JSON. */
export function parseStreamingMessage(text: string): string {
  const key = text.indexOf('"message"')
  if (key < 0) return ''
  const colon = text.indexOf(':', key)
  const start = text.indexOf('"', colon + 1)
  if (start < 0) return ''
  let out = ''
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i]
    if (c === '\\') {
      const next = text[i + 1]
      out += next === 'n' ? '\n' : (next ?? '')
      i++
      continue
    }
    if (c === '"') break
    out += c
  }
  return out
}
