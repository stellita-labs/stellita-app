# Changes

In-flight change proposals live in this directory (`openspec/changes/`), one folder per proposal, following the [OpenSpec](https://openspec.dev/) workflow described in [`openspec/project.md`](../project.md). When no proposals are in flight, this directory contains only this `README.md`.

## Directory Layout

Each active change proposal uses the following structure:

```text
openspec/
  project.md
  specs/                      # current capability specs (source of truth)
  changes/
    README.md                 # this guide
    <change-id>/              # e.g. add-contract-export/
      proposal.md             # why + what is changing
      tasks.md                # implementation checklist
      design.md               # technical decisions (optional)
      specs/
        <capability>/
          spec.md             # spec deltas (ADDED / MODIFIED / REMOVED)
```

## Worked Example: Creating a Compliant Change Folder

To propose a change (for example, `openspec/changes/add-contract-export/`):

### 1. `proposal.md`

```markdown
# Proposal: Add Contract Export

## Why
Users need to export generated contract manifests alongside the frontend bundle.

## What Changes
- Expose manifest metadata in the project export archive.
- Document the export format in the `contracts` capability spec.
```

### 2. `tasks.md`

```markdown
# Tasks

- [ ] 1.1 Include contract manifest JSON in the project ZIP archive
- [ ] 1.2 Verify `pnpm typecheck && pnpm lint && pnpm build` pass
```

### 3. `specs/<capability>/spec.md`

Use the OpenSpec delta headers (`## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`):

```markdown
# Contracts Specification Delta

## ADDED Requirements

### Requirement: Manifest Export in Project Archive
The system SHALL include active contract manifests when exporting a project archive.

#### Scenario: Exporting a project with a deployed contract
- **WHEN** a user exports a project that references a contract manifest
- **THEN** the exported archive includes the corresponding manifest JSON file
```

## Lifecycle

1. Create `openspec/changes/<change-id>/` with `proposal.md`, `tasks.md`, and `specs/<capability>/spec.md` (plus optional `design.md`).
2. Implement the change and verify `pnpm typecheck && pnpm lint && pnpm build` pass.
3. When the change ships, fold its spec deltas into `openspec/specs/<capability>/spec.md` (the source of truth) and delete `openspec/changes/<change-id>/`.
