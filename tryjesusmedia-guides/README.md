# Try Jesus Media — Guides Landing Page

A self-contained static landing page for:

`https://tryjesusmedia.com/guides`

## Files

- `index.html` — page markup and SEO metadata
- `assets/css/styles.css` — responsive branding and page design
- `assets/js/main.js` — sticky header, reveal animations, and FAQ accordion

## Add the Omnisend form

Open `index.html` and find:

```html
<div class="omnisend-embed-shell" id="omnisend-form-location">
```

Replace the inner `.omnisend-placeholder` block with the Omnisend embed snippet. Keep the outer `.omnisend-embed-shell` wrapper so the form remains aligned with the page design.

## Deployment

### If the repository serves the domain root

Place this folder at:

```text
/guides/index.html
/guides/assets/css/styles.css
/guides/assets/js/main.js
```

### If the repository uses a framework

Copy the page into the framework’s public/static route for `/guides`, or adapt the HTML into the appropriate route component.

## Notes

- Google Fonts are loaded from Google’s CDN: Cormorant Garamond, Montserrat, and Inter.
- The page contains no external image assets.
- Update the footer privacy/contact URLs if your site uses different routes.
- The form is intentionally non-functional until the Omnisend embed code is inserted.
