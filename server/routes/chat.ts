import { Router } from 'express'
import { requireUser } from '../middleware/auth.js'
import { adminClient } from '../lib/supabase.js'
import { streamChat } from '../_lib/llm.js'
import { checkGuardrail, refusalMessage } from '../_lib/guardrail.js'
import { listManifests } from '../_lib/contracts.js'
import { errorResponse } from '../_lib/errors.js'
import type { FileTree, ChatMessage } from '../../shared/types.js'
import { PROMPT_MAX } from '../../shared/types.js'

const router = Router()

/**
 * POST /api/projects/:id/chat
 *
 * Streaming chat endpoint. Flow:
 *   1. Rate-limit via consume_prompt RPC (atomic, server-side)
 *   2. Resolve model from the models table (adminClient — public ref data)
 *   3. Guardrail check (+ a `guardrail` usage_event — the classifier is a real LLM call)
 *   1. Resolve model from the models table (adminClient — public ref data)
 *   2. Guardrail check — BEFORE consuming a credit, so a blocked prompt never
 *      burns one from the user's daily allowance
 *   3. Rate-limit via consume_prompt RPC (atomic, server-side)
 *   4. Stream LLM output as text/plain (client parses live JSON)
 *   5. After stream finishes: persist user msg, assistant msg, version (if
 *      files changed), and a usage_event — all without blocking the stream,
 *      then emit a terminal { saved } sentinel so the client can warn on a
 *      persistence failure instead of silently losing the turn.
 */
