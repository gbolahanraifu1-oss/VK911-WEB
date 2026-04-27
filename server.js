// ╔══════════════════════════════════════════════════════════════════╗
// ║   VK911 XMD — Auth Server                                       ║
// ║   Serves the pairing portal + handles user accounts             ║
// ║   node server.js   (or: npm start)                              ║
// ╚══════════════════════════════════════════════════════════════════╝

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');

const app  = express();
const PORT = parseInt(process.env.PORT || 3000);

// ── Secret (generate a random one on first run, persist it) ──────────────────
const SECRET_FILE = path.join(__dirname, '.jwt_secret');
let JWT_SECRET;
if (fs.existsSync(SECRET_FILE)) {
    JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
} else {
    JWT_SECRET = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE, JWT_SECRET, { mode: 0o600 });
    console.log('🔑 Generated new JWT secret → .jwt_secret');
}

// ── User store (simple JSON file) ────────────────────────────────────────────
const USERS_FILE = path.join(__dirname, 'users.json');
function readUsers() {
    if (!fs.existsSync(USERS_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
    catch { return {}; }
}
function writeUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

// CORS — allow the bot servers to be called from this origin
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

// ── /api/auth/register ───────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email and password are required.' });
    }
    if (name.length < 2 || name.length > 40) {
        return res.status(400).json({ error: 'Name must be 2–40 characters.' });
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const users = readUsers();
    const key   = email.toLowerCase();

    if (users[key]) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const hash = await bcrypt.hash(password, 12);
    users[key] = {
        name:      name.trim(),
        email:     key,
        password:  hash,
        createdAt: new Date().toISOString(),
    };
    writeUsers(users);

    const token = jwt.sign({ email: key, name: users[key].name }, JWT_SECRET, { expiresIn: '30d' });
    console.log(`[Auth] New user registered: ${key}`);
    res.json({ token, user: { name: users[key].name, email: key } });
});

// ── /api/auth/login ──────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const users = readUsers();
    const key   = email.toLowerCase();
    const user  = users[key];

    if (!user) {
        return res.status(401).json({ error: 'No account found with that email.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
        return res.status(401).json({ error: 'Incorrect password.' });
    }

    const token = jwt.sign({ email: key, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    console.log(`[Auth] Login: ${key}`);
    res.json({ token, user: { name: user.name, email: key } });
});

// ── /api/auth/me ─────────────────────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: { name: req.user.name, email: req.user.email } });
});

// ── /api/auth/change-password ────────────────────────────────────────────────
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
    const { current, newPassword } = req.body || {};
    if (!current || !newPassword) {
        return res.status(400).json({ error: 'Both current and new password are required.' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    const users = readUsers();
    const user  = users[req.user.email];
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const match = await bcrypt.compare(current, user.password);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    users[req.user.email].password = await bcrypt.hash(newPassword, 12);
    writeUsers(users);
    res.json({ ok: true });
});

// ── Serve index.html ─────────────────────────────────────────────────────────
app.get('*', (req, res) => {
    const html = path.join(__dirname, 'index.html');
    if (fs.existsSync(html)) return res.sendFile(html);
    res.status(404).send('index.html not found');
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 VK911 Auth Portal → http://localhost:${PORT}`);
    console.log(`   POST /api/auth/register`);
    console.log(`   POST /api/auth/login`);
    console.log(`   GET  /api/auth/me\n`);
});
