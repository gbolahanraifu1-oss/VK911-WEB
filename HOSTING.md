# Free Hosting Guide — VK911 XMD

## Website (Frontend)

### Vercel ✅ RECOMMENDED (100% free forever)
Best option. Auto-deploys from GitHub.

1. Push your `index.html` to a GitHub repo
2. Go to https://vercel.com → Sign up free
3. Click **Add New Project** → Import your GitHub repo
4. Deploy → Get a URL like `https://vk911-pair.vercel.app`
5. Done ✅

### Netlify (also free)
Same process — https://netlify.com
Drag and drop your `index.html` for instant deploy.

---

## Bot Backend (Node.js)

### Railway.app ✅ RECOMMENDED
- $5 free credit monthly — enough for a small bot
- Auto-deploys from GitHub
- Steps:
  1. Push bot code to GitHub
  2. Go to https://railway.app → New Project → Deploy from GitHub
  3. Set environment variables from your `.env`
  4. Bot gets an HTTPS URL automatically: `https://vk911bot-production.up.railway.app`
  5. Put that HTTPS URL in `index.html` → `BOT_SERVERS`

### Render.com (free tier)
- Free web service (sleeps after 15 min idle)
- Not ideal for a bot but works for light use
- https://render.com → New Web Service → Connect GitHub

### Koyeb (free tier)
- Doesn't sleep like Render
- https://koyeb.com → Free tier available

---

## ⚡ Speed checklist

The new `pairApi.js` is event-driven and typically delivers a code in 2–5 s
on a cold start, < 1 s when the socket is warm. To keep it fast in production:

1. **Use HTTPS for your bot URL.** When the website is HTTPS and the bot is
   plain HTTP, browsers block direct calls (mixed content) and the page falls
   back to public CORS proxies — which are slower and sometimes rate-limited.
   Railway/Render/Koyeb give you HTTPS for free.
2. **Keep the bot warm.** Free-tier hosts that sleep (Render free) add 5–10 s
   to the first request. Use a paid plan or a service that doesn't sleep
   (Railway, Koyeb, Fly.io).
3. **Co-locate bot and users.** Pick a region close to where you advertise.
   The website's pre-warm fires while the user is still typing, so the round
   trip is what matters.
4. **Pre-warm endpoint.** The website automatically calls
   `POST /warm {phone}` after the user types ≥ 10 digits. The bot starts the
   WhatsApp socket in the background, so by the time the user hits the button
   the socket is already up.

---

## Setup Steps

1. **Deploy website** → Vercel (copy `index.html`)
2. **Deploy bot** → Railway (push repo, set .env vars)
3. **Copy Railway HTTPS URL** → paste into `BOT_SERVERS` in `index.html`
4. **Test** → Enter your number on the website, get pairing code
5. **Share** the Vercel URL with customers

---

## Environment Variables on Railway

Set these in Railway dashboard → Variables:
```
BOT_NAME=VK911 XMD
OWNER_NUMBER=2347062301699
PREFIX=.
COMMAND_MODE=public
TELEGRAM_BOT_TOKEN=your_token_here
WEB_PORT=3000
NEWSLETTER_JID=120363424626346173@newsletter
```

Railway auto-assigns `PORT` for web services — make sure your bot listens on
`process.env.PORT`. The new `pairApi.js` already does this.

---

> © VK911 TECH
