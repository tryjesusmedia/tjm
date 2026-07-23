# Try Jesus Media — Cloudflare Pages & GitHub Ready

This is a static website designed for GitHub deployment through Cloudflare Pages.

## Repository structure

Upload the **contents of this folder** to the root of your GitHub repository so that `index.html` is visible at the top level.

## Cloudflare Pages settings

- Production branch: `main`
- Framework preset: `None`
- Build command: leave blank or use `exit 0`
- Build output directory: `.`
- Root directory: leave blank

## Omnisend form

The site is configured in `assets/config.js` with the Omnisend brand and embedded form IDs supplied during setup.

If you create a new Omnisend embedded form, update:

```js
omnisendFormId: "YOUR_NEW_FORM_ID"
```

The form must be enabled in Omnisend and the live domain must be verified in Omnisend. Content blockers can prevent forms from loading during testing.

## Important before launch

1. Confirm the Omnisend form text, phone consent, and success behavior match your campaign.
2. In Omnisend, set the form success action to redirect to `/thank-you.html` if desired.
3. If your final domain is not `tryjesusmedia.com`, update `robots.txt`, `sitemap.xml`, and any sharing metadata.
4. Test on desktop and mobile in an incognito window.

## Brand system

- Deep purple: `#311E33`
- Gold: `#EEBD4A`
- Cream: `#F8F5EF`
- Headings: Cormorant Garamond / Georgia
- Body: Montserrat / Inter
