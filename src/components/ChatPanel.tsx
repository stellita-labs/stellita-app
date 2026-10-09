import { useEffect, useRef, useState } from 'react'
import {
  Check,
  FilePlus2,
  FilePen,
  Trash2,
  Pencil,
  Copy,
  ChevronRight,
  ChevronDown,
  Coins,
  Wallet,
  Loader2,
  Lock,
} from 'lucide-react'
import type { AgentAction, ChatMessage } from '../../shared/types'
import type { Activity } from '../lib/api'
import { PromptInput } from './PromptInput'

/** Left column: header (chat name) + conversation history + live activity + input. */
export function ChatPanel({
  projectName,
  onRename,
  messages,
  busy,
  error,
  activity,
  streamingMessage,
  filePaths,
  onSend,
  onStop,
  onRunActions,
  onSkipActions,
  readOnly = false,
  onClone,
  signedIn = true,
  cloning = false,
}: {
  projectName: string
  onRename: (name: string) => void
  messages: ChatMessage[]
  busy: boolean
  error: string | null
  activity: Activity[]
  streamingMessage: string
  filePaths: string[]
  onSend: (text: string) => void
  /** Abort the in-flight chat request (Stop button while streaming). */
  onStop?: () => void
  onRunActions: (messageIndex: number, actions: AgentAction[]) => Promise<void>
  onSkipActions: (messageIndex: number) => void
  /** Read-only view (template/shared): no chat, show a clone/sign-in CTA. */
  readOnly?: boolean
  onClone?: () => void | Promise<void>
  /** Whether the viewer is logged in — drives the CTA label (Sign in vs Clone). */
  signedIn?: boolean
  /** External clone-in-progress flag (parent owns it, e.g. after login). */
  cloning?: boolean
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const [renaming, setRenaming] = useState(false)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy, activity, streamingMessage])

  return (
    <section className="flex h-full flex-col bg-[var(--bg)] text-[var(--ink)]">
      {/* Header — same height as the workspace tabs row */}
      <header className="flex shrink-0 items-center border-b-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-2.5">
        {readOnly ? (
          <div className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-[13px] text-[var(--ink)]">
            <span className="truncate font-medium">{projectName}</span>
            <span className="shrink-0 rounded-full border-2 border-[var(--ink)] px-2 py-0.5 text-[10.5px] uppercase tracking-wide text-[var(--muted)]">
              Read-only
            </span>
          </div>
        ) : (
          <button
            onClick={() => setRenaming(true)}
            title="Rename chat"
            className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-[var(--ink)] transition-colors hover:bg-[var(--bg2)]"
          >
            <span className="truncate font-medium">{projectName}</span>
            <Pencil className="h-3.5 w-3.5 shrink-0 text-[var(--muted2)]" />
          </button>
        )}
      </header>

      {renaming && (
        <RenameModal
          current={projectName}
          onClose={() => setRenaming(false)}
          onSave={(name) => {
            onRename(name)
            setRenaming(false)
          }}
        />
      )}

      <div className="flex-1 select-text space-y-4 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <Message
            key={i}
            {...m}
            messageIndex={i}
            onRunActions={onRunActions}
            onSkipActions={onSkipActions}
          />
        ))}
        {busy && (
          <ThinkingTrace activity={activity} message={streamingMessage} />
        )}
        {error && (
          <div className="rounded-lg border-2 border-[var(--ink)] bg-[#FFD9D9] px-3 py-2 text-[13px] text-[#7a1f1f]">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t-2 border-[var(--ink)] bg-[var(--surface)] p-4">
        {readOnly ? (
          <CloneCta onClone={onClone} signedIn={signedIn} cloning={cloning} />
        ) : (
          <PromptInput onSend={onSend} busy={busy} onStop={onStop} filePaths={filePaths} />
        )}
      </div>
    </section>
  )
}

/** Read-only composer: a locked input + a clone / sign-in CTA. Looks like the
 *  real chat box, but you must sign in and clone before you can edit. */
