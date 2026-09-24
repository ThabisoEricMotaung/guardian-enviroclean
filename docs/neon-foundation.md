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

## Quote Request Pipeline — Pass 1

Live: `FORM → SERVER VALIDATION → NEON POSTGRES → REAL SUCCESS STATE`.

- `POST /api/quote-requests` (`src/app/api/quote-requests/route.ts`) —
  the only write path for a public quote request. Validates with
  `src/lib/validation/quote-request.ts`, then calls
  `insertWebsiteEnquiry` (`src/lib/quote-requests.ts`), which inserts
  exactly one `jobs` row via the pooled `pg` connection in
  `src/lib/db.ts` — parameterized query, `status = 'NEW_ENQUIRY'`,
  `source = 'WEBSITE'`. No `job_photos` row is created.
- `src/components/request-quote-form.tsx` submits real `fetch()` JSON to
  that route and only shows `QuoteRequestSuccess` after a genuine `201`
  response — never optimistically, never on a timer.
- **Photos are not sent or persisted in Pass 1.** The photo picker stays
  visible (still local-preview-only, as it always was) with an inline
  notice that attachments aren't transmitted yet, so customers aren't
  misled into thinking a photo they picked was actually received.

**Public abuse protection is deliberately incomplete after Pass 1** —
this endpoint is intentionally public (customers have no account), and
right now it has only: strict server-side validation, a best-effort
request-size cap, parameterized queries, and generic (non-leaking) error
responses. There is **no honeypot, no CAPTCHA/Turnstile, and no rate
limiting yet** — Pass 3 adds honeypot + Turnstile. Do not treat this
endpoint as production-hardened, and do not launch it to real public
traffic, before that lands.

## Quote Request Pipeline — Pass 2

Extends Pass 1 with optional photo attachments:
`FORM (+ photos) → SERVER VALIDATION → JOBS INSERT → PHOTO VALIDATION →
PRIVATE UPLOAD → JOB_PHOTOS INSERT → RESPONSE (full or partial success)`.

- **Request format switched from JSON to `multipart/form-data`.** The
  form (`src/components/request-quote-form.tsx`) posts a `FormData` body
  (text fields + zero-or-more `photos` file entries); the route reads it
  with `request.formData()`. No base64 encoding.
- **Object storage approach**: the raw `@aws-sdk/client-s3` client
  (`src/lib/storage.ts`), not the Files SDK. The installed
  `neon-object-storage` skill recommends the Files SDK "first" as the
  general default, but that pulls in 4 packages
  (`files-sdk` + 3 `@aws-sdk/*` presign peers) for a unified API whose
  presign/download features this pass doesn't use — no presigned URLs
  are implemented here at all. The raw client needs only
  `@aws-sdk/client-s3`'s `PutObjectCommand`/`DeleteObjectCommand`, which
  is exactly this pass's requirement, and is documented as a fully
  supported alternative, not a workaround. `new S3Client({ forcePathStyle: true })`
  reads credentials/endpoint/region from the injected `AWS_*` env vars
  automatically, per the skill.
- **Photo validation** (`src/lib/validation/photo.ts`): max 4 files;
  max 3 MB per file; max 4 MB combined; rejects zero-byte files;
  identifies the real format via magic-byte sniffing (JPEG/PNG/WebP
  only) rather than trusting the client's declared MIME type or
  filename extension. **HEIC/HEIF is explicitly not supported this
  pass** — recognizing it needs ISO-BMFF `ftyp`-box parsing and,
  practically, a server-side decode step for browser preview, which is
  materially more infrastructure than this pass's scope; a customer
  whose phone shares an unconverted HEIC file falls back to WhatsApp.
- **Object key structure**: `quote-requests/<job-id>/<random-uuid>.<ext>`
  — `<ext>` comes from the sniffed format, never the customer's
  filename, and the key never contains name/phone/area or any other PII.
- **Vercel's request-body ceiling drove the size limits.** Vercel
  Functions enforce a hard **4.5 MB** total request-body limit
  (`413 FUNCTION_PAYLOAD_TOO_LARGE`), platform-side, regardless of
  runtime: https://vercel.com/docs/functions/limitations#request-body-size.
  The 3 MB/4 MB photo caps above (plus the route's own 4.4 MB
  content-length pre-check) are sized to fit under that ceiling with
  headroom for text fields and multipart framing — not arbitrary
  choices. A real consequence: a single already-large phone photo can
  consume most of that budget, leaving little room for a second one in
  the same request. Lifting this later means direct-to-bucket presigned
  client uploads (explicitly out of scope this pass).
- **Critical failure semantics** — the enquiry is persisted *before*
  any photo is touched, and nothing afterward can make it disappear:
  - Text validation fails → nothing persisted, nothing uploaded (`422`).
  - `jobs` insert fails → nothing uploaded, generic `500`, no success.
  - `jobs` insert succeeds → response is always `ok: true` /
    `201` from here on, even if every photo fails.
  - Each accepted photo is uploaded, then a `job_photos` row is
    inserted. If the upload fails, that photo is simply not attached
    (nothing to clean up — it was never written). If the upload
    *succeeds* but the `job_photos` insert fails, `src/lib/storage.ts`'s
    `deleteJobPhoto` is called as best-effort cleanup; if that delete
    also fails, the result is a rare orphaned object with no DB
    row — logged server-side, not retried, and not currently reconciled
    by any background job (accepted limitation for this pass's scope).
- **Response contract**: `{ ok: true }` when no photos were submitted
  (unchanged from Pass 1); `{ ok: true, photos: { requested, accepted } }`
  otherwise. The client treats `requested > accepted` as a partial
  result and shows `QuoteRequestSuccess`'s `photoIssue` notice (still the
  same "received" success state — the copy never suggests the enquiry
  itself was affected) with the WhatsApp fallback.
- **Client UX**: the Pass 1 "photos aren't sent yet" notice is gone,
  replaced with the actual format/size limits. The form still won't
  clear until the server confirms the `jobs` row was persisted.

## What still needs to happen

1. Review and apply `db/migrations/0001_init.sql` (see **Applying the
   migration** above) — done; see git/deployment history for when.
2. Add `@neondatabase/auth`, implement the Better Auth route handler and
   the `ADMIN_EMAILS` check, and build the actual Job Manager
   login/protected routes.
3. Add a presigned-URL read path (Files SDK or
   `@aws-sdk/s3-request-presigner`) for the future Job Manager photo
   viewer — Pass 2 only writes objects, it never reads/presigns them.
4. Add honeypot + Turnstile to `/api/quote-requests` (Pass 3) before any
   real public launch.
5. Create Cecil's one admin account once (2) is ready, then set
   `ADMIN_EMAILS` to his address.
6. Decide whether HEIC/HEIF support and/or lifting the photo size caps
   (via presigned direct-to-bucket uploads) are worth the added
   complexity, once real customer usage shows whether they're needed.
