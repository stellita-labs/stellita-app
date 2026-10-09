-- Project visibility. Projects are PRIVATE by default — a share link only works
-- once the owner explicitly switches a project to 'link'. This replaces the old
-- model where merely creating a project_shares token made a project public.
--
--   private : only the owner can open it (the /p/:token link 404s for everyone).
--   link    : anyone with the share link can view AND clone it.
--
-- Existing projects default to 'private', so any previously-generated share
-- links stop working until the owner re-enables them — the safe default.

alter table projects
  add column if not exists visibility text not null default 'private'
  check (visibility in ('private', 'link'));

-- Templates are public by design (any authenticated user can read + clone them
-- via is_template / published + the RLS template policies). Mark them 'link' so
-- their visibility is explicit and consistent with how they're accessed. Note:
-- template access does NOT depend on this column — clone_project gates on
-- is_template, and reads go through the projects_select_templates RLS policy —
-- so templates keep working regardless. This is belt-and-suspenders.
update projects set visibility = 'link' where is_template = true;

-- One share token per project. The old /share handler minted a fresh token on
-- every call, so a project could accumulate many live tokens. Collapse any
-- existing duplicates (keep the earliest, id as tiebreaker), then enforce
-- uniqueness so ensureShareToken() is truly idempotent and free of races.
-- destructive: collapses duplicate share tokens (keeps the earliest per project).
delete from project_shares a
  using project_shares b
  where a.project_id = b.project_id
    and (a.created_at > b.created_at
         or (a.created_at = b.created_at and a.id > b.id));

create unique index if not exists project_shares_project_id_key
  on project_shares(project_id);
