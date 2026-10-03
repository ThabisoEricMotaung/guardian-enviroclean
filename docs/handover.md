# Guardian Enviroclean — Handover

What Cecil receives, the operational setup he needs to complete himself,
known limitations, and sensible future enhancements. Technical
infrastructure (database, storage, auth, the quote pipeline internals)
lives in `docs/neon-foundation.md`, not here.

This document is being built up ahead of handover. Sections marked
_TBD_ are filled in as the work lands.

## What Cecil receives

_TBD._

## Pre-handover work list

Work that must land before handover, in order. Infrastructure follow-ups
already tracked in `docs/neon-foundation.md` ("What still needs to
happen") are not repeated here.

### 1. Facebook acquisition support — approved, not started

**Blocked until** the Pass 3 Resend notification test has succeeded in
production **and** its test `jobs` row and storage object have been
safely cleaned up. Once Pass 3 is closed: re-inspect the tree and agree
an implementation sequence before any production schema change.

**Scope — only these four things:**

1. Attribution for website visitors who came from Facebook.
2. Ready-made tagged URLs for Cecil's Page action button, posts and bio.
3. A Facebook-specific WhatsApp link with its own prefilled message.
4. A short Cecil setup checklist (in "Cecil's operational setup" below):
   Page action button, WhatsApp connection to the Page, and checking
   whether Appointments is available for his Page.

**Attribution model (approved):** _how_ the enquiry arrived is kept
separate from _where the customer found Guardian_.

| Column | Meaning | Allowed values |
| --- | --- | --- |
| `source` (unchanged) | Entry method | `WEBSITE` / `WHATSAPP` / `REFERRAL` / `OTHER` |
| `acquisition_channel` (new, nullable) | Acquisition channel | `FACEBOOK` / `OTHER` |
| `acquisition_detail` (new, nullable) | Known placement | `page_button` / `post` / `bio` |

- A Facebook visitor who submits `/request-quote` is `source = WEBSITE`,
  `acquisition_channel = FACEBOOK`, `acquisition_detail = <placement>`.
- Unknown attribution is `NULL`. `DIRECT` is not stored: a direct visit
  can't be told apart from untagged, shared or search traffic. `GOOGLE`,
  `INSTAGRAM` etc. are added only when Guardian actually uses them.
- The placement list is a closed allowlist, not an analytics taxonomy.
- **What the public website may write (decided):**
  - `acquisition_channel`: recognised Facebook attribution → `FACEBOOK`.
    Absent, malformed, unsupported or unrecognised attribution → `NULL`.
    The website never writes `OTHER`; it is reserved for deliberate
    manual classification by Cecil / the future Job Manager.
  - `acquisition_detail`: only `page_button`, `post` or `bio`, and only
    alongside `FACEBOOK`. Anything else → `NULL`.
  - Unknown traffic is never inferred, and arbitrary UTM values are
    never turned into stored business data.
- `source_note` is not used — it stays Cecil's free-text note for manual
  enquiries.
- Migration `0002` adds only the two nullable columns and their `check`
  constraints. Existing production rows are untouched.

**Capture (approved):**

- Tagged URLs point at `/request-quote` with `utm_source=facebook` and
  `utm_content=<placement>`. A landing with `fbclid` but no tag counts as
  `FACEBOOK` with no placement.
- On landing on any page, the client normalises this to just the
  channel and placement and keeps them in `sessionStorage` (current tab
  only), so a visitor can browse the homepage and reach Request a Quote
  later without losing attribution.
- Never stored anywhere: the raw `fbclid`, raw UTM strings, or anything
  outside the allowlists.
- The server re-validates both values against the allowlists and drops
  anything unrecognised; client-supplied attribution is never trusted
  as-is.
- Not used: cookies, `localStorage`, third-party analytics,
  fingerprinting, cross-session tracking, Meta Pixel, consent
  infrastructure.

**WhatsApp (approved):** a `wa.me` link with a Facebook-specific
prefilled message so Cecil can recognise those chats. No automated
WhatsApp attribution or integration in this pass.

**Docs to write on completion (this file):** the tagged Facebook URLs
and where each belongs, the Facebook WhatsApp link, Cecil's Page setup
checklist, and what is deliberately unsupported or deferred.

## Cecil's operational setup

_TBD — the Facebook checklist lands here with work item 1._

## Known limitations

_TBD._

## Out of scope

- Facebook Marketplace (listing or automation) — not being pursued.

## Future enhancements

Only worth revisiting if Cecil starts running paid Facebook ads:

- Meta Pixel and Conversions API
- Facebook Lead Ads
- Meta API integration
- Cookie consent infrastructure (would be required by the Pixel)
- Paid advertising functionality
