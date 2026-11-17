// Blob - main server: accounts, servers, channels, chat, soundboard and voice tokens.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import { AccessToken } from 'livekit-server-sdk';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const dataDir = path.join(root, 'data');
const uploadDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

// ---------- Database ----------
const db = new DatabaseSync(path.join(dataDir, 'blob.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  pass TEXT NOT NULL, color TEXT NOT NULL, avatar TEXT, status TEXT DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, owner_id INTEGER NOT NULL, invite TEXT UNIQUE NOT NULL, color TEXT NOT NULL, icon TEXT);
CREATE TABLE IF NOT EXISTS members (server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY (server_id, user_id));
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY, server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('text','voice')), position INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id), content TEXT NOT NULL DEFAULT '', attachment TEXT, created_at INTEGER NOT NULL, edited_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_msg_channel ON messages(channel_id, id);
CREATE TABLE IF NOT EXISTS reactions (message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE, user_id INTEGER, emoji TEXT, PRIMARY KEY (message_id, user_id, emoji));
CREATE TABLE IF NOT EXISTS sounds (
  id INTEGER PRIMARY KEY, server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '🔊', file TEXT NOT NULL, volume REAL NOT NULL DEFAULT 1, user_id INTEGER);
`);

const COLORS = ['#e8567a', '#4fb3a9', '#f0a33a', '#7c6cf0', '#3fa7e0', '#5cc96b', '#e0623f', '#c45ad6'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const now = () => Date.now();
const randCode = () => crypto.randomBytes(4).toString('hex');

function hashPass(p) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(p, salt, 64).toString('hex');
}
function checkPass(p, stored) {
  const [salt, h] = stored.split(':');
  const test = crypto.scryptSync(p, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(h, 'hex'));
}

const publicUser = (u) => u && { id: u.id, username: u.username, color: u.color, avatar: u.avatar, status: u.status };

function createServer(name, ownerId) {
  const r = db.prepare('INSERT INTO servers (name, owner_id, invite, color) VALUES (?,?,?,?)').run(name, ownerId, randCode(), pick(COLORS));
  const sid = Number(r.lastInsertRowid);
  db.prepare('INSERT INTO members VALUES (?,?)').run(sid, ownerId);
  const ch = db.prepare('INSERT INTO channels (server_id, name, type, position) VALUES (?,?,?,?)');
  ch.run(sid, 'general', 'text', 0);
  ch.run(sid, 'memes', 'text', 1);
  ch.run(sid, 'Room 1', 'voice', 2);
  ch.run(sid, 'Room 2', 'voice', 3);
  return sid;
}

const isMember = (sid, uid) => !!db.prepare('SELECT 1 FROM members WHERE server_id=? AND user_id=?').get(sid, uid);
const channelServer = (cid) => db.prepare('SELECT * FROM channels WHERE id=?').get(cid);

// ---------- In-memory state (presence and voice) ----------
const sockets = new Map(); // userId -> Set<ws>
const voice = new Map(); // userId -> { channelId, muted, deafened, streaming, video }

function serverIdsOf(uid) {
  return db.prepare('SELECT server_id FROM members WHERE user_id=?').all(uid).map((r) => r.server_id);
}
function sendTo(uid, msg) {
  const set = sockets.get(uid);
  if (!set) return;
  const s = JSON.stringify(msg);
  for (const ws of set) if (ws.readyState === 1) ws.send(s);
}
function broadcastServer(sid, msg) {
  for (const { user_id } of db.prepare('SELECT user_id FROM members WHERE server_id=?').all(sid)) sendTo(user_id, msg);
}
function broadcastRelated(uid, msg) {
  const seen = new Set();
  for (const sid of serverIdsOf(uid))
    for (const { user_id } of db.prepare('SELECT user_id FROM members WHERE server_id=?').all(sid))
      if (!seen.has(user_id)) { seen.add(user_id); sendTo(user_id, msg); }
  if (!seen.has(uid)) sendTo(uid, msg);
}

function bootstrap(uid) {
  const user = publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(uid));
  const servers = db.prepare('SELECT s.* FROM servers s JOIN members m ON m.server_id=s.id WHERE m.user_id=? ORDER BY s.id').all(uid).map((s) => ({
    ...s,
    channels: db.prepare('SELECT * FROM channels WHERE server_id=? ORDER BY position, id').all(s.id),
    members: db.prepare('SELECT u.* FROM users u JOIN members m ON m.user_id=u.id WHERE m.server_id=? ORDER BY u.username').all(s.id).map(publicUser),
    sounds: db.prepare('SELECT * FROM sounds WHERE server_id=? ORDER BY id').all(s.id),
  }));
  return { user, servers, online: [...sockets.keys()], voice: Object.fromEntries(voice) };
}

// ---------- HTTP ----------
const app = express();
app.disable('x-powered-by');

// Security 1: only accept connections from this PC, the home network and Tailscale (100.64.0.0/10).
function allowedIp(raw = '') {
  const ip = raw.replace(/^::ffff:/, '');
  if (ip === '127.0.0.1' || ip === '::1') return true;
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(Number.isNaN)) return ip.startsWith('fd7a:115c:a1e0:'); // Tailscale IPv6
  return p[0] === 10 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}
app.use((req, res, next) => (allowedIp(req.socket.remoteAddress) ? next() : res.status(403).end()));

// Security 2: rate-limit login/register attempts (10 per 15 min per IP).
const attempts = new Map();
function rateLimit(req, res, next) {
  const ip = req.socket.remoteAddress;
  const now = Date.now();
  const a = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (a.length >= 10) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
  a.push(now);
  attempts.set(ip, a);
  next();
}
app.use(['/api/login', '/api/register'], rateLimit);

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(uploadDir, { maxAge: '7d' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, randCode() + randCode() + path.extname(file.originalname).toLowerCase().slice(0, 8)),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const s = token && db.prepare('SELECT user_id FROM sessions WHERE token=?').get(token);
  if (!s) return res.status(401).json({ error: 'Not authenticated' });
  req.uid = s.user_id;
  next();
}
const fail = (res, code, error) => res.status(code).json({ error });

app.post('/api/register', (req, res) => {
  const { username, password, code } = req.body || {};
  if (!/^[\w.\- ]{2,24}$/u.test(username || '')) return fail(res, 400, 'Invalid username (2-24 characters)');
  if (!password || password.length < 4) return fail(res, 400, 'Password too short');
  if (cfg.registerCode && code !== cfg.registerCode) return fail(res, 403, 'Wrong Blob invite code');
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return fail(res, 409, 'That name is already taken');
  const r = db.prepare('INSERT INTO users (username, pass, color, created_at) VALUES (?,?,?,?)').run(username.trim(), hashPass(password), pick(COLORS), now());
  const uid = Number(r.lastInsertRowid);
  // The first user creates the main server; everyone else joins it automatically.
  const first = db.prepare('SELECT id FROM servers ORDER BY id LIMIT 1').get();
  if (first) {
    db.prepare('INSERT OR IGNORE INTO members VALUES (?,?)').run(first.id, uid);
    broadcastServer(first.id, { t: 'refresh' });
  } else createServer('Blob HQ', uid);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES (?,?)').run(token, uid);
  res.json({ token });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username || '');
  if (!u || !checkPass(password || '', u.pass)) return fail(res, 401, 'Wrong username or password');
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES (?,?)').run(token, u.id);
  res.json({ token });
});

app.post('/api/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token=?').run(req.headers.authorization.replace('Bearer ', ''));
  res.json({ ok: true });
});

app.get('/api/bootstrap', auth, (req, res) => res.json(bootstrap(req.uid)));

app.patch('/api/me', auth, (req, res) => {
  const { status, color } = req.body || {};
  if (typeof status === 'string') db.prepare('UPDATE users SET status=? WHERE id=?').run(status.slice(0, 80), req.uid);
  if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) db.prepare('UPDATE users SET color=? WHERE id=?').run(color, req.uid);
  broadcastRelated(req.uid, { t: 'refresh' });
  res.json({ ok: true });
});

app.post('/api/me/avatar', auth, upload.single('file'), (req, res) => {
  if (!req.file || !/^image\//.test(req.file.mimetype)) return fail(res, 400, 'Please upload an image');
  db.prepare('UPDATE users SET avatar=? WHERE id=?').run('/uploads/' + req.file.filename, req.uid);
  broadcastRelated(req.uid, { t: 'refresh' });
  res.json({ ok: true });
});

app.delete('/api/me/avatar', auth, (req, res) => {
  db.prepare('UPDATE users SET avatar=NULL WHERE id=?').run(req.uid);
  broadcastRelated(req.uid, { t: 'refresh' });
  res.json({ ok: true });
});

// Servers
app.post('/api/servers', auth, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 40);
  if (!name) return fail(res, 400, 'Name is empty');
  const id = createServer(name, req.uid);
  sendTo(req.uid, { t: 'refresh' });
  res.json({ id });
});

app.post('/api/join', auth, (req, res) => {
  const s = db.prepare('SELECT * FROM servers WHERE invite=?').get(String(req.body?.invite || '').trim());
  if (!s) return fail(res, 404, 'Invalid invite');
  db.prepare('INSERT OR IGNORE INTO members VALUES (?,?)').run(s.id, req.uid);
  broadcastServer(s.id, { t: 'refresh' });
  res.json({ id: s.id });
});

app.patch('/api/servers/:id', auth, (req, res) => {
  const s = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.id);
  if (!s || s.owner_id !== req.uid) return fail(res, 403, 'Only the owner can edit this');
  const name = String(req.body?.name || '').trim().slice(0, 40);
  if (name) db.prepare('UPDATE servers SET name=? WHERE id=?').run(name, s.id);
  broadcastServer(s.id, { t: 'refresh' });
  res.json({ ok: true });
});

app.post('/api/servers/:id/icon', auth, upload.single('file'), (req, res) => {
  const s = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.id);
  if (!s || s.owner_id !== req.uid) return fail(res, 403, 'Only the owner can edit this');
  if (!req.file || !/^image\//.test(req.file.mimetype)) return fail(res, 400, 'Please upload an image');
  db.prepare('UPDATE servers SET icon=? WHERE id=?').run('/uploads/' + req.file.filename, s.id);
  broadcastServer(s.id, { t: 'refresh' });
  res.json({ ok: true });
});

app.post('/api/servers/:id/leave', auth, (req, res) => {
  const sid = Number(req.params.id);
  db.prepare('DELETE FROM members WHERE server_id=? AND user_id=?').run(sid, req.uid);
  broadcastServer(sid, { t: 'refresh' });
  sendTo(req.uid, { t: 'refresh' });
  res.json({ ok: true });
});

app.delete('/api/servers/:id', auth, (req, res) => {
  const s = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.id);
  if (!s || s.owner_id !== req.uid) return fail(res, 403, 'Only the owner can delete this');
  const members = db.prepare('SELECT user_id FROM members WHERE server_id=?').all(s.id);
  db.prepare('DELETE FROM servers WHERE id=?').run(s.id);
  for (const m of members) sendTo(m.user_id, { t: 'refresh' });
  res.json({ ok: true });
});

// Channels
app.post('/api/servers/:id/channels', auth, (req, res) => {
  const sid = Number(req.params.id);
  if (!isMember(sid, req.uid)) return fail(res, 403, 'No access');
  const type = req.body?.type === 'voice' ? 'voice' : 'text';
  let name = String(req.body?.name || '').trim().slice(0, 40);
  if (type === 'text') name = name.toLowerCase().replace(/\s+/g, '-');
  if (!name) return fail(res, 400, 'Name is empty');
  const pos = db.prepare('SELECT COALESCE(MAX(position),0)+1 p FROM channels WHERE server_id=?').get(sid).p;
  db.prepare('INSERT INTO channels (server_id, name, type, position) VALUES (?,?,?,?)').run(sid, name, type, pos);
  broadcastServer(sid, { t: 'refresh' });
  res.json({ ok: true });
});

app.patch('/api/channels/:id', auth, (req, res) => {
  const ch = channelServer(req.params.id);
  if (!ch || !isMember(ch.server_id, req.uid)) return fail(res, 403, 'No access');
  let name = String(req.body?.name || '').trim().slice(0, 40);
  if (ch.type === 'text') name = name.toLowerCase().replace(/\s+/g, '-');
  if (name) db.prepare('UPDATE channels SET name=? WHERE id=?').run(name, ch.id);
  broadcastServer(ch.server_id, { t: 'refresh' });
  res.json({ ok: true });
});

app.delete('/api/channels/:id', auth, (req, res) => {
  const ch = channelServer(req.params.id);
  if (!ch || !isMember(ch.server_id, req.uid)) return fail(res, 403, 'No access');
  db.prepare('DELETE FROM channels WHERE id=?').run(ch.id);
  broadcastServer(ch.server_id, { t: 'refresh' });
  res.json({ ok: true });
});

// Messages
const msgSelect = `SELECT m.*, u.username, u.color, u.avatar FROM messages m JOIN users u ON u.id=m.user_id`;
function withReactions(msgs) {
  const q = db.prepare('SELECT emoji, user_id FROM reactions WHERE message_id=?');
  return msgs.map((m) => {
    const r = {};
    for (const row of q.all(m.id)) (r[row.emoji] ||= []).push(row.user_id);
    return { ...m, reactions: r };
  });
}

app.get('/api/channels/:id/messages', auth, (req, res) => {
  const ch = channelServer(req.params.id);
  if (!ch || !isMember(ch.server_id, req.uid)) return fail(res, 403, 'No access');
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const rows = db.prepare(`${msgSelect} WHERE m.channel_id=? AND m.id<? ORDER BY m.id DESC LIMIT 60`).all(ch.id, before).reverse();
  res.json(withReactions(rows));
});

app.post('/api/channels/:id/messages', auth, upload.single('file'), (req, res) => {
  const ch = channelServer(req.params.id);
  if (!ch || !isMember(ch.server_id, req.uid)) return fail(res, 403, 'No access');
  const content = String(req.body?.content || '').slice(0, 4000);
  const attachment = req.file ? JSON.stringify({ url: '/uploads/' + req.file.filename, name: req.file.originalname, type: req.file.mimetype, size: req.file.size }) : null;
  if (!content.trim() && !attachment) return fail(res, 400, 'Message is empty');
  const r = db.prepare('INSERT INTO messages (channel_id, user_id, content, attachment, created_at) VALUES (?,?,?,?,?)').run(ch.id, req.uid, content, attachment, now());
  const msg = withReactions([db.prepare(`${msgSelect} WHERE m.id=?`).get(r.lastInsertRowid)])[0];
  broadcastServer(ch.server_id, { t: 'message', msg, serverId: ch.server_id });
  res.json(msg);
});

function msgAccess(req, res) {
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(req.params.id);
  const ch = m && channelServer(m.channel_id);
  if (!m || !isMember(ch.server_id, req.uid)) { fail(res, 403, 'No access'); return null; }
  return { m, ch };
}
const pushMsgUpdate = (id, sid) => broadcastServer(sid, { t: 'message_update', msg: withReactions([db.prepare(`${msgSelect} WHERE m.id=?`).get(id)])[0] });

app.patch('/api/messages/:id', auth, (req, res) => {
  const a = msgAccess(req, res); if (!a) return;
  if (a.m.user_id !== req.uid) return fail(res, 403, 'Only the author can edit this');
  db.prepare('UPDATE messages SET content=?, edited_at=? WHERE id=?').run(String(req.body?.content || '').slice(0, 4000), now(), a.m.id);
  pushMsgUpdate(a.m.id, a.ch.server_id);
  res.json({ ok: true });
});

app.delete('/api/messages/:id', auth, (req, res) => {
  const a = msgAccess(req, res); if (!a) return;
  const owner = db.prepare('SELECT owner_id FROM servers WHERE id=?').get(a.ch.server_id).owner_id;
  if (a.m.user_id !== req.uid && owner !== req.uid) return fail(res, 403, 'No permission');
  db.prepare('DELETE FROM messages WHERE id=?').run(a.m.id);
  broadcastServer(a.ch.server_id, { t: 'message_delete', id: a.m.id, channelId: a.ch.id });
  res.json({ ok: true });
});

app.post('/api/messages/:id/react', auth, (req, res) => {
  const a = msgAccess(req, res); if (!a) return;
  const emoji = String(req.body?.emoji || '').slice(0, 16);
  if (!emoji) return fail(res, 400, 'Emoji is empty');
  const exists = db.prepare('SELECT 1 FROM reactions WHERE message_id=? AND user_id=? AND emoji=?').get(a.m.id, req.uid, emoji);
  if (exists) db.prepare('DELETE FROM reactions WHERE message_id=? AND user_id=? AND emoji=?').run(a.m.id, req.uid, emoji);
  else db.prepare('INSERT INTO reactions VALUES (?,?,?)').run(a.m.id, req.uid, emoji);
  pushMsgUpdate(a.m.id, a.ch.server_id);
  res.json({ ok: true });
});

// Soundboard
app.post('/api/servers/:id/sounds', auth, upload.single('file'), (req, res) => {
  const sid = Number(req.params.id);
  if (!isMember(sid, req.uid)) return fail(res, 403, 'No access');
  if (!req.file || !/^audio\//.test(req.file.mimetype)) return fail(res, 400, 'Please upload an audio file (mp3, ogg, wav)');
  if (req.file.size > 5 * 1024 * 1024) return fail(res, 400, 'Sound too large (max 5MB)');
  const name = String(req.body?.name || req.file.originalname.replace(/\.[^.]+$/, '')).slice(0, 32);
  const emoji = String(req.body?.emoji || '🔊').slice(0, 8);
  db.prepare('INSERT INTO sounds (server_id, name, emoji, file, user_id) VALUES (?,?,?,?,?)').run(sid, name, emoji, '/uploads/' + req.file.filename, req.uid);
  broadcastServer(sid, { t: 'refresh' });
  res.json({ ok: true });
});

app.delete('/api/sounds/:id', auth, (req, res) => {
  const s = db.prepare('SELECT * FROM sounds WHERE id=?').get(req.params.id);
  if (!s || !isMember(s.server_id, req.uid)) return fail(res, 403, 'No access');
  db.prepare('DELETE FROM sounds WHERE id=?').run(s.id);
  broadcastServer(s.server_id, { t: 'refresh' });
  res.json({ ok: true });
});

// Voice: LiveKit token
app.get('/api/voice/token', auth, async (req, res) => {
  const ch = channelServer(req.query.channelId);
  if (!ch || ch.type !== 'voice' || !isMember(ch.server_id, req.uid)) return fail(res, 403, 'No access');
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.uid);
  const at = new AccessToken(cfg.livekitApiKey, cfg.livekitApiSecret, {
    identity: String(u.id), name: u.username, ttl: '12h',
    metadata: JSON.stringify({ color: u.color, avatar: u.avatar }),
  });
  at.addGrant({ roomJoin: true, room: 'ch_' + ch.id, canPublish: true, canSubscribe: true, canPublishData: true });
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost').toString().replace(/:\d+$/, '');
  const proto = req.secure ? 'wss' : 'ws';
  res.json({ token: await at.toJwt(), url: `${proto}://${host}:${cfg.livekitPort}` });
});

