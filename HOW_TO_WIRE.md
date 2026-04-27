# How to Wire pairApi.js into Each Bot

## ⚡ What changed (FAST version)

The new `pairApi.js` is **event-driven** instead of polling-based:

| | Old | New |
|---|---|---|
| Initial wait before requesting code | 2 000 ms | 200 ms |
| Triggers code request when           | timer fires | `connection.update` event fires (real-time) |
| Retry interval                       | 1 500–2 500 ms | 600 ms |
| Total budget                         | 35–50 s | 22 s |
| Endpoints                            | `/pair`, `/health` | `/pair`, `/health`, **`POST /warm`** |
| In-flight de-dup                     | ❌ | ✅ — second click reuses the first request |
| Typical cold-start time              | 8–15 s | 2–5 s |
| Typical warm-call time               | 5–8 s  | < 1 s |

The signature `init(getSocketFn)` is unchanged, so **no edits to `index.js` are
needed**. Drop in the new `pairApi.js` and restart.

---

## Step 1 — Copy pairApi.js
Put the matching `pairApi.js` (each bot has its own port hard-coded) in the
root of each bot folder, alongside `index.js`.

| Bot | Port |
|---|---|
| VK911 XMD     | `24682` |
| VK911 XMD PRO | `24823` |
| VK911 MINI XMD | `24582` |

Override at runtime with `PORT` or `WEB_PORT` env vars if you need to.

---

## Step 2 — Wiring (already done in your bots)

### VK911 XMD v2 (`index.js`)

```js
const pairApi = require('./pairApi');
pairApi.init(async (phone) => {
    if (global._sockets?.has(phone)) {
        const existing = global._sockets.get(phone);
        if (existing?.ws?.readyState === 1) return existing;
    }
    if (global._reconnectLocked) global._reconnectLocked[phone] = false;
    if (global._reconnectCount)  global._reconnectCount[phone]  = 0;
    await startXeonBotInc(phone, null);
    for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (global._sockets?.has(phone)) return global._sockets.get(phone);
    }
    return global._sockets?.get(phone) || null;
});
```

### VK911 XMD PRO (`index.js`)

```js
const pairApi = require('./pairApi');
pairApi.init(async (phone) => {
    try { return await startSession(phone, null); }
    catch (e) { console.error('[WebPair] startSession error:', e.message); return null; }
});
```

### VK911 MINI XMD (`index.js`)

```js
const pairApi = require('./pairApi');
pairApi.init(async (phone) => {
    if (activeSessions.has(phone)) {
        const session = activeSessions.get(phone);
        if (session.sock?.ws?.readyState === 1) return session.sock;
    }
    return await startBotForUser(phone, null);
});
```

---

## Step 3 — Set environment variable
On Railway/Render, add (optional, only if you want a custom port):
```
PORT=3000
```
(Railway auto-sets `PORT`, so usually nothing to do.)

---

## Step 4 — Update website BOT_SERVERS
In `index.html`, the constant near the top of the `<script>` block:
```js
const BOT_SERVERS = {
    v2:   "http://noel.hidencloud.com:24682",
    pro:  "http://zac.hidencloud.com:24823",
    mini: "http://jobs.hidencloud.com:24582"
};
```

> ⚠️ **Use HTTPS if you can.** When the website is served over HTTPS but the
> bot URL is `http://`, browsers block direct calls (mixed content) and the
> page falls back to public CORS proxies, which are slower and sometimes
> rate-limited. Putting Cloudflare / a reverse proxy in front of each bot to
> get an `https://` URL eliminates the proxy hop entirely.

---

## How the new flow works
1. User types digits → after a 600 ms pause the website fires
   `POST /warm {phone}` to the selected bot. The bot starts spinning up the
   WhatsApp socket **in the background** while the user is still finishing
   their number.
2. User taps **GET PAIRING CODE** → the website calls
   `GET /pair?phone=…` (raced against multiple CORS proxies in parallel —
   first one that responds wins).
3. The bot's `pairApi.js` listens to `connection.update` on the socket and
   calls `requestPairingCode()` the moment Baileys finishes its noise
   handshake. No more arbitrary waits.
4. Returns `{ code: "ABCD-EFGH", phone, ms }` back to the website.
5. Website displays the code with a 60-second countdown and a click-to-copy
   shortcut. Cold starts are typically 2–5 s, warmed calls under 1 s.

## CORS
`pairApi.js` already sets `Access-Control-Allow-Origin: *` so the website can
call it from any domain (Vercel, Netlify, etc.).
