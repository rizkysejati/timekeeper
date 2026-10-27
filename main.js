const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { Engine } = require('./engine');

let controlWin = null;
let engine = null;
let saveTimer = null;
const outputs = [];            // [{ win, key: 'ALL' | 'A' | 'B', frameless, full, prev }]
let lastOutputOpts = {};
let outputIsTransparent = false;
let outputOnTop = false;

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

app.whenReady().then(() => {
  engine = new Engine(
    loadConfig(),
    (id) => { if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('finished', id); },
    (id, sec) => { if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send('countdown', { id, sec }); },
  );

  ipcMain.on('command', (_e, cmd) => {
    engine.command(cmd);
    // Jenis jendela berubah (transparan <-> biasa) atau jumlah timer berubah saat tata letak terpisah:
    // jendela output dibuat ulang.
    if (cmd.type === 'settings' && outputs.length) {
      const transparentChanged = 'bg' in cmd.patch && (engine.state.settings.bg === 'transparent') !== outputIsTransparent;
      const dualChanged = 'dual' in cmd.patch && lastOutputOpts.layout === 'split';
      if (transparentChanged || dualChanged) openOutput(lastOutputOpts);
    }
    if (cmd.type === 'setDuration' || cmd.type === 'setLabel' || cmd.type === 'settings') saveConfigSoon();
    broadcast();
  });
  ipcMain.on('request-state', (e) => e.sender.send('state', engine.snapshot()));
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

  createControl();
  setInterval(() => { if (engine.tick()) broadcast(); }, 100);
});

app.on('window-all-closed', () => app.quit());