// Built web client
const clientDist = path.join(root, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api|uploads|ws).*/, (_req, res) => {
  const index = path.join(clientDist, 'index.html');
  if (fs.existsSync(index)) res.sendFile(index);
  else res.status(503).send('Client not built yet. Run "npm run build" in the client folder.');
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

// ---------- WebSocket ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function setVoice(uid, state) {
  if (state) voice.set(uid, state);
  else voice.delete(uid);
  broadcastRelated(uid, { t: 'voice', userId: uid, state: state || null });
}

// Web app version (changes on every build): open apps reload themselves when it changes.
let cachedVersion = null;
function clientVersion() {
  if (cachedVersion) return cachedVersion;
  try { cachedVersion = crypto.createHash('sha1').update(fs.readFileSync(path.join(clientDist, 'index.html'))).digest('hex').slice(0, 10); } catch { cachedVersion = 'dev'; }
  return cachedVersion;
}
// When the web client is rebuilt, tell every open app right away so it reloads.
fs.watchFile(path.join(clientDist, 'index.html'), { interval: 3000 }, () => {
  cachedVersion = null;
  const msg = JSON.stringify({ t: 'hello', version: clientVersion() });
  for (const ws of wss.clients) if (ws.readyState === 1) ws.send(msg);
  console.log('[blob] web client rebuilt, version', cachedVersion);
});

