import { useState, useEffect } from 'react'
import { Navigate, useParams, useNavigate } from 'react-router-dom'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ChatPanel } from '../components/ChatPanel'
import { WorkspacePanel } from '../components/WorkspacePanel'
import { MobileEditor } from '../components/MobileEditor'
import { useIsMobile } from '../hooks/useIsMobile'
import { useProjects } from '../projects/store'
import { useAuth } from '../auth/store'
import { getFreighterAddress } from '../wallet/freighterBridge'
import { fetchCatalog, deployContract } from '../lib/contracts'
import { emailShareLink } from '../lib/backend'
import type { AgentAction } from '../../shared/types'

/** Route "/projects/:slug" — resizable chat | workspace (v0-style). */
export function Editor() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const {
    ready,
    getProject,
    send,
    stop,
    openVersion,
    restoreVersion,
    renameProject,
    syncFiles,
    discardEdits,
    markSaved,
    createEntry,
    deleteEntry,
    addDeployedContract,
    resolveMessageActions,
    cloneProject,
    setVisibility,
  } = useProjects()
  const { refreshCredits } = useAuth()
  const isMobile = useIsMobile()
  const project = slug ? getProject(slug) : undefined
  // While dragging the divider, kill pointer events on the preview so the
  // Sandpack iframe doesn't swallow the mouse and freeze the resize.
  const [resizing, setResizing] = useState(false)

  // Refresh the credit balance whenever a prompt finishes (busy → false), so
  // the sidebar bar drops right after each message. Consumption is enforced
  // server-side; this only re-reads the count.
  const busy = project?.busy
  useEffect(() => {
    if (busy === false) void refreshCredits()
  }, [busy, refreshCredits])

  // Don't decide the project is missing until the list has loaded — otherwise a
  // hard reload / direct URL redirects away before the project is even known.
  if (!project) {
    if (!ready) {
      return (
        <div className="flex h-full items-center justify-center bg-[var(--bg)] text-[13px] text-[var(--muted2)]">
          Loading project…
        </div>
      )
    }
    // Genuinely unknown (or just-deleted) → back to the authed home.
    return <Navigate to="/app" replace />
  }

  const handleSkipActions = (i: number) => {
    resolveMessageActions(project.slug, i)
  }

  const handleClone = async () => {
    const sourceId = project.cloneSourceId ?? project.id
    if (!sourceId) return
    const newSlug = await cloneProject(sourceId)
    navigate(`/projects/${newSlug}`)
  }

  const handleRunActions = async (i: number, actions: AgentAction[]) => {
    const catalog = await fetchCatalog()
    const resultLines: string[] = []

    for (const action of actions) {
      if (action.type === 'deploy_contract') {
        let config: Record<string, unknown> = {}
        try {
          config = JSON.parse(action.configJson) as Record<string, unknown>
        } catch {
          // malformed configJson — treat as empty config
        }
        // Own the contract with the user's Freighter wallet (the one the
        // generated app connects), so its owner-gated writes succeed. The deploy
        // is paid + signed by an ephemeral server account. Fall back silently.
        try {
          config.owner = await getFreighterAddress()
        } catch {
          // no Freighter → owner stays the ephemeral deployer ({{deployer}})
        }
        const r = await deployContract(project.id ?? '', action.manifestId, config)
        const m = catalog.find((x) => x.id === action.manifestId)
        const name = m?.name ?? action.manifestId
        const category = m?.category ?? 'token'
        addDeployedContract(project.slug, {
          manifestId: action.manifestId,
          name,
          category,
          contractId: r.contractId,
          network: 'testnet',
          txHash: r.txHash,
          explorerUrl: r.explorerUrl,
          deployer: r.deployer,
          config,
          createdAt: Date.now(),
        })
        resultLines.push(
          `✅ Deployed ${name} (${action.manifestId}) → ${r.contractId}. Available in /src/contracts.ts as CONTRACTS["${action.manifestId}"].`,
        )
      }
    }

    resolveMessageActions(project.slug, i)
    send(
      project.slug,
      `${resultLines.join('\n')}\n\nContinue building the app using the deployed contract(s).`,
      { kind: 'system' },
    )
  }

  const chatPanel = (
    <ChatPanel
      projectName={project.name}
      onRename={(name) => renameProject(project.slug, name)}
      messages={project.messages}
      busy={project.busy}
      error={project.error}
      activity={project.activity}
      streamingMessage={project.streamingMessage}
      filePaths={Object.keys(project.fileTree)}
      onSend={(text) => send(project.slug, text)}
      onStop={() => stop(project.slug)}
      onRunActions={handleRunActions}
      onSkipActions={handleSkipActions}
      readOnly={project.readOnly}
      onClone={handleClone}
    />
  )

  const workspacePanel = (
    <WorkspacePanel
      fileTree={project.fileTree}
      projectId={project.id ?? ''}
      projectName={project.slug}
      versions={project.versions}
      onOpenVersion={(id) => openVersion(project.slug, id)}
      onRestore={(id) => restoreVersion(project.slug, id)}
      generation={project.generation}
      dirty={project.dirty}
      onSyncFiles={(files) => syncFiles(project.slug, files)}
      onDiscard={() => discardEdits(project.slug)}
      onSave={() => markSaved(project.slug)}
      onCreateFile={(path) => createEntry(project.slug, path)}
      onCreateFolder={(folder) => createEntry(project.slug, `${folder}/.keep`)}
      onDeleteEntry={(path) => deleteEntry(project.slug, path)}
      contracts={project.contracts}
      onDeployed={(c) => addDeployedContract(project.slug, c)}
      readOnly={project.readOnly}
      visibility={project.visibility ?? 'private'}
      shareUrl={
        project.shareToken
          ? `${window.location.origin}/p/${project.shareToken}`
          : ''
      }
      onSetVisibility={(v) => setVisibility(project.id ?? '', v)}
      onEmailShare={(to) => emailShareLink(project.id ?? '', to)}
      onFixError={(err) =>
        send(project.slug, `The app has an error. Please fix it:\n\n${err}`)
      }
    />
  )

  // Mobile: chat + workspace as a top switcher (see MobileEditor). Desktop
  // keeps the resizable side-by-side split, untouched.
  if (isMobile) {
    return <MobileEditor chat={chatPanel} workspace={workspacePanel} />
  }

  return (
    <PanelGroup direction="horizontal" className="relative min-h-0 flex-1">
      {/* While dragging, this overlay sits above the Sandpack iframe so it can't
          swallow the mouse and freeze the resize. */}
      {resizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
      )}
      <Panel defaultSize={34} minSize={22} maxSize={50}>
        {chatPanel}
      </Panel>
      <PanelResizeHandle
        onDragging={setResizing}
        className="w-1 bg-[var(--ink)] transition-colors hover:bg-[var(--gold)]/70 data-[resize-handle-state=drag]:bg-[var(--gold)]"
      />
      <Panel defaultSize={66} minSize={30}>
        <div className={`h-full ${resizing ? 'pointer-events-none' : ''}`}>
          {workspacePanel}
        </div>
      </Panel>
    </PanelGroup>
  )
}
