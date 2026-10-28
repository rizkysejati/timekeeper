// Server lokal: menyajikan halaman output untuk OBS Browser Source dan halaman kontrol untuk HP.
// Tanpa dependensi (hanya modul bawaan Node), dan tidak bergantung pada Electron supaya bisa dites.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const HTML = 'text/html; charset=utf-8';
const STATIC = {
  '/output': ['output.html', HTML],
  '/remote': ['remote.html', HTML],
  '/output.css': ['output.css', 'text/css; charset=utf-8'],
  '/remote.css': ['remote.css', 'text/css; charset=utf-8'],
  '/output.js': ['output.js', 'text/javascript; charset=utf-8'],
  '/remote.js': ['remote.js', 'text/javascript; charset=utf-8'],
  '/timefmt.js': ['timefmt.js', 'text/javascript; charset=utf-8'],
  '/web-api.js': ['web-api.js', 'text/javascript; charset=utf-8'],
};

// Hanya pengaturan tampilan yang dikirim ke browser. PIN, daftar suara, hotkey, dll. tidak ikut.
const PUBLIC_SETTINGS = ['dual', 'showLabel', 'showSegment', 'bg', 'bgColor', 'textColor', 'fontFamily', 'fontScale',
  'fontWeight', 'fontCustom', 'warnEnabled', 'warn1At', 'warn1Color', 'warn2At', 'warn2Color', 'clock24', 'clockSeconds'];

// Perintah yang boleh dikirim dari browser/HP. Pengaturan aplikasi sengaja tidak termasuk.
const REMOTE_CMDS = new Set(['start', 'pause', 'toggle', 'reset', 'adjust', 'setDuration', 'segNext', 'segPrev', 'segSelect']);
const TIMER_IDS = new Set(['A', 'B', 'ALL']);

function publicSnapshot(snap) {
  const settings = {};
  PUBLIC_SETTINGS.forEach((k) => { if (k in snap.settings) settings[k] = snap.settings[k]; });
  return { timers: snap.timers, settings };
}

// Memeriksa perintah dari luar: mengembalikan perintah bersih, atau null bila tidak valid.
function sanitizeCommand(c) {
  if (!c || typeof c !== 'object' || !REMOTE_CMDS.has(c.type) || !TIMER_IDS.has(c.id)) return null;
  const out = { type: c.type, id: c.id };
  const num = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);
  if (c.type === 'adjust') { out.ms = num(c.ms, -3600000, 3600000); if (out.ms === null) return null; }
  if (c.type === 'setDuration') { out.ms = num(c.ms, 1000, 86400000); if (out.ms === null) return null; }
  if (c.type === 'segSelect') { out.index = num(c.index, 0, 99); if (out.index === null || c.id === 'ALL') return null; }
  return out;
}

function lanAddresses() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const i of ifs[name] || []) {
      if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) out.push({ name, address: i.address });
    }
  }
  const rank = (a) => (a.startsWith('192.168.') ? 0 : a.startsWith('10.') ? 1 : 2);
  return out.sort((a, b) => rank(a.address) - rank(b.address));
}

