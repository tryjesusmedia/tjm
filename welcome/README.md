# Pastor Kal v1

Pastor Kal is a Try Jesus Media AI Bible guide designed to answer open-ended questions using:

1. the KJV Bible (66-book text corpus),
2. Pastor Kal's theology/worldview core,
3. the Get to Know Jesus Set,
4. the Bible Prophecy Set,
5. future approved Try Jesus Media teaching material.

The starter is designed for a static site using **Cloudflare Pages + Pages Functions**. The browser never receives the OpenAI API key.

## What is already built

- `functions/api/chat.js` — secure `/api/chat` endpoint using the OpenAI Responses API.
- `lib/pastor-kal-prompt.js` — Pastor Kal identity, theology, interpretation rules, tone, and pastoral safety rules.
- `public/assets/pastor-kal-chat.js` + `.css` — floating Try Jesus Media branded chat widget.
- `knowledge/sources/kjv/kjv-66-books.txt` — KJV 66-book corpus from Project Gutenberg.
- `knowledge/sources/theology/` — the three theology documents supplied for Pastor Kal.
- `knowledge/sources/guide-index.md` — all 19 current guide titles and website paths.
- `scripts/sync-guides.mjs` — downloads the current 10 Get to Know Jesus guides and 9 Bible Prophecy guides from TryJesusMedia.com and turns them into clean text files.
- `scripts/upload-knowledge.mjs` — creates/reuses an OpenAI vector store and attaches the knowledge files.
- `scripts/test-chat.mjs` — command-line test of the finished knowledge base.
- `tests/core-evals.json` — 30 doctrinal and pastoral-risk questions for pre-launch testing.

## 1. Install locally

```bash
npm install
cp .dev.vars.example .dev.vars
```

Put your OpenAI API key into `.dev.vars`.

For shell scripts that upload knowledge, export the key too:

```bash
export OPENAI_API_KEY="your_key_here"
```

## 2. Sync the two Bible-guide sets

```bash
npm run sync:guides
```

This fetches these live paths:

- `/get-to-know-jesus/guide1/` through `/guide10/`
- `/bible-prophecy/guide1/` through `/guide9/`

To sync from a staging site instead:

```bash
SITE_BASE_URL="https://your-staging-domain.example" npm run sync:guides
```

Review the generated `.txt` files in `knowledge/sources/lessons/` before uploading so only approved material enters Pastor Kal's knowledge base.

## 3. Create the Pastor Kal vector store

```bash
npm run kb:upload
```

The script prints a value such as:

```text
OPENAI_VECTOR_STORE_ID=vs_...
```

Save that ID.

## 4. Test Pastor Kal from the command line

```bash
export OPENAI_VECTOR_STORE_ID="vs_..."
npm run test:chat -- "What happens when we die?"
```

Test difficult questions, not just easy ones. `tests/core-evals.json` contains the initial 30-question acceptance set. Suggested test themes:

- suffering and God's character,
- penal substitution objections,
- justification and transformation,
- Sabbath,
- death and hell,
- Trinity,
- Daniel 2 and Daniel 9,
- Antichrist / Mark of the Beast,
- Ellen White / gift of prophecy,
- 1844 and investigative judgment,
- apparent Old Testament divine violence,
- pastoral questions involving grief, addiction, abuse, or severe distress.

## 5. Configure Cloudflare Pages

In the Cloudflare Pages project, add encrypted or protected configuration values:

- `OPENAI_API_KEY` — secret
- `OPENAI_VECTOR_STORE_ID` — environment variable or secret
- `OPENAI_MODEL` — optional, defaults to `gpt-5.6`

Do **not** put the API key into HTML or browser JavaScript.

## 6. Add the widget to the `/welcome` page only

Add this to the `<head>` of `tryjesusmedia.com/welcome`:

```html
<link rel="stylesheet" href="/assets/pastor-kal-chat.css">
```

Add this before `</body>` on that same page:

```html
<script defer src="/assets/pastor-kal-chat.js"></script>
```

The JavaScript is hard-gated to `/welcome` and `/welcome/`. If the script is accidentally loaded on any other page, it exits before rendering the **Ask Pastor Kal** launcher.

The `/api/chat` endpoint also checks the browser referrer and rejects requests that do not originate from the production `/welcome` page (with localhost allowed for development). This is an additional guard against the chatbot being used from other pages on the site.

## 7. Local preview

```bash
npm run dev
```

Then open `/welcome/` in the local Pages preview. Only `public/` is configured as the static output directory, so the theology, KJV corpus, scripts, and system prompt are not deployed as public website files.

## Privacy behavior in this starter

- Current conversation history is kept in browser `sessionStorage`, not a permanent application database.
- The backend sends `store: false` to the Responses API.
- No lead capture, account identity, or transcript database is included yet.
- The chatbot identifies itself as an AI Bible guide rather than pretending the human Pastor Kal is live in the chat.

Before a public launch, add a short privacy notice explaining what information users should avoid sharing and how API/service providers may process messages.

## Next build phase

After the core answers test well, add:

- verified Scripture/source citations in the UI,
- guide recommendation cards and one-click study links,
- Zoom/live-discussion invitation logic,
- optional lead capture / Omnisend handoff,
- abuse/spam rate limiting and Turnstile,
- analytics for topics and unanswered questions,
- an admin workflow for adding new sermons and lessons,
- optional user accounts and long-term memory (only with an explicit privacy design),
- the same `/api/chat` backend for the mobile app.


## Pastor Kal avatar

The chatbot now uses Pastor Kal's supplied photo in both the floating **Ask Pastor Kal** launcher and the chat header. The image is included at:

`public/assets/pastor-kal-avatar.jpg`

If you ever want to replace the photo, overwrite that file with another JPG using the same filename.

