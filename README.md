# Try Jesus Media Homepage

Upload `index.html` and the `assets` folder to the root of the GitHub repository. Keep the existing `bible-prophecy`, `get-to-know-jesus`, and `welcome` folders.

## Featured YouTube videos

In `index.html`, search for `data-youtube-url`. Change only the URL for the card you want to replace. The script updates the outgoing link and lightweight 320×180 thumbnail automatically.

## Omnisend

The embedded form host intentionally has no background, border, padding, or shadow because Omnisend supplies its own form card. If spacing still appears *inside* the Omnisend form, edit that padding/height in the Omnisend form builder; cross-origin iframe content cannot be styled by this site.

## Optimized images

- `bible-decoded.jpg`: resized, progressive JPEG
- `programs-apparel.webp`: resized WebP with transparency
- Both images lazy-load below the fold.