function CloneCta({
  onClone,
  signedIn = true,
  cloning: externalCloning = false,
}: {
  onClone?: () => void | Promise<void>
  signedIn?: boolean
  cloning?: boolean
}) {
  const [internalCloning, setInternalCloning] = useState(false)
  const cloning = externalCloning || internalCloning
  const handle = async () => {
    if (!onClone || cloning) return
    setInternalCloning(true)
    try {
      await onClone()
    } finally {
      setInternalCloning(false)
    }
  }
  return (
    <div className="flex flex-col gap-2.5">
      {/* Locked composer — mirrors the real prompt box but disabled */}
      <div className="flex items-center gap-2 rounded-xl border-2 border-[var(--ink)] bg-[var(--bg2)] px-3.5 py-3 text-[13px] text-[var(--muted2)]">
        <Lock className="h-4 w-4 shrink-0" />
        {signedIn ? 'Clone this project to edit it with the AI' : 'Sign in to edit this project with the AI'}
      </div>
      <button
        onClick={() => void handle()}
        disabled={cloning}
        style={{ boxShadow: '4px 4px 0 var(--shadow)' }}
        className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-[var(--ink)] bg-[var(--gold)] py-2.5 text-[14px] font-medium text-[var(--gink)] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {cloning ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Cloning…
          </>
        ) : signedIn ? (
          <>
            <Copy className="h-4 w-4" />
            Clone to build
          </>
        ) : (
          'Sign in to code'
        )}
      </button>
    </div>
  )
}

