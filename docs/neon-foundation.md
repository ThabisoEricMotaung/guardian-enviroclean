# Neon Foundation — Guardian Enviroclean

This is the database/auth/storage foundation for the quote-request
pipeline and the future Guardian job manager. It replaces the earlier,
never-deployed Supabase foundation — see **Migration history** below.
It is infrastructure only: no page in this repo talks to the database,
Auth, or Object Storage yet. Wiring up the quote-submission endpoint and
the Job Manager UI are separate, later milestones.

## Neon project

- Project: **Guardian Enviroclean** (`floral-union-27275715`)
- Branch: `production` (Postgres 18)
- Managed Better Auth: active
- Object Storage: active — private bucket `uploads`
- Declared in `neon.ts` (repo root); reconciled via `neon config plan` /
  `neon config apply` (see the installed `neon` skill under
  `.agents/skills/`).

`neon config plan` currently reports "No changes — branch production
already matches the policy," so nothing further needs to be applied for
Auth or Object Storage.

## Database schema

Plain SQL migrations under `db/migrations/`, applied in filename order.
No ORM — see **Database access** below for why.

**`jobs`** — one row per cleaning enquiry, lifecycle-tracked via `status`.

- `id uuid primary key default gen_random_uuid()`
- `customer_name`, `phone` — `text not null`
- `area`, `description` — nullable `text`. The **website form** validates
  these as required before it will submit; the **database** allows them
  to be null so Cecil can create a manual WhatsApp/referral enquiry
  before every detail is known and fill the rest in later.
- `service` — `text not null`, constrained to `MATTRESS`, `SOFA_COUCH`,
  `CARPET_RUG`, `CAR_INTERIOR`, `OTHER` (the request-quote form's
  "Other / Not Sure" option)
- `status` — `text not null default 'NEW_ENQUIRY'`, constrained to
  `NEW_ENQUIRY`, `QUOTED`, `CONFIRMED`, `SCHEDULED`, `COMPLETED`, `PAID`
- `source` — `text not null`, constrained to `WEBSITE`, `WHATSAPP`,
  `REFERRAL`, `OTHER`
- `source_note`, `notes` — nullable `text`
- `quoted_amount`, `amount_paid`, `job_costs` — nullable `numeric(10,2)`
  (never floating point)
- `scheduled_at` — nullable `timestamptz`
- `created_at`, `updated_at` — `timestamptz not null default now()`;
  `updated_at` kept current by a trigger (`set_updated_at()`)

**Why `text` + `check` instead of native Postgres `enum` types**: for a
small business app where these lists may need a value added, renamed, or
retired as Guardian's offering evolves, a check constraint is a plain
`alter table ... drop constraint / add constraint`. Altering an `enum`
type — especially removing or renaming a value — is more awkward.

**Approximate profit is intentionally not a column.** `quoted_amount`,
`amount_paid`, and `job_costs` are stored as distinct facts. Profit
(`amount_paid - job_costs`) is computed wherever it's displayed, only
when both values are present — never persisted, so it can't drift out of
sync with its inputs.

**`job_photos`** — photos attached to a job.

- `id uuid primary key default gen_random_uuid()`
- `job_id uuid not null references jobs(id) on delete cascade` — deleting
  a job deletes its photo records (not the underlying storage objects
  themselves)
- `storage_path text not null` — an object key inside the private
  `uploads` bucket, **never** a public URL
- `created_at timestamptz not null default now()`
- Indexed on `job_id` — Postgres does **not** automatically index
  foreign-key columns, and without this both the cascade delete and every
  "photos for this job" lookup would be a sequential scan.

## Database access

`pg` (`node-postgres`) via `src/lib/db.ts`, wrapped with
`attachDatabasePool` from `@vercel/functions` — the driver/pattern the
installed `neon-postgres` skill recommends for a Vercel-hosted Next.js
app on Fluid compute. No ORM: there are two tables and no existing ORM
choice in this codebase, so plain parameterized SQL is simpler to
introduce and reason about than adding Drizzle or similar for this scope.

`src/lib/db.ts` reads the pooled `DATABASE_URL` (correct for request-time
app traffic). Schema migrations use the **direct/unpooled**
`DATABASE_URL_UNPOOLED` instead (see **Applying the migration** below) —
pooled (PgBouncer transaction-mode) connections don't support the
session-level behavior some DDL and multi-statement scripts need.

## Applying the migration

**Not run yet.** `neon.ts` / `neon config apply` only reconcile
Auth/Object Storage/Functions — table schema is plain SQL, applied
directly against Postgres, which has no built-in non-mutating dry-run for
DDL. The safe path recommended by the installed `neon-postgres-branches`
skill is to test on a branch first:

```bash
# 1. Create a short-lived branch off production to test the migration
neon branches create --name schema-test --parent production --expires-at <ISO timestamp, e.g. now + 1 day>

# 2. Apply the migration there first (direct/unpooled connection)
psql "$(neon connection-string schema-test)" -f db/migrations/0001_init.sql

# 3. Inspect the result on that branch (\d jobs, \d job_photos, etc.), then delete it
neon branches delete schema-test

# 4. Once satisfied, apply to production for real (direct/unpooled connection)
psql "$DATABASE_URL_UNPOOLED" -f db/migrations/0001_init.sql
```

