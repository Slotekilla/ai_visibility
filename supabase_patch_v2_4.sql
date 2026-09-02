-- AXO v2.4 — insert-only RLS
alter table public.visibility_scans enable row level security;

grant insert on table public.visibility_scans to anon, authenticated;

drop policy if exists "scanner_insert_only" on public.visibility_scans;

create policy "scanner_insert_only"
on public.visibility_scans
for insert
to anon, authenticated
with check (true);

-- Intentionally no SELECT policy.
-- v2.4 backend does not request the inserted row back.
