# Try Jesus Media — Panorama of Prophecy Guides

## Deploy

Upload the extracted `guides` folder to the publishing root of the repository so the page resolves at:

`https://tryjesusmedia.com/guides/`

The repository structure should include:

- `guides/index.html`
- `guides/assets/css/styles.css`
- `guides/assets/js/main.js`
- `guides/assets/images/try-jesus-media-logo.png`
- `guides/assets/images/panorama-of-prophecy-guides.jpg`
- `guides/site.webmanifest`

## Omnisend form

The page now contains the exact embedded-form container supplied:

```html
<div id="omnisend-embedded-v2-6a6ec2f44b0e701059793992"></div>
```

The Omnisend tracking/embed script must also be installed on the site or supplied by the site-wide header for the form to render. If the container appears blank, install the full Omnisend website tracking snippet provided in your Omnisend account.

## Branding

The supplied Try Jesus Media logo is used in the header, final call-to-action, and footer. Matching favicon files are generated from the same logo.

## Omnisend embedded form

The printed-guides page is configured with:

- Brand ID: `6995f37d2de8216a26d88410`
- Embedded form ID: `69965e87faf307608c8f562a`

The IDs are stored in `guides/assets/js/config.js`. The page loads Omnisend's launcher from `https://omnisnippet1.com/inshop/launcher-v2.js` through `guides/assets/js/main.js`.

The embedded form must be published in Omnisend and enabled for the live domain.