function timeAgo(ts?: number): string {
  if (!ts) return ''
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function CopyButton({ text, light }: { text: string; light?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      title="Copy message"
      className={`rounded p-1 transition-colors ${
        light
          ? 'text-[var(--muted2)] hover:text-[var(--ink)]'
          : 'text-[var(--muted2)] hover:text-[var(--ink)]'
      }`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  )
}

function Message({
  role,
  content,
  files,
  versionName,
  createdAt,
  stats,
  actions,
  actionsDone,
  kind,
  messageIndex,
  onRunActions,
  onSkipActions,
}: ChatMessage & {
  messageIndex: number
  onRunActions: (messageIndex: number, actions: AgentAction[]) => Promise<void>
  onSkipActions: (messageIndex: number) => void
}) {
  const isUser = role === 'user'
  const [expanded, setExpanded] = useState(false)
  const long = content.length > 300 || content.split('\n').length > 6

  // System messages render as a subtle centered note, not a bubble.
  if (kind === 'system') {
    return (
      <div className="flex justify-center px-4 py-1">
        <span className="text-center text-[12px] text-[var(--muted2)]">{content}</span>
      </div>
    )
  }

  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div className={`flex w-full flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`max-w-[90%] rounded-2xl border-2 border-[var(--ink)] px-3.5 py-2 text-[13.5px] ${
            isUser
              ? 'rounded-br-sm bg-[var(--gold-soft)] text-[var(--ink)]'
              : 'rounded-bl-sm bg-[var(--surface)] text-[var(--ink)]'
          }`}
        >
          {!isUser && versionName && (
            <div className="mb-1 text-[11px] font-medium text-[var(--muted2)]">
              {versionName}
            </div>
          )}
          <div
            className={`whitespace-pre-wrap ${
              long && !expanded ? 'max-h-28 overflow-hidden' : ''
            }`}
          >
            {content}
          </div>
          {long && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="mt-1 text-[12px] font-medium text-[var(--muted2)] hover:opacity-80"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {/* Action cards — shown when the assistant proposed actions and they haven't been resolved. */}
        {actions && actions.length > 0 && !actionsDone && (
          <ActionCards
            actions={actions}
            messageIndex={messageIndex}
            onRun={onRunActions}
            onSkip={onSkipActions}
          />
        )}

        {/* Footer: agent → "Worked for" summary; both → timestamp + copy (bottom-right) */}
        {stats ? (
          <WorkedFor
            stats={stats}
            files={files}
            createdAt={createdAt}
            content={content}
          />
        ) : (
          <div className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--muted3)]">
            {createdAt && <span>{timeAgo(createdAt)}</span>}
            <CopyButton text={content} />
          </div>
        )}
      </div>
    </div>
  )
}

/** Renders a card per proposed action with a shared Confirm / Skip footer. */
function ActionCards({
  actions,
  messageIndex,
  onRun,
  onSkip,
}: {
  actions: AgentAction[]
  messageIndex: number
  onRun: (messageIndex: number, actions: AgentAction[]) => Promise<void>
  onSkip: (messageIndex: number) => void
}) {
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setRunning(true)
    setRunError(null)
    try {
      await onRun(messageIndex, actions)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="w-full max-w-[90%] space-y-2">
      {actions.map((action, i) => (
        <ActionCard key={i} action={action} />
      ))}
      {runError && (
        <div className="rounded-lg border-2 border-[var(--ink)] bg-[#FFD9D9] px-3 py-2 text-[12px] text-[#7a1f1f]">
          {runError}
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => void handleConfirm()}
          disabled={running}
          style={{ boxShadow: '3px 3px 0 var(--shadow)' }}
          className="flex items-center gap-1.5 rounded-lg border-2 border-[var(--ink)] bg-[var(--gold)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--gink)] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running…
            </>
          ) : (
            'Confirm'
          )}
        </button>
        <button
          onClick={() => onSkip(messageIndex)}
          disabled={running}
          className="rounded-lg px-3.5 py-1.5 text-[12.5px] text-[var(--muted2)] transition-colors hover:text-[var(--ink)] disabled:opacity-50"
        >
          Skip
        </button>
      </div>
    </div>
  )
}

function ActionCard({ action }: { action: AgentAction }) {
  if (action.type === 'deploy_contract') {
    let configEntries: [string, unknown][] = []
    try {
      const parsed = JSON.parse(action.configJson) as Record<string, unknown>
      configEntries = Object.entries(parsed)
    } catch {
      // configJson unparseable — show nothing
    }
    return (
      <div className="rounded-lg border-2 border-[var(--ink)] bg-[var(--bg2)] px-3.5 py-3 text-[12.5px]">
        <div className="flex items-center gap-2 text-[var(--ink)]">
          <Coins className="h-4 w-4 shrink-0 text-[var(--muted2)]" />
          <span className="font-medium">Deploy contract</span>
          <code className="ml-auto truncate font-mono text-[11.5px] text-[var(--muted2)]">{action.manifestId}</code>
        </div>
        <p className="mt-1.5 text-[var(--muted)]">{action.reason}</p>
        {configEntries.length > 0 && (
          <ul className="mt-2 space-y-0.5 border-t-2 border-[var(--ink)] pt-2">
            {configEntries.map(([k, v]) => (
              <li key={k} className="flex items-center gap-1.5 text-[11.5px]">
                <span className="text-[var(--muted2)]">{k}:</span>
                <span className="font-mono text-[var(--ink)]">{String(v)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // create_wallet
  return (
    <div className="rounded-lg border-2 border-[var(--ink)] bg-[var(--bg2)] px-3.5 py-3 text-[12.5px]">
      <div className="flex items-center gap-2 text-[var(--ink)]">
        <Wallet className="h-4 w-4 shrink-0 text-[var(--muted2)]" />
        <span className="font-medium">Create test wallet</span>
        <code className="ml-auto truncate font-mono text-[11.5px] text-[var(--muted2)]">{action.label}</code>
      </div>
      <p className="mt-1.5 text-[var(--muted)]">{action.reason}</p>
    </div>
  )
}

/** v0-style collapsible "Worked for {time}" footer for assistant turns. */
function WorkedFor({
  stats,
  files,
  createdAt,
  content,
}: {
  stats: NonNullable<ChatMessage['stats']>
  files?: ChatMessage['files']
  createdAt?: number
  content: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="w-full max-w-[90%] overflow-hidden rounded-lg border-2 border-[var(--ink)] bg-[var(--surface)]">
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11.5px] text-[var(--muted2)]">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 hover:text-[var(--ink)]"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          Worked for {fmtDuration(stats.durationMs)}
        </button>
        {createdAt && <span className="text-[var(--muted3)]">· {timeAgo(createdAt)}</span>}
        <div className="ml-auto">
          <CopyButton text={content} />
        </div>
      </div>
      {open && (
        <div className="space-y-1.5 border-t-2 border-[var(--ink)] px-3 py-2 text-[11.5px]">
          <Stat label="Files modified" value={`${stats.filesModified}`} />
          <Stat label="Lines changed" value={`+${stats.added} -${stats.removed}`} />
          {files && files.length > 0 && (
            <ul className="mt-1.5 space-y-1 border-t-2 border-[var(--ink)] pt-2">
              {files.map((a, i) => {
                const Icon = OP_ICON[a.op]
                return (
                  <li
                    key={i}
                    className="flex items-center gap-1.5 text-[11.5px] text-[var(--muted2)]"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{VERB[a.op]}</span>
                    <code className="truncate font-mono text-[var(--muted)]">{a.path}</code>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--muted2)]">{label}</span>
      <span className="font-mono text-[var(--ink)]">{value}</span>
    </div>
  )
}

const VERB: Record<Activity['op'], string> = {
  create: 'Creating',
  edit: 'Editing',
  delete: 'Deleting',
}
const OP_ICON = { create: FilePlus2, edit: FilePen, delete: Trash2 }

/** v0-style live trace: streaming message + a list of files being touched. */
function ThinkingTrace({
  activity,
  message,
}: {
  activity: Activity[]
  message: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {message && (
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm border-2 border-[var(--ink)] bg-[var(--surface)] px-3.5 py-2 text-[13.5px] whitespace-pre-wrap text-[var(--ink)]">
          {message}
        </div>
      )}
      <div className="rounded-xl border-2 border-[var(--ink)] bg-[var(--bg2)] px-3 py-2.5">
        {activity.length === 0 ? (
          <div className="flex items-center gap-2 text-[12.5px] text-[var(--muted)]">
            <img
              src="/stellita/mascot-thinking.gif"
              alt=""
              className="h-5 w-5 shrink-0"
              style={{ imageRendering: 'pixelated' }}
            />
            Thinking…
          </div>
        ) : (
          <ul className="space-y-1.5">
            {activity.map((a, i) => {
              const last = i === activity.length - 1
              const Icon = OP_ICON[a.op]
              return (
                <li key={i} className="flex items-center gap-2 text-[12.5px]">
                  {last ? (
                    <img
                      src="/stellita/mascot-loading.gif"
                      alt=""
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  ) : (
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  )}
                  <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--muted2)]" />
                  <span className="text-[var(--muted2)]">{VERB[a.op]}</span>
                  <code className="truncate font-mono text-[var(--ink)]">{a.path}</code>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Centered modal to rename the current chat/project. */
function RenameModal({
  current,
  onClose,
  onSave,
}: {
  current: string
  onClose: () => void
  onSave: (name: string) => void
}) {
  const [value, setValue] = useState(current)
  const save = () => {
    if (value.trim()) onSave(value)
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border-2 border-[var(--ink)] bg-[var(--surface)] p-5"
        style={{ boxShadow: '6px 6px 0 var(--shadow)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-medium text-[var(--ink)]">Rename chat</h2>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') onClose()
          }}
          className="mt-4 w-full select-text rounded-lg border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--gold-dk)]"
        />
        <div className="mt-5 flex justify-end gap-2 text-[13px]">
          <button
            onClick={onClose}
            className="rounded-lg px-3.5 py-1.5 text-[var(--muted2)] hover:text-[var(--ink)]"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!value.trim()}
            style={{ boxShadow: '3px 3px 0 var(--shadow)' }}
            className="rounded-lg border-2 border-[var(--ink)] bg-[var(--gold)] px-3.5 py-1.5 font-medium text-[var(--gink)] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
