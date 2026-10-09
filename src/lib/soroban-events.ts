/**
 * Pure Soroban event decoders, shared between the platform's unit tests and the
 * generated app's `/stellar.ts`.
 *
 * These live as SOURCE TEXT rather than ordinary functions because the project
 * generator embeds them verbatim into the emitted `/stellar.ts`. Keeping a
 * single string means the exact code a generated app runs is the code the
 * platform tests. The text is plain JavaScript and resolves `scValToNative` and
 * `fromUnits` from its enclosing module, so no SDK import is needed here.
 */
export const SOROBAN_EVENT_HELPERS = `
const eventStableTime = (ev) => (ev && ev.ledgerClosedAt ? String(ev.ledgerClosedAt) : '')
const eventStableTxHash = (ev) => (ev && ev.txHash ? String(ev.txHash) : '')
const eventAmountValue = (raw) =>
  raw && typeof raw === 'object' && 'amount' in raw ? raw.amount : raw
/** Decode one token event into a Movement for the given user, or null. */
const movementFromEvent = (ev, user, decimals) => {
  const topic = ((ev && ev.topic) || []).map((t) => scValToNative(t))
  const name = String(topic[0])
  const amount = fromUnits(BigInt(eventAmountValue(scValToNative(ev.value))), decimals)
  const time = eventStableTime(ev)
  const txHash = eventStableTxHash(ev)
  if (name === 'transfer') {
    const from = String(topic[1])
    const to = String(topic[2])
    if (from === user) return { kind: 'out', counterparty: to, amount, time, txHash }
    if (to === user) return { kind: 'in', counterparty: from, amount, time, txHash }
    return null
  }
  if (name === 'mint') {
    const to = String(topic[1])
    if (to === user) return { kind: 'mint', counterparty: '', amount, time, txHash }
    return null
  }
  return null
}
/** Every plausible token id an event carries (object value, scalar value, topics). */
const nftIdCandidates = (ev) => {
  const val = scValToNative(ev.value)
  const nums = []
  if (val && typeof val === 'object') {
    for (const k of ['token_id', 'tokenId', 'id']) if (k in val) nums.push(val[k])
  } else {
    nums.push(val)
  }
  for (const t of ((ev && ev.topic) || [])) {
    try { nums.push(scValToNative(t)) } catch {}
  }
  return nums
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < 100000)
}
`
