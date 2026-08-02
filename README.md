# Try Jesus Media — `/guides` Landing Page

This package is ready to deploy at:

`https://tryjesusmedia.com/guides/`

## Correct repository structure

Upload the extracted `guides` folder to the publishing root of your website:

```text
guides/
├── index.html
└── assets/
    ├── css/styles.css
    ├── js/main.js
    └── images/
```

If GitHub Pages publishes from `/docs`, place the folder at `docs/guides/` instead.

## Connect the Omnisend form

Open `guides/index.html` and search for:

```html
id="omnisend-form-location"
```

Replace the contents inside that container with the Omnisend embed code you supply later. Keep the outer element and its ID unless your Omnisend instructions require otherwise.

The included HTML form is a visual preview only. Its JavaScript intentionally prevents live submissions until Omnisend is connected.

## Page assets

The attached Panorama of Prophecy guide image is included at:

`guides/assets/images/panorama-of-prophecy-guides.jpg`

## Fonts

The page loads Cormorant Garamond and Montserrat from Google Fonts, with Georgia, Inter, and system fallbacks.
