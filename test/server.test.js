const assert = require('assert');
const http = require('http');
const path = require('path');
const { Engine } = require('../engine');
const { createServer, sanitizeCommand, publicSnapshot } = require('../server');

// ---- fungsi murni ----
assert.deepStrictEqual(sanitizeCommand({ type: 'toggle', id: 'A' }), { type: 'toggle', id: 'A' });
assert.strictEqual(sanitizeCommand({ type: 'settings', id: 'A', patch: {} }), null);        // pengaturan tidak boleh dari luar
assert.strictEqual(sanitizeCommand({ type: 'toggle', id: 'Z' }), null);
assert.strictEqual(sanitizeCommand({ type: 'adjust', id: 'A', ms: 'x' }), null);
assert.strictEqual(sanitizeCommand({ type: 'adjust', id: 'A', ms: 1e12 }).ms, 3600000);      // dibatasi
assert.strictEqual(sanitizeCommand({ type: 'segSelect', id: 'ALL', index: 1 }), null);
assert.deepStrictEqual(sanitizeCommand({ type: 'segSelect', id: 'A', index: 2, ekstra: 1 }), { type: 'segSelect', id: 'A', index: 2 });
const snap = new Engine(null).snapshot();
snap.settings.serverPin = '9999';
const pub = publicSnapshot(snap);
assert.ok(!('serverPin' in pub.settings) && !('customSounds' in pub.settings) && !('hotkeys' in pub.settings));
assert.ok('textColor' in pub.settings);

// ---- server sungguhan ----
const req = (port, { method = 'GET', url = '/', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, method, path: url, headers }, (res) => {
    let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, body: d, headers: res.headers }));
  });
  r.on('error', reject);
  if (body) r.write(body);
  r.end();
});

(async () => {
  const engine = new Engine(null);
  engine.state.settings.serverPin = '4321';
  let remote = false;
  const srv = createServer({
    rendererDir: path.join(__dirname, '..', 'renderer'),
    getSnapshot: () => engine.snapshot(),
    getPin: () => engine.state.settings.serverPin,
    runCommand: (c) => engine.command(c),
    isLocal: () => !remote,
  });
  const st = await srv.start(47770, false);
  assert.ok(st.running);
  const port = st.port;
  const J = { 'content-type': 'application/json' };

  // halaman statis
  let r = await req(port, { url: '/output' });
  assert.strictEqual(r.status, 200); assert.ok(r.body.includes('id="stage"'));
  r = await req(port, { url: '/remote' }); assert.strictEqual(r.status, 200);
  r = await req(port, { url: '/../main.js' }); assert.strictEqual(r.status, 404);          // tidak bisa keluar dari daftar putih
  r = await req(port, { url: '/server.js' }); assert.strictEqual(r.status, 404);

  // perlindungan host & origin
  r = await req(port, { url: '/output', headers: { host: 'evil.example.com' } }); assert.strictEqual(r.status, 403);
  r = await req(port, { method: 'POST', url: '/api/command', headers: { ...J, origin: 'http://evil.example.com' }, body: '{"type":"toggle","id":"A"}' });
  assert.strictEqual(r.status, 403); assert.ok(!engine.timer('A').running);

  // perintah dari localhost (tanpa PIN)
  r = await req(port, { method: 'POST', url: '/api/command', headers: J, body: '{"type":"toggle","id":"A"}' });
  assert.strictEqual(r.status, 200); assert.ok(engine.timer('A').running);
  r = await req(port, { method: 'POST', url: '/api/command', headers: J, body: '{"type":"settings","patch":{"serverPin":"1"}}' });
  assert.strictEqual(r.status, 400); assert.strictEqual(engine.state.settings.serverPin, '4321');
  r = await req(port, { method: 'POST', url: '/api/command', headers: J, body: 'bukan json' }); assert.strictEqual(r.status, 400);

  // dari perangkat lain: wajib PIN, salah berkali-kali = dikunci
  remote = true;
  r = await req(port, { url: '/api/auth' }); assert.deepStrictEqual(JSON.parse(r.body), { local: false, ok: false });
  r = await req(port, { method: 'POST', url: '/api/command', headers: { ...J, 'x-pin': '0000' }, body: '{"type":"toggle","id":"B"}' });
  assert.strictEqual(r.status, 401); assert.ok(!engine.timer('B').running);
  r = await req(port, { method: 'POST', url: '/api/command', headers: { ...J, 'x-pin': '4321' }, body: '{"type":"toggle","id":"B"}' });
  assert.strictEqual(r.status, 200); assert.ok(engine.timer('B').running);
  for (let i = 0; i < 8; i += 1) await req(port, { method: 'POST', url: '/api/command', headers: { ...J, 'x-pin': 'salah' }, body: '{"type":"toggle","id":"B"}' });
  r = await req(port, { method: 'POST', url: '/api/command', headers: { ...J, 'x-pin': '4321' }, body: '{"type":"toggle","id":"B"}' });
  assert.strictEqual(r.status, 401);                                                       // PIN benar pun ditolak saat terkunci
  remote = false;

  // aliran state (SSE): isi awal + dorongan baru, tanpa PIN
  const got = [];
  await new Promise((resolve) => {
    const r2 = http.request({ host: '127.0.0.1', port, path: '/events' }, (res) => {
      assert.strictEqual(res.headers['content-type'], 'text/event-stream');
      res.on('data', (c) => {
        String(c).split('\n').filter((l) => l.startsWith('data: ')).forEach((l) => got.push(JSON.parse(l.slice(6))));
        if (got.length === 1) { engine.command({ type: 'setLabel', id: 'A', label: 'Paslon 1' }); srv.push(engine.snapshot()); }
        if (got.length === 2) { r2.destroy(); resolve(); }
      });
    });
    r2.end();
  });
  assert.strictEqual(got[0].timers.length, 2);
  assert.ok(!('serverPin' in got[0].settings));
  assert.strictEqual(got[1].timers[0].label, 'Paslon 1');

  // port bentrok: pindah ke port berikutnya
  const srv2 = createServer({ rendererDir: '.', getSnapshot: () => engine.snapshot(), getPin: () => '', runCommand() {} });
  const st2 = await srv2.start(port, false);
  assert.ok(st2.running && st2.port === port + 1 && st2.error);
  await srv2.stop();
  await srv.stop();
  console.log('Tes server lolos');
})().catch((e) => { console.error(e); process.exit(1); });
