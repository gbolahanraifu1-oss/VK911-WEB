// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💣 VK911 XMD  |  Web Pairing API
// GET /pair?phone=234... → returns { code }
// Drop in both v2 and PRO bot folders
// Wire: require('./pairApi').init(sockFn)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const http = require('http');
const url  = require('url');

const PORT = parseInt(process.env.PORT || process.env.WEB_PORT || 3000);
const _pending = new Map();

function init(getOrCreateSock) {
    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

        const parsed = url.parse(req.url, true);
        const path   = parsed.pathname;

        if (path === '/' || path === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
            return;
        }

        if (path === '/pair') {
            const phone = (parsed.query.phone || '').replace(/[^0-9]/g, '');
            if (!phone || phone.length < 7 || phone.length > 15) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid number. Use international format: 2347062301699' }));
                return;
            }
            if (_pending.has(phone)) {
                res.writeHead(429);
                res.end(JSON.stringify({ error: `Already processing +${phone}. Wait a moment.` }));
                return;
            }
            console.log(`[WebPair] +${phone} requested`);
            try {
                const code = await new Promise(async (resolve, reject) => {
                    const timer = setTimeout(() => { _pending.delete(phone); reject(new Error('Timed out. Try again.')); }, 40000);
                    _pending.set(phone, { resolve, reject, timer });
                    try {
                        const sock = await getOrCreateSock(phone);
                        if (!sock) throw new Error('Could not start session');
                        let attempts = 0;
                        const tryCode = async () => {
                            attempts++;
                            try {
                                const c = await sock.requestPairingCode(phone);
                                if (!c) throw new Error('Empty code');
                                clearTimeout(timer); _pending.delete(phone); resolve(c);
                            } catch (e) {
                                if (attempts < 8) setTimeout(tryCode, 2500);
                                else { clearTimeout(timer); _pending.delete(phone); reject(new Error('Could not get code after 8 attempts')); }
                            }
                        };
                        setTimeout(tryCode, 3500);
                    } catch (e) { clearTimeout(timer); _pending.delete(phone); reject(e); }
                });
                const formatted = code.match(/.{1,4}/g)?.join('-') || code;
                console.log(`[WebPair] Code for +${phone}: ${formatted}`);
                res.writeHead(200);
                res.end(JSON.stringify({ code: formatted, phone }));
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(PORT, '0.0.0.0', () => console.log(`🌐 WebPair API → port ${PORT}`));
    server.on('error', e => console.error('[WebPair]', e.message));
    return server;
}

module.exports = { init };
