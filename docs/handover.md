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

### 1. Facebook acquisition support — implemented locally, not deployed

Code, tests and `db/migrations/0002_acquisition.sql` are in place.
**Release order matters:** apply `0002` to production (branch-test first,
as for `0001` in `docs/neon-foundation.md`) **before** deploying this
code. The website insert writes the two new columns, so deploying first
would make every website enquiry fail. Cecil's setup is in "Facebook
setup" below.

**Pass 3 status:** the production notification test succeeded and the
email was received. Cleanup of that test's `jobs` row, `job_photos` rows
and storage objects is **verified complete**: a read-only production
check found none remaining (0 `jobs`, 0 `job_photos`, 0 objects under
`quote-requests/`).

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
  `utm_content=<placement>`. Only `utm_source=facebook` establishes
  `FACEBOOK`. `fbclid` on its own never does, because Instagram and
  Messenger add it too (decided after the original approval).
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

### Facebook setup

**Guardian Enviroclean and Clearview Deepcleaning.** Cecil's existing
Facebook presence is called **Clearview Deepcleaning**. It is part of the
Guardian Enviroclean business and keeps its name and its followers.
Guardian Enviroclean stays the website brand. The website footer links to
the Facebook page as "Facebook · Clearview Deepcleaning".

**Cecil's Facebook link** (used by the website footer):
<https://www.facebook.com/share/1AmHkQWHBZ/?mibextid=wwXIfr>

**Links Cecil puts on Facebook.** These use the live Guardian website
address, <https://guardianenviroclean.co.za>.

| Where on Facebook | Link to use |
| --- | --- |
| Page action button ("Get quote" / "Learn more" / "Book now") | `https://guardianenviroclean.co.za/request-quote?utm_source=facebook&utm_medium=social&utm_content=page_button` |
| Posts (before/after photos, offers, "get a quote" posts) | `https://guardianenviroclean.co.za/request-quote?utm_source=facebook&utm_medium=social&utm_content=post` |
| Intro / bio / About "Website" field | `https://guardianenviroclean.co.za/request-quote?utm_source=facebook&utm_medium=social&utm_content=bio` |
| Anywhere a "WhatsApp us" link fits (posts, About, pinned post) | https://wa.me/27659656991?text=Hi%20Guardian%20Enviroclean%2C%20I%20found%20you%20on%20Facebook%20and%20would%20like%20to%20request%20a%20cleaning%20quote. |

The WhatsApp link opens a chat with Guardian's usual WhatsApp number
(+27 65 965 6991). The message is filled in for the customer:

> Hi Guardian Enviroclean, I found you on Facebook and would like to
> request a cleaning quote.

Use each quote link only in its own place. The `utm_content` value tells
Guardian which placement the customer clicked.

**Page/profile setup checklist**

- [ ] Set the Page action button to the **page_button** link above.
- [ ] Put the **bio** link in the Intro/About website field.
- [ ] Use the **post** link in posts that invite people to get a quote.
- [ ] Connect the Guardian WhatsApp number (+27 65 965 6991) to the Page
      (in the Page settings, under linked accounts; Meta moves this
      menu from time to time), or use the WhatsApp link
      above wherever a link is allowed.
- [ ] Check whether **Appointments** is available for the Page. It is
      optional and not connected to the Guardian system.
- [ ] Open each link once from a phone to make sure it works.

**What the Guardian system records.** For a quote request submitted on
the website:

- `acquisition_channel = FACEBOOK` only when the visitor arrived through
  one of the tagged links above (`utm_source=facebook`). An ordinary
  Facebook link without the tag is recorded as unknown.
- `acquisition_detail = page_button / post / bio` only when the tagged
  link names one of those placements. Otherwise it is empty.
- Cecil's new-enquiry email shows a line such as
  `Acquisition: Facebook · Post` under `Source: Website`. If the
  enquiry is not attributed, the line is left out.
- This survives browsing in the same browser tab. A visitor who lands
  on the homepage from Facebook and opens Request a Quote later is still
  attributed to Facebook.
- `source` stays `WEBSITE`. Facebook is where the customer found
  Guardian, not how the enquiry came in.

**What it does not record**

- WhatsApp chats started from Facebook. They do not pass through the
  website, so nothing is recorded automatically. Cecil can recognise
  them by the prefilled message and classify them by hand later in the
  Job Manager.
- Facebook Messenger enquiries, comments and calls.
- Visitors who come from an untagged Facebook link, e.g. a customer
  sharing the website in a comment or on their own profile.
- Visitors who change tabs, open the site in another browser, or come
  back on another day without a tagged link.
- Raw UTM values, the `fbclid` value, or any tracking or analytics
  data. There are no cookies, no Meta Pixel and no third-party
  analytics.
- Any other channel (Google, Instagram etc.) or "direct" traffic. These
  are stored as unknown (empty).

## Known limitations

_TBD._

## Out of scope

- Facebook Marketplace (listing or automation) — not being pursued.
- Automatic attribution of WhatsApp, Messenger or other off-website
  enquiries.
- Social-media analytics dashboards.

## Future enhancements

Only worth revisiting if Cecil starts running paid Facebook ads:

- Meta Pixel and Conversions API
- Facebook Lead Ads
- Meta API integration
- Cookie consent infrastructure (would be required by the Pixel)
- Paid advertising functionality