function createServer({ rendererDir, getSnapshot, getPin, runCommand, isLocal }) {
  let server = null;
  let heartbeat = null;
  const clients = new Set();
  const fails = new Map(); // ip -> { n, until }
  let status = { running: false, port: 0, lan: false, error: '' };

  const localAddr = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const isLocalReq = isLocal || localAddr;

  // Menolak nama host aneh (perlindungan DNS rebinding): hanya localhost atau alamat IP.
  function hostOk(req) {
    const h = req.headers.host || '';
    const name = h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0];
    return name === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(name) || name.startsWith('[');
  }
  // Menolak permintaan lintas-situs (halaman web lain yang mencoba menembak localhost).
  function originOk(req) {
    const o = req.headers.origin;
    if (!o) return true;
    try { return new URL(o).host === req.headers.host; } catch { return false; }
  }
  function pinOk(req, url) {
    if (isLocalReq(req)) return true;
    const ip = req.socket.remoteAddress;
    const rec = fails.get(ip) || { n: 0, until: 0 };
    if (rec.until > Date.now()) return false;                      // sedang dikunci sementara
    const given = String(req.headers['x-pin'] || url.searchParams.get('pin') || '');
    const pin = String(getPin() || '');
    const ok = !!pin && given.length === pin.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(pin));
    if (ok) fails.delete(ip);
    else { rec.n += 1; if (rec.n >= 8) { rec.n = 0; rec.until = Date.now() + 60000; } fails.set(ip, rec); }
    return ok;
  }

  const send = (res, code, body, type = 'text/plain; charset=utf-8', extra = {}) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
    res.end(body);
  };
  const json = (res, code, obj) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');

  function handler(req, res) {
    if (!hostOk(req)) return send(res, 403, 'Host tidak diizinkan');
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    if (req.method === 'GET' && p === '/') return send(res, 302, '', 'text/plain', { Location: '/remote' });

    if (req.method === 'GET' && STATIC[p]) {
      const [file, type] = STATIC[p];
      return fs.readFile(path.join(rendererDir, file), (err, data) => (err ? send(res, 404, 'Berkas tidak ada') : send(res, 200, data, type)));
    }

    if (req.method === 'GET' && p === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 1500\n\n');
      res.write(`data: ${JSON.stringify(publicSnapshot(getSnapshot()))}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return undefined;
    }

    if (req.method === 'GET' && p === '/api/auth') {
      return json(res, 200, { local: isLocalReq(req), ok: pinOk(req, url) });
    }

    if (req.method === 'POST' && p === '/api/command') {
      if (!originOk(req)) return json(res, 403, { error: 'origin' });
      let body = '';
      let tooBig = false;
      req.on('data', (c) => { body += c; if (body.length > 4096) { tooBig = true; req.destroy(); } });
      req.on('end', () => {
        if (tooBig) return undefined;
        if (!pinOk(req, url)) return json(res, 401, { error: 'pin' });
        let cmd = null;
        try { cmd = sanitizeCommand(JSON.parse(body)); } catch { cmd = null; }
        if (!cmd) return json(res, 400, { error: 'perintah tidak valid' });
        runCommand(cmd);
        return json(res, 200, { ok: true });
      });
      return undefined;
    }

    return send(res, 404, 'Tidak ditemukan');
  }

  function listen(port, lan) {
    return new Promise((resolve, reject) => {
      const s = http.createServer(handler);
      s.once('error', reject);
      s.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
        s.removeListener('error', reject);
        s.on('error', () => {});
        server = s;
        resolve();
      });
    });
  }

  async function start(port, lan) {
    await stop();
    for (let i = 0; i < 20; i += 1) {
      const p = Number(port) + i;
      try {
        await listen(p, lan);
        heartbeat = setInterval(() => clients.forEach((c) => { try { c.write(': ping\n\n'); } catch {} }), 15000);
        status = { running: true, port: p, lan: !!lan, error: i ? `Port ${port} dipakai aplikasi lain, memakai ${p}.` : '' };
        return status;
      } catch (e) {
        if (e.code !== 'EADDRINUSE') { status = { running: false, port: 0, lan: !!lan, error: String(e.message) }; return status; }
      }
    }
    status = { running: false, port: 0, lan: !!lan, error: 'Tidak ada port yang kosong.' };
    return status;
  }

  function stop() {
    clearInterval(heartbeat);
    heartbeat = null;
    clients.forEach((c) => { try { c.end(); } catch {} });
    clients.clear();
    return new Promise((resolve) => {
      if (!server) return resolve();
      const s = server;
      server = null;
      s.close(() => resolve());
      if (s.closeAllConnections) s.closeAllConnections();
      return undefined;
    }).then(() => { status = { ...status, running: false }; });
  }

  // Kirim state terbaru ke semua halaman yang terhubung.
  function push(snapshot) {
    if (!clients.size) return;
    const data = `data: ${JSON.stringify(publicSnapshot(snapshot))}\n\n`;
    clients.forEach((c) => { try { c.write(data); } catch { clients.delete(c); } });
  }

  return { start, stop, push, status: () => ({ ...status }), clientCount: () => clients.size };
}

module.exports = { createServer, lanAddresses, sanitizeCommand, publicSnapshot };