`$DATABASE_URL_UNPOOLED` is already present in `.env.local` (pulled by
`neon link`). None of the commands above have been run as part of this
pass.

## Admin authorization — restricting the Job Manager to Cecil

Neon Postgres here is reached only from trusted Next.js server-side code
using a single application-level Postgres role — there is no per-browser
Postgres role and no `auth.uid()` session variable, so the old Supabase
design (RLS policies gated by a `private.is_admin()` SQL function reading
a `private.admin_users` allowlist table) doesn't have an equivalent
mechanism to key off here, and reproducing it would just be RLS-shaped
theater with no browser-facing Postgres role for it to restrict.

**Chosen design:** an explicit admin allowlist held in server-only
environment configuration, checked in application code after verifying
the Better Auth session server-side — never trusted from anything the
client supplies.

- `ADMIN_EMAILS` — a server-only env var (comma-separated, so it isn't
  presented as a single-value special case, but expected to hold exactly
  Cecil's address for the foreseeable future).
- Every Job Manager route/Server Action calls Managed Better Auth's
  `auth.getSession()` (via `@neondatabase/auth/next/server`, see the
  installed `neon-auth` skill) inside trusted server code, then checks
  the **verified** `session.user.email` against `ADMIN_EMAILS`.
- "Authenticated" is necessary but not sufficient: an authenticated
  session whose email isn't on the allowlist is rejected. There is no
  role field, custom JWT claim, or client-editable metadata involved —
  Managed Better Auth's JWTs don't support custom claims anyway, and
  `user_metadata`-style fields are client-editable and must never be
  trusted for authorization even where a provider offers them.
- This is deliberately not a database table: with exactly one admin, an
  env var is simpler to provision and just as auditable as a one-row
  allowlist table, and it avoids taking a dependency on the shape of
  Better Auth's internal `neon_auth` schema. If Guardian ever needs more
  than one admin, revisit — a small `admin_users` table keyed on the
  Better Auth user id is the natural next step, not a role system.

**Not implemented in this pass** (this pass documents the design only):
the `@neondatabase/auth` package is not yet installed, and no route
handler, middleware, or login page wiring has been added — `src/app/login`
remains the existing placeholder. That is deliberately left for the
milestone that builds the Job Manager itself, per this pass's scope.

## Object Storage

Bucket: `uploads`, **private**. Declared in `neon.ts`, already
provisioned (see **Neon project** above).

- The database stores the object **key** (`job_photos.storage_path`),
  never image bytes and never a public URL.
- Customer uploads will happen exclusively through a server-side
  submission route (a later milestone), using server-side credentials —
  the bucket's `AWS_*` credentials (`AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, injected
  by Neon into `.env.local`) are read only in server-only modules and
  must never reach a Client Component or the browser bundle.
- Viewing a photo in the future Job Manager uses a short-lived
  **presigned URL** generated on demand for an authorized admin session —
  never a permanent public URL. A private bucket has no anonymous read
  path; knowing an object's key is not sufficient to read it.
- Per the installed `neon-object-storage` skill, the recommended access
  pattern is the [Files SDK](https://files-sdk.dev) with its `neon`
  adapter (`files-sdk` + the `@aws-sdk/client-s3` /
  `s3-presigned-post` / `s3-request-presigner` peers), which resolves
  endpoint/region/credentials from the injected `AWS_*` env vars and only
  needs the bucket name (`uploads`). The documented alternative is the
  raw `@aws-sdk/client-s3` client with `forcePathStyle: true` (required
  by Neon's path-style addressing).

**Not implemented in this pass**: no upload/presign code and no packages
for either option have been added yet — that lands with the
quote-submission endpoint, which is out of scope here. No real (or
placeholder) customer photos have been uploaded.

## POPIA / data minimisation

`jobs` stores only what's needed to respond to a cleaning enquiry: name,
phone, area, service, description, optional photos, and Guardian's own
internal quoting/scheduling/payment fields. No ID numbers, no date of
birth, no payment card data, no precise GPS, no analytics/profiling
fields. No customer account or login is required or planned — a customer
is just a row Cecil can see, not a user of the system.

This is a data-minimisation design choice, not a compliance
certification.

## Migration history

The previous Supabase foundation (`supabase/migrations/*.sql`,
`src/lib/supabase/*`) was never applied to a live Supabase project and
has been removed. Its reusable decisions — the `jobs`/`job_photos`
column shapes, check-constraint values, money types, the "derive profit,
don't store it" rule, and the nullability split between DB and
form-validation layers — are preserved above and in
`db/migrations/0001_init.sql`. What was **not** carried over is
Supabase-specific: RLS policies, the `private.is_admin()` /
`private.admin_users` mechanism (see **Admin authorization** above for
its Neon-native replacement), and the three Supabase client variants
(`src/lib/supabase/client.ts` / `server.ts` / `admin.ts`).

## What still needs to happen

1. Review and apply `db/migrations/0001_init.sql` (see **Applying the
   migration** above) — not done yet, pending your review.
2. Add `@neondatabase/auth`, implement the Better Auth route handler and
   the `ADMIN_EMAILS` check, and build the actual Job Manager
   login/protected routes.
3. Add the chosen Object Storage client and wire up the quote-submission
   route (validate input → upload photos → insert `jobs` +
   `job_photos` rows).
4. Create Cecil's one admin account once (2) is ready, then set
   `ADMIN_EMAILS` to his address.
