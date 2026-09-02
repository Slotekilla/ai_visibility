-- AXO AI Visibility Scanner — database schema
create extension if not exists pgcrypto;

create table if not exists public.visibility_scans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  domain text not null,
  service text not null,
  location text not null,
  customer_value text,
  competitors jsonb not null default '[]'::jsonb,
  business_name text,
  mode text not null default 'limited',
  total_score integer not null check (total_score between 0 and 100),
  technical_score integer not null check (technical_score between 0 and 100),
  entity_score integer not null check (entity_score between 0 and 100),
  content_score integer not null check (content_score between 0 and 100),
  authority_score integer not null check (authority_score between 0 and 100),
  discoverability_score integer not null check (discoverability_score between 0 and 100),
  status text not null default 'scan_completed',
  report jsonb not null
);

create index if not exists visibility_scans_created_at_idx on public.visibility_scans (created_at desc);
create index if not exists visibility_scans_email_idx on public.visibility_scans (lower(email));
create index if not exists visibility_scans_domain_idx on public.visibility_scans (domain);

alter table public.visibility_scans enable row level security;

-- No anonymous read/write policies on purpose.
-- The Vercel serverless function writes with SUPABASE_SERVICE_ROLE_KEY.
-- Never expose the service-role key in frontend JavaScript.
