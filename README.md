# Try Jesus Media Welcome Page

Upload the included `welcome` folder to the root of the GitHub repository.

Expected structure:

```text
welcome/
├── index.html
└── assets/
    ├── style.css
    ├── script.js
    ├── logo.webp
    ├── favicon.png
    ├── apple-touch-icon.png
    ├── bible-decoded.jpg
    └── programs-apparel.webp
```

Production URL:

```text
https://tryjesusmedia.com/welcome/
```

This package does not replace the root homepage or either lesson directory.

## Updating featured YouTube videos

In `welcome/index.html`, search for `data-youtube-url` and replace only the URL. The page automatically updates the clickable link and lightweight 320×180 thumbnail.


## Updated guide library

Each Bible journey now expands into a complete, collapsible topic list. The program artwork uses natural image dimensions and smaller responsive presentation to prevent stretching.


## August 2026 countdown update
- Header CTA now reads “Explore More” and scrolls to `/welcome/#programs`.
- The live-discussion card displays “Every Thursday · 8:00 PM Eastern Time” prominently.
- A timezone-aware countdown automatically targets the next Thursday at 8:00 PM America/New_York and resets weekly.
