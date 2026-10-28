const { app, BrowserWindow, ipcMain, screen, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Engine } = require('./engine');
const H = require('./hotkeys');
const crypto = require('crypto');
const { createServer, lanAddresses } = require('./server');
let QRCode = null;
try { QRCode = require('qrcode'); } catch { /* opsional: tanpa paket ini QR tidak tampil, URL tetap ada */ }

let controlWin = null;
let engine = null;
let saveTimer = null;
const outputs = [];            // [{ win, key: 'ALL' | 'A' | 'B', frameless, full, prev }]
let lastOutputOpts = {};
let outputIsTransparent = false;
let outputOnTop = false;
let lastHotkeyFailed = [];
let web = null;               // server lokal (OBS Browser Source + remote HP)

const configPath = () => path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return null; }
}
function saveConfigSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(configPath(), JSON.stringify(engine.persistable(), null, 2)); } catch {}
  }, 400);
}

function broadcast() {
  const snap = engine.snapshot();
  const wins = [controlWin, ...outputs.map((o) => o.win)];
  wins.forEach((w) => { if (w && !w.isDestroyed()) w.webContents.send('state', snap); });
  if (web) web.push(snap);
}

// ---------- Server lokal ----------
async function applyServer() {
  const s = engine.state.settings;
  if (!web) return;
  if (!s.serverEnabled) { await web.stop(); return; }
  if (!/^\d{6}$/.test(String(s.serverPin || ''))) {
    engine.command({ type: 'settings', patch: { serverPin: String(crypto.randomInt(100000, 1000000)) } });
    saveConfigSoon();
  }
  await web.start(s.serverPort, s.serverLan);
}

async function serverInfo() {
  const s = engine.state.settings;
  const st = web ? web.status() : { running: false, port: 0, lan: false, error: '' };
  const hosts = st.lan ? lanAddresses().map((a) => a.address) : [];
  const local = st.running ? `http://localhost:${st.port}` : '';
  const phone = st.running && hosts[0] ? `http://${hosts[0]}:${st.port}/remote` : '';
  let qr = '';
  if (phone && QRCode) { try { qr = await QRCode.toDataURL(phone, { margin: 1, width: 180 }); } catch {} }
  return {
    running: st.running, port: st.port, lan: st.lan, error: st.error, pin: s.serverPin,
    clients: web ? web.clientCount() : 0,
    obs: local ? { all: `${local}/output`, a: `${local}/output?timer=A`, b: `${local}/output?timer=B` } : null,
    phone, hosts, qr,
  };
}

