-- AXO Visibility Scanner v1.3 — allow serverless endpoint to insert with publishable/anon key.
-- Public SELECT remains blocked by RLS (no SELECT policy is created).

grant insert on table public.visibility_scans to anon, authenticated;

drop policy if exists "scanner_insert_only" on public.visibility_scans;
create policy "scanner_insert_only"
on public.visibility_scans
for insert
to anon, authenticated
with check (true);
