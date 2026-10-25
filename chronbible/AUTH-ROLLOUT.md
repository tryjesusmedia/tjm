# Apple and email sign-in rollout

Draft implementation; do not deploy until Apple and Supabase configuration is complete.

Use existing project `erejehmrtzjpqurbftsm`, account ownership and plan ID. No database schema or reading-plan changes are needed.

Enable Apple on primary App ID `com.tryjesusmedia.journey`, create its associated website Services ID, register domain `tryjesusmedia.com` and callback `https://erejehmrtzjpqurbftsm.supabase.co/auth/v1/callback`, then configure Apple's provider in Supabase. Keep all keys and client secrets in provider settings. Native and Services IDs must both be accepted. Rotate Apple's OAuth secret before expiration.

Keep Google and email enabled, preserve email confirmation, verify production SMTP, and enable manual identity linking. Preserve existing allowlisted redirects and add `https://tryjesusmedia.com/chronbible/?next=recovery` and the Journey app's callback/recovery URLs. PKCE email links must be opened in the requesting browser/device.

Existing users should sign in using their original method, then use Manage sign-in methods to connect Apple/Google or set an email password. This keeps progress under the same user ID when Apple hides the user's email. Conflicting pre-existing accounts are not silently merged.

Tests: `npm run test:chronbible-auth`, `node scripts/test-reading-account-isolation.mjs`, `node scripts/test-chronological-plan.mjs`, and syntax checks for app.js and auth-ui.js. DOM tests mock the auth service; production OAuth, email delivery, mobile layouts, and real-account linking still need verification before merging to the Cloudflare Pages production branch.