// Auto-update: if this folder is a GitHub clone, check for a new version every 5 minutes.
// If there is one, exit with code 42 — "Start Blob Server.bat" pulls, rebuilds and restarts.
import('node:child_process').then(({ execFile }) => {
  const repoDir = path.join(root, '..');
  if (!fs.existsSync(path.join(repoDir, '.git'))) return;
  const git = (...args) => new Promise((ok) => execFile('git', args, { cwd: repoDir, windowsHide: true }, (err, out) => ok(err ? null : out.trim())));
  const check = async () => {
    if (!(await git('fetch', '--quiet'))) { /* offline: try again later */ }
    const [head, up] = await Promise.all([git('rev-parse', 'HEAD'), git('rev-parse', '@{u}')]);
    if (head && up && head !== up) {
      console.log('[blob] New version on GitHub! Restarting to update...');
      process.exit(42);
    }
  };
  setInterval(check, 5 * 60 * 1000);
});

wss.on('connection', (ws, req) => {
  if (!allowedIp(req.socket.remoteAddress)) return ws.close(4003, 'ip');
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  const s = token && db.prepare('SELECT user_id FROM sessions WHERE token=?').get(token);
  if (!s) return ws.close(4001, 'auth');
  const uid = s.user_id;
  const firstConn = !sockets.has(uid);
  if (firstConn) sockets.set(uid, new Set());
  sockets.get(uid).add(ws);
  if (firstConn) broadcastRelated(uid, { t: 'presence', userId: uid, online: true });
  ws.send(JSON.stringify({ t: 'hello', version: clientVersion() }));

  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'voice') {
      if (!m.state) return setVoice(uid, null);
      const ch = channelServer(m.state.channelId);
      if (!ch || ch.type !== 'voice' || !isMember(ch.server_id, uid)) return;
      setVoice(uid, {
        channelId: ch.id, serverId: ch.server_id, muted: !!m.state.muted, deafened: !!m.state.deafened,
        streaming: !!m.state.streaming, video: !!m.state.video,
      });
    } else if (m.t === 'typing') {
      const ch = channelServer(m.channelId);
      if (ch && isMember(ch.server_id, uid)) broadcastServer(ch.server_id, { t: 'typing', channelId: ch.id, userId: uid });
    }
  });
  ws.on('close', () => {
    const set = sockets.get(uid);
    set?.delete(ws);
    if (set && set.size === 0) {
      sockets.delete(uid);
      if (voice.has(uid)) setVoice(uid, null);
      broadcastRelated(uid, { t: 'presence', userId: uid, online: false });
    }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 20000);

server.listen(cfg.port, '0.0.0.0', () => {
  console.log(`[blob] server running at http://localhost:${cfg.port}`);
});
