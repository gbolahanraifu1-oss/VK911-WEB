// ╔══════════════════════════════════════════════════════════════════╗
// ║   VK911 XMD — Auth Server  (Vercel-ready)                       ║
// ║   Users stored in Upstash Redis                                  ║
// ║   JWT secret from environment variable                           ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const path    = require('path');
const { Redis } = require('@upstash/redis');

const app = express();

// ── JWT Secret (set in Vercel Environment Variables) ──────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET environment variable is not set!');
    // Don't crash — let routes fail gracefully so Vercel still boots
}

// ── Upstash Redis client (set in Vercel Environment Variables) ────────────────
// Requires: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
const redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ── User helpers (stored as Redis hashes under key: user:<email>) ─────────────
async function getUser(email) {
    return await redis.hgetall(`user:${email.toLowerCase()}`);
}

async function setUser(email, data) {
    const key = `user:${email.toLowerCase()}`;
    await redis.hset(key, data);
    // Keep an index so we can list users if needed later
    await redis.sadd('users:index', email.toLowerCase());
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ error: 'Token expired or invalid' });
    }
}

// ── /api/auth/register ────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body || {};

        if (!name || !email || !password)
            return res.status(400).json({ error: 'Name, email and password are required.' });
        if (name.length < 2 || name.length > 40)
            return res.status(400).json({ error: 'Name must be 2–40 characters.' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return res.status(400).json({ error: 'Enter a valid email address.' });
        if (password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });

        const existing = await getUser(email);
        if (existing && existing.email)
            return res.status(409).json({ error: 'An account with this email already exists.' });

        const hash = await bcrypt.hash(password, 12);
        await setUser(email, {
            name:      name.trim(),
            email:     email.toLowerCase(),
            password:  hash,
            createdAt: new Date().toISOString(),
        });

        const token = jwt.sign(
            { email: email.toLowerCase(), name: name.trim() },
            JWT_SECRET,
            { expiresIn: '30d' }
        );
        console.log(`[Auth] Registered: ${email.toLowerCase()}`);
        res.json({ token, user: { name: name.trim(), email: email.toLowerCase() } });

    } catch (err) {
        console.error('[register]', err);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

// ── /api/auth/login ───────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password)
            return res.status(400).json({ error: 'Email and password are required.' });

        const user = await getUser(email);
        if (!user || !user.email)
            return res.status(401).json({ error: 'No account found with that email.' });

        const match = await bcrypt.compare(password, user.password);
        if (!match)
            return res.status(401).json({ error: 'Incorrect password.' });

        const token = jwt.sign(
            { email: user.email, name: user.name },
            JWT_SECRET,
            { expiresIn: '30d' }
        );
        console.log(`[Auth] Login: ${user.email}`);
        res.json({ token, user: { name: user.name, email: user.email } });

    } catch (err) {
        console.error('[login]', err);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

// ── /api/auth/me ──────────────────────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: { name: req.user.name, email: req.user.email } });
});

// ── /api/auth/change-password ─────────────────────────────────────────────────
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
    try {
        const { current, newPassword } = req.body || {};
        if (!current || !newPassword)
            return res.status(400).json({ error: 'Both current and new password are required.' });
        if (newPassword.length < 6)
            return res.status(400).json({ error: 'New password must be at least 6 characters.' });

        const user = await getUser(req.user.email);
        if (!user || !user.email)
            return res.status(404).json({ error: 'User not found.' });

        const match = await bcrypt.compare(current, user.password);
        if (!match)
            return res.status(401).json({ error: 'Current password is incorrect.' });

        const newHash = await bcrypt.hash(newPassword, 12);
        await redis.hset(`user:${req.user.email}`, { password: newHash });

        res.json({ ok: true });

    } catch (err) {
        console.error('[change-password]', err);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

// ── Serve index.html for everything else ──────────────────────────────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Export for Vercel (no app.listen) ────────────────────────────────────────
module.exports = app;
