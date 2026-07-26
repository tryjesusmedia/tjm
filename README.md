# Try Jesus Media — Premium Cloudflare Pages Website

This ZIP is ready to upload directly to the root of a GitHub repository connected to Cloudflare Pages.

## Cloudflare Pages settings

- Framework preset: **None**
- Build command: leave blank
- Build output directory: `/` or leave blank when Cloudflare accepts the repository root
- Production branch: your main branch, usually `main`

The ZIP already places `index.html` at the root. Do not upload the enclosing folder itself into another folder in GitHub.

## Omnisend integration

The site is preconfigured with:

- Brand ID: `6995f37d2de8216a26d88410`
- Embedded form ID: `69965e87faf307608c8f562a`

Both values are stored in `assets/config.js`. They must belong to the same Omnisend account, and the embedded form must be published.

In Omnisend, set the form's post-submission redirect to:

`https://tryjesusmedia.com/thank-you.html`

## Logo proportions

The full logo asset is a true 1:1 square. The hero uses a square container with `aspect-ratio: 1 / 1` and `object-fit: contain`, so the logo cannot be stretched or squished on desktop or mobile.

## Files

- `index.html` — main landing page
- `privacy.html` — privacy policy
- `thank-you.html` — suggested Omnisend redirect page
- `404.html` — custom not-found page
- `assets/styles.css` — full design system and responsive styling
- `assets/site.js` — menu, animation, progress bar, FAQ, sticky CTA, and Omnisend loader
- `assets/config.js` — Omnisend IDs
- `_headers` — Cloudflare security and caching headers
- `_redirects` — convenient URL aliases
- `robots.txt`, `sitemap.xml`, and `site.webmanifest` — SEO and install metadata

## Before launch

1. Upload all files and folders to the GitHub repository root.
2. Confirm Cloudflare finishes the deployment successfully.
3. Open the site in an incognito window.
4. Submit a test registration.
5. Confirm the email, text consent language, automation, and thank-you redirect inside Omnisend.
6. Replace any privacy wording that needs to match your organization’s legal requirements.
