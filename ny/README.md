# Try Jesus New York landing page (/ny/)

This folder belongs in the ROOT of https://github.com/tryjesusmedia/tjm.

The live page will resolve to https://tryjesusmedia.com/ny/ when your existing hosting deployment publishes the repository.

## Included
- `index.html`: the approved Try Jesus New York copy, responsive layout, same header/footer structure and site navigation as the homepage.
- `styles.css`: TJM1 premium-simple page styling. The main site's CSS, logo and scripts are intentionally referenced as absolute `/assets/...` paths.
- `images/`: reserved for future promotional images.

## Before using for signups — ADD OMNISEND

The page has a **visual form placeholder** only. No email or mobile number is collected, stored or submitted.

Open `ny/index.html`, find:

```html
<div id="ny-omnisend-mount" class="ny-omnisend-mount" data-omnisend-placeholder="true">
```

Replace the **inner contents** of that element (the `ny-form-preview` div) with the Omnisend embedded form markup. You may remove the `data-omnisend-placeholder` attribute. Paste any required Omnisend loading script exactly as supplied by Omnisend (prefer just before `</body>`, unless their instructions say otherwise).

**Do not remove or rename `id="guide-form"`** on the enclosing `aside`; all CTA buttons and the header signup button scroll there. If the embedded form has its own CTA, let Omnisend manage submission, consent, validation and redirects. Ensure the Omnisend form actually collects BOTH email and phone number, with any necessary SMS consent language and privacy disclosures.

## Add images later

Find these elements in `ny/index.html`:

- `id="ny-youtube-image-main"` — YouTube channel visual (recommended 16:9, ~1200×675)
- `id="ny-youtube-image-secondary"` — second YouTube image (optional, 16:9)
- `id="ny-merch-image-main"` — product collection photo (recommended 16:9, ~1200×675)
- `id="ny-merch-image-secondary"` — second merch photo (optional)

Replace the placeholder content with, for example:

```html
<img src="/ny/images/youtube-feature.jpg" alt="A selection of Try Jesus New York Bible videos" loading="lazy" width="1200" height="675">
```

Upload the matching image file under `ny/images/`. If you change placeholder text to an `img`, remove the old `role="img"` and `aria-label` from the containing `<div>` so the image's own `alt` text is used. The supplied CSS automatically sizes images inside the placeholders.

## Upload to GitHub

1. Unzip the ZIP package.
2. Put the ENTIRE `ny/` directory in the root of `tryjesusmedia/tjm` — alongside the existing root `index.html` and `assets/` directory.
3. Commit the added files. Do not replace the root homepage.
4. After deployment, visit `/ny/` and verify mobile layout, menu, CTA scroll, image loading and Omnisend signup.

The homepage logo, menu, footer and social links reuse existing site assets and destinations. Main navigation links intentionally point to the *homepage* (`/#chronological-bible`, `/#bible-decoded`, `/#membership-perks`). The `Sign up for free` menu item points to this new page's form instead.

## Launch note

Do not send paid traffic to `/ny/` until the Omnisend form has been added and tested. This ZIP intentionally contains no fake submission endpoint or live lead capture form.
