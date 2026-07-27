# Try Jesus Media — Welcome Page

GitHub-ready static welcome page for:

`https://tryjesusmedia.com/welcome/`

## Upload

Upload the complete `welcome` folder to the root of the repository that powers TryJesusMedia.com.

Expected structure:

```text
welcome/
├── index.html
└── assets/
    ├── config.js
    ├── script.js
    └── styles.css
```

No framework, package installation, or build step is required.

## Direct Zoom link

The page currently uses `https://zoombiblestudy.com/` as the discussion-access fallback because the direct Zoom join URL was not supplied.

For a true one-click button that enters the Zoom meeting, open:

`welcome/assets/config.js`

Replace:

```js
zoomUrl: 'https://zoombiblestudy.com/',
```

with the direct Zoom join link, for example:

```js
zoomUrl: 'https://us06web.zoom.us/j/MEETING_ID?pwd=PASSCODE',
```

When the link contains `zoom.us`, the page automatically changes the primary wording to **Enter the Live Zoom Call** and tells readers the Zoom meeting room will open.

## Schedule

The countdown is configured for every Thursday at 8:00 PM Eastern and automatically accounts for Eastern daylight-saving time.

Edit these values in `assets/config.js` if the schedule changes:

```js
discussionDay: 4,
discussionHourEastern: 20,
discussionMinuteEastern: 0,
```

## Lesson links

The lesson cards point to:

- `/lesson1/`
- `/lesson2/`
- `/lesson3/`
- `/lesson4/`
- `/lesson5/`

Lesson 4 and Lesson 5 buttons will work as soon as those folders are published.

## Social links

YouTube, Facebook, Instagram, TikTok, and X URLs are centralized in `welcome/assets/config.js`.

## Features

- Premium mobile-first welcome experience
- Live Thursday discussion invitation
- Eastern-time countdown timer
- Dynamic direct-Zoom wording
- Community and belonging copy
- Five premium lesson cards
- Responsive mobile and desktop design
- Accessible landmarks and tap targets
- Restrained social footer
