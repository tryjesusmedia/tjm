# Deployment Guide

## Recommended deployment: existing TryJesusMedia.com project

Because TryJesusMedia.com already exists, the cleanest URL is:

```text
https://tryjesusmedia.com/app/
```

Copy this entire project into an `app` folder inside the website repository:

```text
website-repository/
├── index.html
├── welcome/
├── lesson1/
└── app/
    ├── index.html
    ├── app.js
    ├── content.js
    └── ...
```

Commit and push the repository. Cloudflare Pages will redeploy the site.

### Required update

Open `config.js` and confirm:

```js
APP_URL: "https://tryjesusmedia.com/app/"
```

Then add the two snippets from `integration/` to the relevant existing pages.

## Separate Cloudflare Pages project

A separate project can be deployed without a build command.

- Framework preset: **None**
- Build command: leave blank
- Build output directory: `/`
- Production branch: your main branch

Use a subdomain such as:

```text
journey.tryjesusmedia.com
```

Then update `APP_URL` and the links inside both integration snippets.

## GitHub Pages

This project also works on GitHub Pages because it uses hash-based routes.

1. Push the contents to a repository.
2. Open **Settings → Pages**.
3. Choose **Deploy from a branch**.
4. Select the main branch and root folder.
5. Update `APP_URL` and integration links to the GitHub Pages URL.

A custom domain and HTTPS are strongly recommended for installation.

## Updating the app after launch

The service worker cache name is at the top of `sw.js`:

```js
const CACHE = "try-jesus-journey-v1.0.0";
```

Change the version after major releases, for example:

```js
const CACHE = "try-jesus-journey-v1.1.0";
```

That causes installed devices to refresh the cached app shell.

## Fourthwall

Only one setting must change:

```js
FOURTHWALL_URL: "https://your-real-store.fourthwall.com"
```

Until that is replaced, Fourthwall buttons show a setup message instead of sending visitors to a broken or invented URL.

## Question and prayer forms

The current first version stores questions locally. Before launch, connect the submit handler in `renderQuestions()` inside `app.js` to a secure endpoint. Do not place private API keys directly inside browser JavaScript.
