-- Guardian Enviroclean — core job data model (Neon Postgres).
--
-- Ported from the abandoned Supabase foundation (see git history /
-- docs/neon-foundation.md for the previous supabase/migrations/*.sql).
-- The domain shape (columns, constraints, indexes, money types) is
-- preserved as-is. What is deliberately NOT ported:
--
--   - the `private` schema, `private.admin_users`, `private.is_admin()`
--   - Row Level Security and its policies on `jobs` / `job_photos`
--
-- Those existed because Supabase's Data API lets the browser query
-- Postgres directly as the `anon`/`authenticated` roles, so RLS was the
-- only thing standing between a browser and the tables. Neon Postgres
-- here is reached exclusively from trusted Next.js server-side code
-- using one application-level Postgres role (DATABASE_URL) — there is no
-- per-browser-user Postgres role and no `auth.uid()` session variable for
-- a policy to key off. Authorization (restricting the Job Manager to
-- Cecil) is enforced in the application layer instead — see
-- docs/neon-foundation.md.
--
-- status / service / source are `text` + `check` rather than native
-- `enum` types: for a small, evolving business app, adding or renaming a
-- category is a plain `alter table ... drop constraint / add constraint`,
-- where altering an enum type (especially removing/renaming a value) is
-- more awkward. gen_random_uuid() is built into Postgres core since
-- v13 (no extension required).

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),

  customer_name text not null,
  phone text not null,

  service text not null
    check (service in ('MATTRESS', 'SOFA_COUCH', 'CARPET_RUG', 'CAR_INTERIOR', 'OTHER')),

  -- Nullable: the website form validates these as required before
  -- submission, but Cecil may create a manual WhatsApp/referral enquiry
  -- before all the details are known and fill them in later.
  area text,
  description text,

  status text not null default 'NEW_ENQUIRY'
    check (status in ('NEW_ENQUIRY', 'QUOTED', 'CONFIRMED', 'SCHEDULED', 'COMPLETED', 'PAID')),

  -- Money as numeric, never float — avoids floating-point rounding on
  -- currency. Distinct on purpose: what was quoted, what was actually
  -- received, and what the job cost Guardian are three different things.
  -- Approximate profit (amount_paid - job_costs) is derived at read time,
  -- never stored, so it can't drift out of sync with its inputs.
  quoted_amount numeric(10, 2),
  amount_paid numeric(10, 2),
  job_costs numeric(10, 2),

  scheduled_at timestamptz,

  source text not null
    check (source in ('WEBSITE', 'WHATSAPP', 'REFERRAL', 'OTHER')),
  source_note text,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table jobs is
  'A cleaning enquiry/job, from first contact through payment.';
comment on column jobs.area is 'Nullable at the DB level — required by the website form, optional for a manually-created enquiry.';
comment on column jobs.description is 'Nullable at the DB level — required by the website form, optional for a manually-created enquiry.';
comment on column jobs.quoted_amount is 'What Cecil quoted. Not revenue received.';
comment on column jobs.amount_paid is 'What Guardian actually received for this job.';
comment on column jobs.job_costs is 'Guardian''s approximate direct cost for the job.';

create index if not exists jobs_status_idx on jobs (status);
create index if not exists jobs_created_at_idx on jobs (created_at desc);

-- Reusable updated_at maintenance, applied per-table via a trigger so it
-- stays correct even for writes made outside the application.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_set_updated_at on jobs;
create trigger jobs_set_updated_at
  before update on jobs
  for each row
  execute function set_updated_at();

create table if not exists job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  -- Path within the private `uploads` Neon Object Storage bucket, never a
  -- public URL — access is via short-lived presigned URLs generated for
  -- an authenticated, authorized Guardian admin session.
  storage_path text not null,
  created_at timestamptz not null default now()
);

comment on table job_photos is
  'Photos attached to a job. storage_path points into the private "uploads" bucket.';
comment on column job_photos.storage_path is
  'Object key inside the Neon Object Storage "uploads" bucket. Never a public URL — presign on read.';

-- Postgres does not automatically index foreign-key columns — without
-- this, every cascade delete from jobs and every "photos for this job"
-- lookup would be a sequential scan.
create index if not exists job_photos_job_id_idx on job_photos (job_id);
