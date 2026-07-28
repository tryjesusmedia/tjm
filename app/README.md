# Try Jesus: The Journey

A premium, installable Progressive Web App for TryJesusMedia.com.

**Core promise:** Investigate the evidence. Experience the difference. Decide for yourself.

## What is included

- Premium responsive design using the Try Jesus Media plum, charcoal, ivory, and gold palette
- Existing Try Jesus Media lion-and-lamb emblem as the app logo and install icon
- Spiritual Compass onboarding assessment
- Personalized result screens for five audience mindsets
- App dashboard with one clear next step
- Seven-day flagship Bible journey: **Can the Bible Really Reveal the Future?**
- Bible passages, reflection prompts, decisions, historical-source links, and open loops
- Private journal stored in the visitor's browser
- Lesson completion and progress tracking
- Ask Anything interface with a production integration hook noted below
- Thursday discussion invitations linked to `https://tryjesusmedia.com/welcome`
- Fourthwall invitations controlled by one editable URL
- Installable PWA manifest, icons, offline shell, and service worker
- Dedicated install screen at `#/install`
- Website snippets for the main landing page and `/welcome` page
- Mobile bottom navigation and desktop sidebar
- No build system or paid dependency required

## Install-prompt strategy already implemented

The app deliberately does **not** interrupt first-time visitors with an install request on the opening screen.

The install invitation appears in these conversion-appropriate places:

1. **The existing welcome page** — through `integration/welcome-page-install-card.html`
2. **The app's dedicated install screen** — `/app/#/install`
3. **After the Spiritual Compass result** — after the visitor understands the value
4. **On the returning-user dashboard**
5. **Immediately after the first completed lesson** — a milestone-based prompt
6. **Inside More / Settings** — always available, never forced
7. **Header install icon** — visible only after onboarding and only when not installed

The main landing page receives only the subtle footer link in `integration/landing-page-soft-app-link.html`, so it does not compete with the landing page's primary call to action.

## Before launch

Open `config.js` and replace:

```js
FOURTHWALL_URL: "https://YOUR-FOURTHWALL-STORE.fourthwall.com"
```

with the exact Try Jesus Media Fourthwall storefront or collection URL.

Confirm the app's final location:

```js
APP_URL: "https://tryjesusmedia.com/app/"
```

The included website snippets assume the app is hosted at `/app/`.

## Preview locally

A PWA must be served through a web server rather than opened by double-clicking `index.html`.

From inside this folder:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Data and privacy in this first version

Progress, decisions, journal entries, and submitted questions are saved in browser `localStorage`. They stay on that browser/device and are not transmitted anywhere.

Before a public ministry launch, connect the Ask Anything form and any prayer-response workflow to a secure backend such as Supabase or your preferred form/email platform. The current screen clearly states when a question is stored locally.

## Content editing

- Global URLs and settings: `config.js`
- Onboarding, journeys, lessons, and invitations: `content.js`
- App behavior: `app.js`
- Design system: `styles.css`

Each future Bible guide can be added as another journey object in `content.js`.

## Browser support

The app works as a normal responsive website in current browsers. Install behavior varies by browser:

- Chrome and Edge can show the native install prompt.
- iPhone and iPad users receive Safari “Add to Home Screen” instructions.
- Browsers that do not expose a native prompt receive browser-menu instructions.

PWA installation and service workers require HTTPS in production.

## Directory map

```text
try-jesus-journey-app/
├── index.html
├── styles.css
├── app.js
├── content.js
├── config.js
├── manifest.webmanifest
├── sw.js
├── offline.html
├── assets/
├── integration/
├── preview/
├── DEPLOYMENT.md
└── README.md
```
