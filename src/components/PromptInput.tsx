import { useRef, useState, type KeyboardEvent } from 'react'
import { PROMPT_MAX } from '../../shared/types'

/** Auto-clearing prompt box. Enter sends, Shift+Enter newlines.
 *  Type `@` to reference a file from the project (autocomplete over filePaths). */
export function PromptInput({
  onSend,
  busy,
  onStop,
  placeholder = 'Describe the app you want to build…',
  autoFocus,
  filePaths = [],
}: {
  onSend: (text: string) => void
  busy: boolean
  /** Abort the in-flight request (shown as a Stop button while busy). */
  onStop?: () => void
  placeholder?: string
  autoFocus?: boolean
  filePaths?: string[]
}) {
  const [value, setValue] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  // Active @-mention being typed: the query and where the '@' starts.
  const [mention, setMention] = useState<{ query: string; start: number } | null>(
    null,
  )
  const [activeIndex, setActiveIndex] = useState(0)
  // When the user navigates away (←/→), keep the menu closed until a fresh '@'.
  const dismissedRef = useRef(false)

  const matches =
    mention && filePaths.length
      ? filePaths
          .filter((p) => p.toLowerCase().includes(mention.query.toLowerCase()))
          .slice(0, 8)
      : []

  const refreshMention = (text: string, caret: number) => {
    if (text[caret - 1] === '@') dismissedRef.current = false // fresh '@'
    if (dismissedRef.current) return setMention(null)
    const before = text.slice(0, caret)
    const at = before.lastIndexOf('@')
    if (at === -1 || /\s/.test(before.slice(at + 1))) return setMention(null)
    setMention({ query: before.slice(at + 1), start: at })
    setActiveIndex(0)
  }

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    refreshMention(e.target.value, e.target.selectionStart)
  }

  const insertMention = (path: string) => {
    if (!mention) return
    const caret = taRef.current?.selectionStart ?? value.length
    const next = `${value.slice(0, mention.start)}@${path} ${value.slice(caret)}`
    setValue(next)
    setMention(null)
    requestAnimationFrame(() => taRef.current?.focus())
  }

  const submit = () => {
    const text = value.trim()
    if (!text || busy) return
    setValue('')
    setMention(null)
    onSend(text)
  }

  const menuOpen = mention !== null && matches.length > 0
  const count = value.length
  const countColor =
    count >= PROMPT_MAX
      ? 'text-[var(--danger)]'
      : count >= PROMPT_MAX - 200
        ? 'text-[var(--gold-dk)]'
        : 'text-[var(--muted2)]'

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, matches.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(matches[Math.min(activeIndex, matches.length - 1)])
        return
      }
      if (e.key === 'Escape' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // Navigating away closes the menu until the user types '@' again.
        dismissedRef.current = true
        setMention(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="relative rounded-xl border-2 border-[var(--ink)] bg-[var(--surface)] p-2 transition-colors focus-within:border-[var(--gold-dk)]">
      {menuOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-72 overflow-hidden rounded-lg border-2 border-[var(--ink)] bg-[var(--surface)] p-1 shadow-[4px_4px_0_var(--shadow)]">
          {matches.map((p, i) => (
            <button
              key={p}
              onClick={() => insertMention(p)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`block w-full truncate rounded-md px-2.5 py-1.5 text-left text-[12.5px] ${
                i === activeIndex
                  ? 'bg-[var(--gold-soft)] text-[var(--ink)]'
                  : 'text-[var(--muted)] hover:bg-[var(--bg2)] hover:text-[var(--ink)]'
              }`}
            >
              <span className="text-[var(--muted3)]">@</span>
              {p}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={taRef}
        autoFocus={autoFocus}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        rows={2}
        maxLength={PROMPT_MAX}
        placeholder={placeholder}
        className="max-h-40 w-full select-text resize-none bg-transparent px-2 py-1.5 text-[14px] text-[var(--ink)] placeholder:text-[var(--muted3)] focus:outline-none"
      />
      <div className="flex items-center justify-between px-1 pt-1">
        <span className="text-[11px] text-[var(--muted2)]">
          ↵ to send · ⇧↵ newline{filePaths.length ? ' · @ to reference a file' : ''}
        </span>
        <div className="flex items-center gap-2.5">
          {busy && onStop && (
            <button
              onClick={onStop}
              className="rounded-full border-2 border-[var(--ink)] bg-[var(--bg2)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface)]"
            >
              Stop
            </button>
          )}
          <span className={`text-[11px] font-semibold tabular-nums ${countColor}`}>
            {count}/{PROMPT_MAX}
          </span>
          <button
            onClick={submit}
            disabled={busy || !value.trim()}
            className="rounded-full border-2 border-[var(--ink)] bg-[var(--gold)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--gink)] transition-all duration-150 ease-out hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--shadow)] disabled:cursor-not-allowed disabled:border-[var(--marquee)] disabled:bg-[var(--bg2)] disabled:text-[var(--muted3)] disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {busy ? 'Working…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
