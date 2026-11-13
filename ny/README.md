# Try Jesus New York — /ny/ Landing Page

## Upload to GitHub

Unzip this package and upload the entire `ny` folder to the repository root of `tryjesusmedia/tjm`, replacing the previous `ny` files. The new page will remain at `https://tryjesusmedia.com/ny/`.

## What changed in this version

- The Omnisend form `omnisend-embedded-v2-6af65231709b4cb49a4eba96` is the **only content** inside its unstyled signup slot. All additional invitation headings, descriptions, reassurance text, and card/panel styles were removed from around it.
- Added the same `/assets/omnisend-boundary.css` used by the main Try Jesus Media homepage and narrowed local CSS selectors to exclude Omnisend's internal text, fields, labels, and buttons.
- Removed decorative emojis from the landing-page headlines and offer descriptions.
- The three newest long-form episode thumbnails (37, 36, 35 as of November 12, 2026) are displayed in **three columns on desktop/laptop** and **one column on mobile**. They use 16:9 max-resolution YouTube thumbnails with `object-fit:contain`, avoiding cropping.
- Preserved the four overlapping, tilted merch photos in `ny/images/`.
- All promotional CTA buttons, including the main menu signup link and the YouTube / merchandise footer links, go to `#guide-form` rather than YouTube or a merchandise store.

## Omnisend checklist

1. Confirm the form is published in Omnisend and permitted to appear on `tryjesusmedia.com/ny/`.
2. Confirm both email and cell phone fields display as configured in Omnisend.
3. Test a real signup with consent; verify the correct audience, welcome flow, and signup redirect.
4. Test mobile and desktop display. The embedded form's style and field/consent behavior are controlled in Omnisend, not by page CSS.

## Shared website assets

This folder intentionally references the parent website's existing `/assets/` CSS, JS, logo and site footer. It does not modify files elsewhere in the repository.

## Media note

The YouTube thumbnail images are displayed remotely from `i.ytimg.com`; their availability and exact rendering depend on YouTube. There are no outbound video links on the page. If YouTube removes or changes a thumbnail, update the image `src` in `ny/index.html`.
