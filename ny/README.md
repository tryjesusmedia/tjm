# Try Jesus New York landing page (/ny/)

This folder belongs in the ROOT of https://github.com/tryjesusmedia/tjm.

The live page will resolve to https://tryjesusmedia.com/ny/ when your existing hosting deployment publishes the repository.

## Included
- `index.html`: the approved Try Jesus New York copy, responsive layout, same header/footer structure and site navigation as the homepage.
- `styles.css`: TJM1 premium-simple page styling. The main site's CSS, logo and scripts are intentionally referenced as absolute `/assets/...` paths.
- `images/`: reserved for future promotional images.

## Omnisend form installed

The first-section signup form is now integrated using the exact embed container supplied:

```html
<div id="omnisend-embedded-v2-6af65231709b4cb49a4eba96"></div>
```

The page includes the same Omnisend brand loader as the Try Jesus Media homepage (`brandID` 6995f37d2de8216a26d88410). The embedded form's field selection, SMS consent, submission action, and post-signup redirect must be configured and verified in Omnisend. The actual form requires an internet connection and publication of this embed ID in your Omnisend account. Previewing the HTML file directly from your computer may not load the embed.

**Do not remove `id="guide-form"`** on the surrounding panel: all CTA buttons scroll there. The page does not create a separate email or phone collection system.

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


## Updated media (November 12, 2026)

The YouTube section now shows the channel's three most recent **long-form** episode thumbnails, verified on November 12, 2026 (episodes 37, 36, and 35). YouTube thumbnails are loaded from `i.ytimg.com` when the page is online, and the preview cards deliberately contain **no outbound YouTube links**. Update the episode IDs in `index.html` later if you wish to feature newer videos.

The merch section contains four supplied photos as locally bundled optimized `.webp` files in `ny/images/`, shown as an overlapping, tilted collage. The photos and YouTube preview cards are not links.

**CTA policy:** All signup buttons continue to point to `#guide-form`. The YouTube and Programs & Merch footer links also point to the signup form (rather than going directly to YouTube/Fourthwall), while their footer design and wording remain unchanged. The rest of the site navigation retains its destinations.

Upload the entire updated `ny/` folder including `images/`, and overwrite existing `ny/index.html`, `ny/styles.css`, and `ny/README.md`.