router.post('/projects/:id/chat', requireUser, async (req, res) => {
  const id = req.params['id'] as string
  const {
    userMessage,
    history,
    fileTree,
    modelType,
  } = req.body as {
    userMessage?: string
    history?: ChatMessage[]
    fileTree?: FileTree
    modelType?: string
  }

  if (!userMessage) { res.status(400).json({ error: 'userMessage required' }); return }
  if (userMessage.length > PROMPT_MAX) { res.status(400).json({ error: `message too long (max ${PROMPT_MAX} characters)` }); return }

  const apiKey = process.env.OPENAI_API_KEY ?? ''

  // ── 1. Validate the requested model tier BEFORE consuming a credit ─────────
  // The models table is the source of truth for which tiers are enabled. An
  // unknown or disabled tier must be rejected up front: otherwise a credit is
  // billed, a different model runs than the client asked for, and usage_events
  // records a model_type that does not exist in the models table.
  // ── 1. Resolve model ───────────────────────────────────────────────────────
  const admin = adminClient()
  interface ModelRow {
    model_type: string
    provider_model: string
    input_usd_per_mtok: number
    cached_input_usd_per_mtok: number
    output_usd_per_mtok: number
    is_default: boolean
  }

  const { data: modelRows, error: modelsErr } = await admin
    .from('models')
    .select('model_type,provider_model,input_usd_per_mtok,cached_input_usd_per_mtok,output_usd_per_mtok,is_default')
    .eq('enabled', true)

  if (modelsErr) {
    errorResponse(res, 500, 'Failed to resolve model tiers', modelsErr, { route: 'POST /api/projects/:id/chat' })
    return
  }

  const enabledModels = (modelRows ?? []) as ModelRow[]
  const enabledModelTypes = enabledModels.map((m) => m.model_type)

  if (modelType !== undefined && !enabledModelTypes.includes(modelType)) {
    res.status(400).json({
      error: `unknown or disabled modelType: ${modelType}`,
      enabledModelTypes,
    })
    return
  }

  const modelRow = modelType
    ? enabledModels.find((m) => m.model_type === modelType) ?? null
    : enabledModels.find((m) => m.is_default) ?? enabledModels[0] ?? null

  if (!modelRow) {
    errorResponse(res, 500, 'No enabled model tiers are configured', undefined, { route: 'POST /api/projects/:id/chat' })
    return
  }

  const providerModel = modelRow.provider_model
  // Never echo a client-supplied tier back into the DB: the recorded tier always
  // comes from the enabled models row that actually runs.
  const resolvedModelType = modelRow.model_type

  // ── 2. Rate limit (only after the requested tier is known to be valid) ─────
  const { data: allowed, error: rpcErr } = await req.supabase.rpc('consume_prompt', {
    p_user: req.user.id,
  })
  if (rpcErr) {
    errorResponse(res, 500, 'Failed to verify account prompt quota', rpcErr, { route: 'POST /api/projects/:id/chat' })
    return
  }
  if (allowed === false) {
    res.status(429).json({ error: 'rate_limited' })
    return
  }

  // ── 2. Guardrail ───────────────────────────────────────────────────────────
  const guardrail = await checkGuardrail({
    apiKey,
    model: providerModel,
    userMessage,
    ongoing: (history?.length ?? 0) > 0,
  })

  // ── 3b. Account for the guardrail classifier's tokens ──────────────────────
  // The guardrail is a full LLM call on EVERY prompt (allowed or blocked), so its
  // tokens are real spend. Record a `guardrail` usage_event before responding so
  // the Profile usage view is not under-reported by one call per prompt.
  const guardrailInputTokens = guardrail.usage?.inputTokens ?? 0
  const guardrailOutputTokens = guardrail.usage?.outputTokens ?? 0
  const guardrailCostUsd =
    (guardrailInputTokens / 1e6) * (modelRow?.input_usd_per_mtok ?? 0.75) +
    (guardrailOutputTokens / 1e6) * (modelRow?.output_usd_per_mtok ?? 4.5)
  await admin.from('usage_events').insert({
    user_id: req.user.id,
    project_id: id,
    message_id: null,
    kind: 'guardrail',
    model_type: resolvedModelType,
    provider_model: providerModel,
    prompt_tokens: guardrailInputTokens,
    completion_tokens: guardrailOutputTokens,
    cost_usd: guardrailCostUsd,
  })

  if (!guardrail.allowed) {
    // Persist user + blocked assistant messages, then return
    const userSeq = await nextSeq(req.supabase, id)
    await req.supabase.from('messages').insert({
      project_id: id,
      seq: userSeq,
      role: 'user',
      content: userMessage,
    })

    const assistantSeq = userSeq + 1
    const blockedContent = guardrail.refusal || refusalMessage(guardrail.category)
    const { data: blockedMsg } = await req.supabase
      .from('messages')
      .insert({
        project_id: id,
        seq: assistantSeq,
        role: 'assistant',
        content: blockedContent,
        kind: 'blocked',
      })
      .select()
      .single()

    res.json({ blocked: true, message: blockedMsg })
    return
  }

  // ── 3. Rate limit ──────────────────────────────────────────────────────────
  const { data: allowed, error: rpcErr } = await req.supabase.rpc('consume_prompt', {
    p_user: req.user.id,
  })
  if (rpcErr) {
    errorResponse(res, 500, 'Failed to verify account prompt quota', rpcErr, { route: 'POST /api/projects/:id/chat' })
    return
  }
  if (allowed === false) {
    res.status(429).json({ error: 'rate_limited' })
    return
  }

  // ── 4. Stream ──────────────────────────────────────────────────────────────
  const catalog = await listManifests()
  const streamResult = streamChat({
    apiKey,
    model: providerModel,
    fileTree: fileTree ?? {},
    history: history ?? [],
    userMessage,
    catalog,
  })

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Transfer-Encoding', 'chunked')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  // Pipe the text stream to the response as it arrives
  const reader = streamResult.textStream
  for await (const chunk of reader) {
    res.write(chunk)
  }

  // ── 5. Persist (after stream, before end) ─────────────────────────────────
  // We fire persistence here — after the stream is done — so it doesn't delay
  // the client. A failure must not crash the response, but it must not be
  // SILENT either: the client is told the turn was not saved.
  let saved = true
  try {
    const [agentResponse, usageData] = await Promise.all([
      streamResult.object,
      streamResult.usage,
    ])

    const promptTokens = usageData?.inputTokens ?? 0
    const completionTokens = usageData?.outputTokens ?? 0

    // Cost calculation — rates come from the enabled models row that ran.
    const inputRate = modelRow.input_usd_per_mtok
    const outputRate = modelRow.output_usd_per_mtok
    const costUsd = (promptTokens / 1e6) * inputRate + (completionTokens / 1e6) * outputRate

    // Persist user message first
    const userMsgSeq = await nextSeq(req.supabase, id)
    const { data: userMsg } = await req.supabase
      .from('messages')
      .insert({
        project_id: id,
        seq: userMsgSeq,
        role: 'user',
        content: userMessage,
      })
      .select('id')
      .single()

    // Optionally create a version if files changed
    let versionId: string | null = null
    if (agentResponse.files && agentResponse.files.length > 0) {
      // Build updated file tree
      const updatedFiles: FileTree = { ...(fileTree ?? {}) }
      for (const op of agentResponse.files) {
        if (op.op === 'delete') {
          delete updatedFiles[op.path]
        } else {
          updatedFiles[op.path] = op.content
        }
      }

      // Next version seq
      const { data: lastVersion } = await req.supabase
        .from('project_versions')
        .select('seq')
        .eq('project_id', id)
        .order('seq', { ascending: false })
        .limit(1)
        .single()

      const vSeq = (lastVersion?.seq ?? 0) + 1
      const { data: version } = await req.supabase
        .from('project_versions')
        .insert({
          project_id: id,
          seq: vSeq,
          label: agentResponse.versionName,
          summary: agentResponse.message,
          files: updatedFiles,
        })
        .select('id')
        .single()

      versionId = version?.id ?? null

      // Update project current_files
      await req.supabase
        .from('projects')
        .update({ current_files: updatedFiles })
        .eq('id', id)
    }

    // Persist assistant message
    const assistantSeq = userMsgSeq + 1
    const fileSummary = agentResponse.files?.map(({ op, path }) => ({ op, path })) ?? null
    const { data: assistantMsg } = await req.supabase
      .from('messages')
      .insert({
        project_id: id,
        seq: assistantSeq,
        role: 'assistant',
        content: agentResponse.message,
        files: fileSummary,
        actions: agentResponse.actions?.length ? agentResponse.actions : null,
        version_id: versionId,
        model_type: resolvedModelType,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cost_usd: costUsd,
      })
      .select('id')
      .single()

    // Usage event (adminClient — no INSERT policy for authenticated role)
    await admin.from('usage_events').insert({
      user_id: req.user.id,
      project_id: id,
      message_id: assistantMsg?.id ?? userMsg?.id ?? null,
      kind: 'generation',
      model_type: resolvedModelType,
      provider_model: providerModel,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd: costUsd,
    })
  } catch (persistErr) {
    // Persistence errors must not crash the response. Log the real error (with
    // the project id) server-side; never leak it raw to the client.
    saved = false
    console.error(`[chat] persistence error for project ${id}:`, persistErr)
  }

  // Terminal sentinel — the client reads the LAST line to learn whether the turn
  // was persisted. `error` is a stable code, never the raw error text.
  res.write(
    '\n' + JSON.stringify(saved ? { saved: true } : { saved: false, error: 'save_failed' }) + '\n',
  )

  res.end()
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Compute the next message seq for a project. */
async function nextSeq(
  supabase: Express.Request['supabase'],
  projectId: string,
): Promise<number> {
  const { data } = await supabase
    .from('messages')
    .select('seq')
    .eq('project_id', projectId)
    .order('seq', { ascending: false })
    .limit(1)
    .single()
  return ((data as { seq?: number } | null)?.seq ?? 0) + 1
}

export default router