function createControl() {
  controlWin = new BrowserWindow({
    width: 1100, height: 780, minWidth: 900, minHeight: 640,
    title: 'Timekeeper - Kontrol',
    backgroundColor: '#fdf6ff',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  controlWin.setMenuBarVisibility(false);
  controlWin.loadFile('renderer/control.html');
  controlWin.on('closed', () => { controlWin = null; closeOutputs(); app.quit(); });
}

function notifyOutput(open) {
  if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('output-status', open);
}

function findDisplay(id) {
  return screen.getAllDisplays().find((d) => d.id === id) || screen.getPrimaryDisplay();
}

// Membuka 1 jendela output (gabungan) atau 2 jendela (Timer A dan Timer B terpisah).
function openOutput(opts = {}) {
  closeOutputs(false);
  const { mode = 'window', layout = 'combined', displayId, displayIdB } = opts;
  lastOutputOpts = opts;
  const s = engine.state.settings;
  const transparent = s.bg === 'transparent';
  outputIsTransparent = transparent;

  const jobs = layout === 'split'
    ? [{ key: 'A', displayId }].concat(s.dual ? [{ key: 'B', displayId: displayIdB ?? displayId }] : [])
    : [{ key: 'ALL', displayId }];
  const sameDisplay = jobs.length === 2 && jobs[0].displayId === jobs[1].displayId;

  jobs.forEach((job, i) => createOutputWindow(job, i, jobs.length, sameDisplay, mode, transparent));
  notifyOutput(true);
  notifyInfo();
}

function createOutputWindow(job, index, total, sameDisplay, mode, transparent) {
  const fullscreen = mode === 'fullscreen';
  const b = findDisplay(job.displayId).bounds;
  const frameless = fullscreen || transparent;

  const size = job.key === 'ALL' ? { width: 800, height: 450 } : { width: 560, height: 315 };
  const windowedGeo = { x: b.x + 120 + index * 80, y: b.y + 120 + index * 80, ...size };
  let geo;
  if (fullscreen) {
    // Dua timer di monitor yang sama: A di separuh kiri, B di separuh kanan.
    geo = total === 2 && sameDisplay
      ? { x: b.x + index * Math.floor(b.width / 2), y: b.y, width: Math.floor(b.width / 2), height: b.height }
      : { x: b.x, y: b.y, width: b.width, height: b.height };
  } else {
    geo = windowedGeo;
  }

  const win = new BrowserWindow({
    ...geo,
    frame: !frameless,
    transparent,
    backgroundColor: transparent ? '#00000000' : '#000000',
    hasShadow: !frameless,
    resizable: !fullscreen && !transparent,
    skipTaskbar: false,
    title: job.key === 'ALL' ? 'Timekeeper - Output' : `Timekeeper - Output Timer ${job.key}`,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  // Judul jendela dikunci supaya tiap output punya nama beda (OBS memilih jendela berdasarkan nama).
  win.on('page-title-updated', (e) => e.preventDefault());
  const entry = { win, key: job.key, frameless, full: fullscreen, prev: windowedGeo };
  outputs.push(entry);
  if (outputOnTop) win.setAlwaysOnTop(true, 'screen-saver');
  // Layar penuh bawaan Windows (jendela berbingkai) bisa berubah lewat F11/Esc: ikuti statusnya.
  win.on('enter-full-screen', () => { entry.full = true; sendFs(entry); notifyInfo(); });
  win.on('leave-full-screen', () => { entry.full = false; sendFs(entry); notifyInfo(); });
  win.setMenuBarVisibility(false);
  win.loadFile('renderer/output.html', { query: { mode, timer: job.key, frameless: frameless ? '1' : '0' } });
  win.on('closed', () => {
    const i = outputs.findIndex((o) => o.win === win);
    if (i >= 0) {
      outputs.splice(i, 1);
      if (outputs.length === 0) notifyOutput(false);
    }
  });
}

function sendFs(o) {
  if (!o.win.isDestroyed()) o.win.webContents.send('output-fs', o.full);
}

function notifyInfo() {
  if (controlWin && !controlWin.isDestroyed()) {
    controlWin.webContents.send('output-info', { fullscreen: outputs.length ? outputs[0].full : false, onTop: outputOnTop });
  }
}

// Layar penuh / keluar layar penuh untuk semua jendela output yang terbuka.
function setOutputFullscreen(on) {
  outputs.forEach((o) => {
    if (o.win.isDestroyed() || o.full === on) return;
    if (o.frameless) {
      if (on) {
        o.prev = o.win.getBounds();
        o.win.setBounds(screen.getDisplayMatching(o.prev).bounds);
      } else if (o.prev) {
        o.win.setBounds(o.prev);
      }
      o.full = on;
      sendFs(o);
    } else {
      o.win.setFullScreen(on); // statusnya diperbarui lewat event enter/leave-full-screen
    }
  });
  notifyInfo();
}

function closeOutputs(notify = true) {
  const list = outputs.splice(0, outputs.length);
  list.forEach((o) => { if (!o.win.isDestroyed()) o.win.close(); });
  if (notify) notifyOutput(false);
}

// ---------- Hotkey global ----------
function runAction(id) {
  const a = H.ACTIONS.find((x) => x.id === id);
  if (!a) return;
  if (a.special === 'fullscreen') setOutputFullscreen(!(outputs[0] && outputs[0].full));
  else { engine.command(a.cmd); broadcast(); }
}

// Mendaftarkan ulang semua hotkey global sesuai pengaturan. Hotkey tanpa Ctrl/Alt/Shift
// (selain F1-F24) tidak pernah dijadikan global supaya tidak mengganggu aplikasi lain.
function registerGlobalHotkeys() {
  globalShortcut.unregisterAll();
  lastHotkeyFailed = [];
  const s = engine.state.settings;
  if (s.hotkeyGlobal) {
    const map = H.effective(s.hotkeys);
    for (const a of H.ACTIONS) {
      const acc = map[a.id];
      if (!acc || !H.isGlobalEligible(acc)) continue;
      let ok = false;
      try { ok = globalShortcut.register(H.toElectron(acc), () => runAction(a.id)); } catch { ok = false; }
      if (!ok) lastHotkeyFailed.push(a.id);
    }
  }
  sendHotkeyStatus(controlWin);
}
function sendHotkeyStatus(win) {
  if (win && !win.isDestroyed()) win.webContents.send('hotkey-status', { failed: lastHotkeyFailed });
}

// ---------- Suara alarm milik pengguna ----------
const soundsDir = () => path.join(app.getPath('userData'), 'sounds');
const SOUND_EXT = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];

function patchSettings(patch) {
  engine.command({ type: 'settings', patch });
  saveConfigSoon();
  broadcast();
}

app.whenReady().then(() => {
  engine = new Engine(
    loadConfig(),
    (id) => { if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('finished', id); },
    (id, sec) => { if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('countdown', { id, sec }); },
  );

  ipcMain.on('command', (_e, cmd) => {
    engine.command(cmd);
    if (cmd.type === 'settings' && ('hotkeys' in cmd.patch || 'hotkeyGlobal' in cmd.patch)) registerGlobalHotkeys();
    // Jenis jendela berubah (transparan <-> biasa) atau jumlah timer berubah saat tata letak terpisah:
    // jendela output dibuat ulang.
    if (cmd.type === 'settings' && outputs.length) {
      const transparentChanged = 'bg' in cmd.patch && (engine.state.settings.bg === 'transparent') !== outputIsTransparent;
      const dualChanged = 'dual' in cmd.patch && lastOutputOpts.layout === 'split';
      if (transparentChanged || dualChanged) openOutput(lastOutputOpts);
    }
    if (cmd.type === 'setDuration' || cmd.type === 'setLabel' || cmd.type === 'settings') saveConfigSoon();
    if (cmd.type === 'settings' && ['serverEnabled', 'serverPort', 'serverLan'].some((k) => k in cmd.patch)) {
      applyServer().then(() => { if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('server-changed'); });
    }
    broadcast();
  });
  ipcMain.handle('server:info', () => serverInfo());
  ipcMain.handle('server:newpin', () => {
    patchSettings({ serverPin: String(crypto.randomInt(100000, 1000000)) });
    return true;
  });
  ipcMain.on('request-state', (e) => {
    e.sender.send('state', engine.snapshot());
    sendHotkeyStatus(e.sender === (controlWin && controlWin.webContents) ? controlWin : null);
  });

  // Tambah suara: pilih file, salin ke penyimpanan aplikasi (tetap ada walau file asli dipindah).
  ipcMain.handle('sound:add', async () => {
    const r = await dialog.showOpenDialog(controlWin, {
      title: 'Pilih file suara alarm',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: SOUND_EXT.map((x) => x.slice(1)) }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const src = r.filePaths[0];
    const ext = path.extname(src).toLowerCase();
    if (!SOUND_EXT.includes(ext)) return { error: 'Format tidak didukung. Pakai mp3, wav, ogg, m4a, aac, atau flac.' };
    if (fs.statSync(src).size > 15 * 1024 * 1024) return { error: 'File terlalu besar (maksimal 15 MB).' };
    const id = 'snd' + Date.now().toString(36);
    const file = id + ext;
    fs.mkdirSync(soundsDir(), { recursive: true });
    fs.copyFileSync(src, path.join(soundsDir(), file));
    const item = { id, name: path.basename(src, ext).slice(0, 40), file };
    patchSettings({ customSounds: [...engine.state.settings.customSounds, item] });
    return item;
  });
  // Nama berkas selalu diambil dari daftar di pengaturan, bukan dari kiriman jendela.
  ipcMain.handle('sound:read', (_e, id) => {
    const it = engine.state.settings.customSounds.find((x) => x.id === id);
    if (!it) return null;
    try { return fs.readFileSync(path.join(soundsDir(), path.basename(it.file))); } catch { return null; }
  });
  ipcMain.handle('sound:remove', (_e, id) => {
    const s = engine.state.settings;
    const it = s.customSounds.find((x) => x.id === id);
    if (!it) return false;
    try { fs.unlinkSync(path.join(soundsDir(), path.basename(it.file))); } catch {}
    const patch = { customSounds: s.customSounds.filter((x) => x.id !== id) };
    if (s.alarmType === 'custom:' + id) patch.alarmType = 'bel';
    patchSettings(patch);
    return true;
  });
  ipcMain.handle('get-displays', () =>
    screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      name: `Monitor ${i + 1} (${d.bounds.width}x${d.bounds.height})${d.id === screen.getPrimaryDisplay().id ? ' - utama' : ''}`,
    })));
  ipcMain.on('output-ctl', (_e, ctl) => {
    if (ctl.type === 'fullscreen') {
      const target = ctl.value === 'toggle' ? !(outputs[0] && outputs[0].full) : !!ctl.value;
      setOutputFullscreen(target);
    } else if (ctl.type === 'onTop') {
      outputOnTop = !!ctl.value;
      outputs.forEach((o) => { if (!o.win.isDestroyed()) o.win.setAlwaysOnTop(outputOnTop, 'screen-saver'); });
      notifyInfo();
    }
  });
  ipcMain.on('output', (_e, opts) => (opts.action === 'open' ? openOutput(opts) : closeOutputs()));

  // Monitor dicolok / dicabut / berubah resolusi: kabari jendela kontrol supaya daftar diperbarui.
  const displaysChanged = () => {
    if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('displays-changed');
  };
  ['display-added', 'display-removed', 'display-metrics-changed'].forEach((ev) => screen.on(ev, displaysChanged));

  web = createServer({
    rendererDir: path.join(__dirname, 'renderer'),
    getSnapshot: () => engine.snapshot(),
    getPin: () => engine.state.settings.serverPin,
    runCommand: (cmd) => { engine.command(cmd); broadcast(); },
  });
  applyServer().then(() => { if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('server-changed'); });

  createControl();
  registerGlobalHotkeys();
  setInterval(() => { if (engine.tick()) broadcast(); }, 100);
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); if (web) web.stop(); });
app.on('window-all-closed', () => app.quit());
