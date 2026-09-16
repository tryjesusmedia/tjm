# Bible Decoded

Bible Decoded lives at `/bibledecoded/` on the existing Try Jesus Media site.
The member routes are `welcome/`, `dashboard/`, `lesson/?lesson=foundations`,
`study-lab/`, and `complete/`.

## Current rollout

- Six YouTube lessons are configured in the Pages `BD_VIDEOS` environment variable.
- Seven interactive workbooks and protected printable workbooks are included.
- Supabase provides the existing site's Google and email-link sign-in.
- Cloudflare D1 stores entitlements, private workbook answers, progress and studies.
- The owner email `info@tryjesusmedia.com` has a manual entitlement. It is claimed
  after this exact email is confirmed by the authentication provider.
- The sales page links directly to the owner's Stripe Payment Link. The site's
  session-creation endpoint remains disabled. Live payment fulfillment still
  requires matching live keys, price, webhook metadata and environment settings.
- A Fourthwall merchandise carousel follows the enrollment section.
- Members can download all seven printable guides directly from their dashboard.
- The optional Google Photos album URL is stored privately in `bd_content` under
  `video-album`, with `blocks` containing a JSON object with a `url` field. It is
  returned only to entitled members; do not commit the shared album URL.
- The bonus Word Search workbook is available; its video still needs a link.

## Build and checks

Use Node 24 or later for the test suite's SQLite support.

```sh
npm ci
npm run build:bibledecoded
npm run test:bibledecoded
npx wrangler pages functions build --outdir .wrangler/build-check --compatibility-date 2026-09-16 --compatibility-flags nodejs_compat
```

Cloudflare's existing `tjm` Pages project builds with `npm run build:bibledecoded`
and serves the repository root. Its production branch remains `main`.
Both environments bind `BD_DB` to `tjm-bibledecoded`. The initial schema is in
`migrations/0001_bibledecoded.sql`; private course content uses
`migrations/0002_private_course_content.sql`. Both have been applied.

Lesson exercises and PDFs live in D1's `bd_content` table. Only the public lesson
catalogue is in Git. Never commit the private import files or copy workbooks to
public assets. The static pages contain a sign-in shell. Every private API request
verifies the Supabase token and confirmed email, then checks the entitlement.
Study and answer queries are always scoped to the authenticated user.

## Add a video

Merge an entry into `BD_VIDEOS` on the Pages project, preserving all existing
entries, and deploy again. Lesson IDs are `foundations`, `look-for-christ`,
`pattern-recognition`, `questioning-method`, `exegesis`, `bible-memorization`,
and `word-search`. A YouTube entry has the shape
`{"provider":"youtube","id":"the 11-character video ID"}`.

The website must retain `strict-origin-when-cross-origin` as its referrer policy
for YouTube embeds. YouTube links can be shared outside the course; access checks
protect the program and saved work, not the underlying YouTube URL.
For stronger video protection, the API also supports signed Cloudflare Stream
playback using the variables listed in `.dev.vars.example`.

## Activate Stripe later

Configure `BD_STRIPE_KEY`, `BD_STRIPE_PRICE_ID`, and
`BD_STRIPE_WEBHOOK_SECRET` as secrets in the same Cloudflare account.
Use a one-time USD 37.00 price and a webhook at
`https://tryjesusmedia.com/api/bibledecoded/webhook`.
The handler accepts checkout completion, asynchronous payment success,
full refunds and created disputes. Failed or unsigned webhooks never grant access.
The intended events are `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `charge.refunded`, and
`charge.dispute.created`.

Test payment completion, different checkout/sign-in emails, duplicate events,
delayed success and revocation before enabling the live price.
`BD_STRIPE_LIVE_MODE` must match the Stripe environment.
`BD_CHECKOUT_ENABLED` only controls the server's session-creation endpoint.
The public buttons now link directly to the supplied Stripe Payment Link.
For Payment Link purchases, add `program=bibledecoded` metadata to the Payment
Link itself and ensure it uses the configured price. Its redirect should point
to `/bibledecoded/welcome/`; the webhook grants access using the checkout email.
Do not treat publishing a Payment Link as verification of live fulfillment.

## Omnisend purchase messages

Set `OMNISEND_API_KEY` as a Cloudflare Pages secret. Use an Omnisend API key
restricted to `events.write`. A verified paid Stripe webhook then sends the
custom event `bible decoded purchased` with the buyer email, program, amount,
currency, and member links. Configure an Omnisend automation triggered by that
event and mark the welcome email as transactional so purchase access does not
depend on marketing subscription status.

SMS is intentionally withheld unless Stripe returns both an E.164 phone number
and an explicit custom-field opt-in. In the Bible Decoded Payment Link, enable
phone-number collection and add a required dropdown with key `sms_consent`, a
clear disclosure such as `May Try Jesus Media text me about my Bible Decoded
purchase?`, and the consenting value `yes`. Keep Stripe's consent record. In
Omnisend, add the SMS to the same custom-event automation and include required
sender identification and opt-out language. A checkout phone number by itself
must never be treated as SMS consent.

The Omnisend event uses a deterministic purchase ID and is sent only after the
existing Stripe signature, environment, product, price, currency, amount, and
payment checks pass. Omnisend failures never remove the entitlement already
created for a valid purchase; returning a webhook error allows Stripe to retry.

## Member support

The Study Lab unlocks after the six main lessons are marked complete and stays
unlocked for an entitled account. A member may revisit lessons freely.
Answers save with revision checks. Conflicting device edits require the member
to choose a version; failed saves retain a draft on that device.

For a verified manual access request, add an entitlement using a unique
`session_id`, normalized email and `status='active'` in `bd_purchases`.
Never grant access through browser storage or expose an administrative endpoint.
Set a grant's status to `revoked` to remove it. Honor account deletion requests
across both Supabase and the owner-scoped D1 tables; the public help link points
to the site's existing account-deletion process.
