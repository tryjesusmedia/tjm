# Try Jesus Media — Lesson 3

GitHub-ready static webpage for:

`https://tryjesusmedia.com/lesson3/`

## Upload

Upload the entire `lesson3` folder to the root of the repository that powers TryJesusMedia.com.

Expected structure:

```text
lesson3/
├── index.html
└── assets/
    ├── config.js
    ├── script.js
    └── styles.css
```

No framework, build step, package installation, or external font dependency is required.

## Important: direct Zoom join link

The page currently uses `https://zoombiblestudy.com/` as the safe discussion-access fallback because the direct Zoom meeting URL was not supplied.

For a true one-click button that enters the Zoom meeting, open:

`lesson3/assets/config.js`

Replace:

```js
zoomUrl: 'https://zoombiblestudy.com/',
```

with the direct Zoom join URL, for example:

```js
zoomUrl: 'https://us06web.zoom.us/j/MEETING_ID?pwd=PASSCODE',
```

When the URL contains `zoom.us`, the page automatically changes the button wording to:

**Enter the Live Zoom Call**

and tells the reader that Zoom will open in a new tab.

## Weekly discussion schedule

The page displays:

**Every Thursday at 8:00 PM Eastern**

A live countdown is calculated in the `America/New_York` time zone and adjusts for daylight-saving time.

The schedule can be edited in `assets/config.js`:

```js
discussionDay: 4,             // Thursday: Sunday=0 ... Saturday=6
discussionHourEastern: 20,    // 8:00 PM
discussionMinuteEastern: 0,
```

## Social links

The social links are centralized in `assets/config.js` so they can be updated once without editing the HTML.

Included profiles:

- YouTube: `https://www.youtube.com/@KalmanRoller`
- Facebook: `https://www.facebook.com/profile.php?id=61575629752301`
- Instagram: `https://www.instagram.com/zoom.bible.study`
- TikTok: `https://tiktok.com/@zoombiblestudy.com`
- X: `https://x.com/BonggiKalmander`

## Features

- Eight-screen mobile Bible study experience
- Same premium plum, gold, ivory, and charcoal system as Lessons 1 and 2
- Expandable KJV Scripture cards with NKJV BibleGateway links
- Seven optional deeper-study and illustration drawers
- Private reflection fields saved locally in the browser
- Saved lesson progress
- Browser-based narration
- Keyboard navigation with left and right arrow keys
- Weekly Zoom-community invitation
- Eastern-time countdown to the next discussion
- Restrained social footer
- Responsive mobile and desktop layout
- Reduced-motion and accessibility support

## Links to confirm before launch

- Direct Zoom meeting join URL
- `/lesson4/` destination
- TryJesusMedia.com home-page logo or brand treatment, if replacing the built-in TJ mark
