const $ = (id) => document.getElementById(id);
const send = (cmd) => window.api.command(cmd);
let current = null;
let outputOpen = false;

// ---------- Suara alarm (dibuat dengan Web Audio, tanpa file) ----------
let audioCtx = null;
function tone(freq, start, dur, vol, type = 'sine', decay = true) {
  const ctx = (audioCtx = audioCtx || new AudioContext());
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  g.gain.setValueAtTime(vol, t0);
  if (decay) g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  else g.gain.setValueAtTime(vol, t0 + dur - 0.02), g.gain.linearRampToValueAtTime(0, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function playTick(sec, volume) {
  const v = Math.max(0.01, volume);
  // tik pendek; 3 detik terakhir lebih tinggi supaya terasa mendesak
  tone(sec <= 3 ? 1500 : 1000, 0, 0.12, v, 'square', false);
}
// ---- Suara dari file milik pengguna ----
const soundCache = new Map();   // id -> AudioBuffer
let currentAlarmSource = null;
async function loadCustom(id) {
  if (soundCache.has(id)) return soundCache.get(id);
  const ctx = (audioCtx = audioCtx || new AudioContext());
  const data = await window.api.readSound(id);
  if (!data) return null;
  const buf = await ctx.decodeAudioData(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  soundCache.set(id, buf);
  return buf;
}
async function playCustom(id, volume, maxSec) {
  try {
    const buf = await loadCustom(id);
    if (!buf) return setSoundMsg('File suara tidak ditemukan.', true);
    const ctx = audioCtx;
    if (currentAlarmSource) { try { currentAlarmSource.stop(); } catch {} }
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    g.gain.value = Math.max(0.01, volume);
    src.buffer = buf;
    src.connect(g).connect(ctx.destination);
    src.start();
    if (maxSec > 0 && buf.duration > maxSec) { // potong dengan fade singkat
      g.gain.setValueAtTime(Math.max(0.01, volume), ctx.currentTime + Math.max(0, maxSec - 0.3));
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + maxSec);
      src.stop(ctx.currentTime + maxSec);
    }
    currentAlarmSource = src;
    setSoundMsg('');
  } catch (err) {
    setSoundMsg('File suara tidak bisa diputar (format rusak atau tidak didukung).', true);
  }
}
function setSoundMsg(text, warn) {
  const m = $('soundMsg');
  m.textContent = text;
  m.className = 'hint' + (warn ? ' hkmsg-warn' : '');
}

function playAlarm(type, volume) {
  if (type === 'off') return;
  if (type.startsWith('custom:')) return playCustom(type.slice(7), volume, current ? Number(current.settings.alarmMaxSec) || 0 : 0);
  const v = Math.max(0.01, volume);
  if (type === 'bel') { tone(880, 0, 1.6, v); tone(1760, 0, 1.2, v * 0.4); tone(880, 1.2, 1.6, v * 0.8); }
  if (type === 'beep') { for (let i = 0; i < 3; i++) tone(1000, i * 0.35, 0.22, v, 'square', false); }
  if (type === 'buzzer') { tone(180, 0, 1.4, v, 'sawtooth', false); }
}

// ---------- Kartu timer ----------
function buildTimerCards() {
  const wrap = $('timers');
  wrap.innerHTML = current.timers.map((t) => `
    <div class="tcard" data-id="${t.id}">
      <input class="tlabel" type="text" value="${t.label}" />
      <select class="tmode">
        <option value="down">Hitung mundur</option>
        <option value="up">Hitung maju (stopwatch)</option>
        <option value="clock">Jam digital</option>
      </select>
      <div class="tdisplay">--:--</div>
      <div class="dur">
        Durasi
        <input type="number" class="dm" min="0" max="999" /> menit
        <input type="number" class="ds" min="0" max="59" /> detik
        <button class="btn sm setdur">Atur</button>
      </div>
      <div class="btns">
        <button class="btn go toggle">▶ Mulai</button>
        <button class="btn reset">↺ Reset</button>
        <button class="btn sm" data-adj="-10000">-10s</button>
        <button class="btn sm" data-adj="10000">+10s</button>
        <button class="btn sm" data-adj="60000">+1m</button>
      </div>
      <details class="segs">
        <summary>Rundown segmen <span class="segcount"></span></summary>
        <div class="seglist"></div>
        <div class="segbtns">
          <button class="btn sm segadd">+ Tambah segmen</button>
          <button class="btn sm segprev">&#9664; Sebelumnya</button>
          <button class="btn sm segnext">Berikutnya &#9654;</button>
          <button class="btn sm segcopy"></button>
        </div>
      </details>
    </div>`).join('');

  wrap.querySelectorAll('.tcard').forEach((card) => {
    const id = card.dataset.id;
    const t = current.timers.find((x) => x.id === id);
    card.querySelector('.dm').value = Math.floor(t.duration / 60000);
    card.querySelector('.ds').value = Math.floor((t.duration % 60000) / 1000);
    card.querySelector('.tmode').value = t.mode || 'down';
    card.querySelector('.tmode').addEventListener('change', (e) => send({ type: 'setMode', id, mode: e.target.value }));
    card.querySelector('.tlabel').addEventListener('input', (e) => send({ type: 'setLabel', id, label: e.target.value }));
    card.querySelector('.toggle').addEventListener('click', () => send({ type: 'toggle', id }));
    card.querySelector('.reset').addEventListener('click', () => send({ type: 'reset', id }));
    card.querySelector('.setdur').addEventListener('click', () => {
      const m = Number(card.querySelector('.dm').value) || 0;
      const s = Number(card.querySelector('.ds').value) || 0;
      send({ type: 'setDuration', id, ms: (m * 60 + s) * 1000 });
    });
    card.querySelector('.segadd').addEventListener('click', () => {
      const m = Number(card.querySelector('.dm').value) || 0;
      const sc = Number(card.querySelector('.ds').value) || 0;
      send({ type: 'segAdd', id, ms: Math.max(1, m * 60 + sc) * 1000 }); // memakai durasi di kolom Durasi
    });
    card.querySelector('.segprev').addEventListener('click', () => send({ type: 'segPrev', id }));
    card.querySelector('.segnext').addEventListener('click', () => send({ type: 'segNext', id }));
    const other = id === 'A' ? 'B' : 'A';
    const cp = card.querySelector('.segcopy');
    cp.textContent = `Salin ke Timer ${other}`;
    cp.addEventListener('click', () => send({ type: 'segCopy', from: id, to: other }));
    card.querySelectorAll('[data-adj]').forEach((b) =>
      b.addEventListener('click', () => send({ type: 'adjust', id, ms: Number(b.dataset.adj) })));
  });
}

function fmt(ms) {
  // Sisa waktu dibulatkan ke atas; lembur (ms negatif) tampil -00:05 dst.
  const over = ms < 0;
  const total = over ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
  const p = (n) => String(n).padStart(2, '0');
  const body = h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
  return over && total > 0 ? `-${body}` : body;
}

// ---------- Daftar segmen (dibangun ulang hanya saat isinya berubah) ----------
function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  kids.forEach((k) => e.append(k));
  return e;
}
function renderSegments(card, t) {
  const sig = JSON.stringify([t.segments, t.segIndex]);
  if (card.dataset.sig === sig) return;
  card.dataset.sig = sig;
  const id = t.id;
  const list = card.querySelector('.seglist');
  list.replaceChildren();
  card.querySelector('.segcount').textContent = t.segCount ? `(${t.segIndex + 1} dari ${t.segCount})` : '(kosong)';
  if (!t.segCount) list.append(el('div', { className: 'segempty', textContent: 'Belum ada segmen. Isi Durasi di atas lalu klik "+ Tambah segmen".' }));
  t.segments.forEach((sg, i) => {
    const name = el('input', { type: 'text', value: sg.name });
    const mi = el('input', { type: 'number', min: 0, max: 999, value: Math.floor(sg.duration / 60000) });
    const se = el('input', { type: 'number', min: 0, max: 59, value: Math.floor((sg.duration % 60000) / 1000) });
    const upd = () => send({ type: 'segUpdate', id, index: i, name: name.value, ms: Math.max(1, (Number(mi.value) || 0) * 60 + (Number(se.value) || 0)) * 1000 });
    [name, mi, se].forEach((x) => x.addEventListener('change', upd));
    const pick = el('button', { className: 'btn sm', title: 'Pakai segmen ini', textContent: i === t.segIndex ? '\u25B6' : String(i + 1) });
    pick.addEventListener('click', () => send({ type: 'segSelect', id, index: i }));
    const up = el('button', { className: 'btn sm', title: 'Naik', textContent: '\u25B2', disabled: i === 0 });
    const dn = el('button', { className: 'btn sm', title: 'Turun', textContent: '\u25BC', disabled: i === t.segCount - 1 });
    const rm = el('button', { className: 'btn sm', title: 'Hapus', textContent: '\u2715' });
    up.addEventListener('click', () => send({ type: 'segMove', id, index: i, dir: -1 }));
    dn.addEventListener('click', () => send({ type: 'segMove', id, index: i, dir: 1 }));
    rm.addEventListener('click', () => send({ type: 'segRemove', id, index: i }));
    list.append(el('div', { className: 'segrow' + (i === t.segIndex ? ' active' : '') },
      pick, name, mi, el('span', { textContent: ':' }), se, el('div', { className: 'mini' }, up, dn, rm)));
  });
}

// ---------- Update tampilan saat state berubah ----------
const settingIds = ['bg', 'bgColor', 'textColor', 'fontFamily', 'fontCustom', 'warn1Color', 'warn2Color', 'alarmType', 'autoAdvance'];
const numIds = ['fontScale', 'fontWeight', 'warn1At', 'warn2At', 'alarmVolume', 'countdownFrom', 'alarmMaxSec'];
const boolIds = ['dual', 'showLabel', 'showSegment', 'warnEnabled', 'overtime', 'hotkeyGlobal', 'clock24', 'clockSeconds'];

function updateUI(state) {
  const first = !current;
  current = state;
  const s = state.settings;

  if (first) {
    buildTimerCards();
    settingIds.forEach((id) => { $(id).value = s[id]; });
    numIds.forEach((id) => { $(id).value = s[id]; });
    boolIds.forEach((id) => { $(id).checked = s[id]; });
  }

  refreshAlarmOptions(s);
  renderHotkeys(s);
  $('timers').classList.toggle('single', !s.dual);
  document.querySelectorAll('.tcard').forEach((card) => {
    const t = state.timers.find((x) => x.id === card.dataset.id);
    const hidden = !s.dual && t.id !== 'A';
    card.style.display = hidden ? 'none' : '';
    card.classList.toggle('running', t.running);
    card.classList.toggle('finished', t.finished);
    const disp = card.querySelector('.tdisplay');
    disp.textContent = TF.text(t, s);
    disp.classList.toggle('over', t.mode === 'down' && t.remaining < 0);
    const tm = card.querySelector('.tmode');
    if (document.activeElement !== tm) tm.value = t.mode || 'down';
    card.querySelector('.dur').style.display = t.mode === 'down' ? '' : 'none';
    card.querySelector('.segs').style.display = t.mode === 'down' ? '' : 'none';
    card.querySelector('.btns').style.display = t.mode === 'clock' ? 'none' : '';
    card.querySelectorAll('[data-adj]').forEach((b) => { b.style.display = t.mode === 'down' ? '' : 'none'; });
    // Kolom Durasi mengikuti durasi segmen yang dipilih (kecuali sedang diketik)
    if (card.dataset.dur !== String(t.duration) && !card.contains(document.activeElement && document.activeElement.closest('.dur'))) {
      card.dataset.dur = String(t.duration);
      card.querySelector('.dm').value = Math.floor(t.duration / 60000);
      card.querySelector('.ds').value = Math.floor((t.duration % 60000) / 1000);
    }
    renderSegments(card, t);
    const tg = card.querySelector('.toggle');
    tg.textContent = t.running ? '⏸ Jeda' : '▶ Mulai';
    tg.className = 'btn toggle ' + (t.running ? 'stop' : 'go');
  });
}

// ---------- Pilihan suara alarm (bawaan + milik pengguna) ----------
const BUILTIN_SOUNDS = [['bel', 'Bel'], ['beep', 'Beep'], ['buzzer', 'Buzzer'], ['off', 'Mati']];
function refreshAlarmOptions(s) {
  const sel = $('alarmType');
  const sig = JSON.stringify(s.customSounds);
  if (sel.dataset.sig !== sig) {
    sel.dataset.sig = sig;
    sel.replaceChildren(
      ...BUILTIN_SOUNDS.map(([v, n]) => el('option', { value: v, textContent: n })),
      ...s.customSounds.map((c) => el('option', { value: 'custom:' + c.id, textContent: 'File: ' + c.name })),
    );
    // Hapus dari cache suara yang sudah tidak ada
    [...soundCache.keys()].forEach((id) => { if (!s.customSounds.some((c) => c.id === id)) soundCache.delete(id); });
  }
  if (document.activeElement !== sel) sel.value = s.alarmType;
  const isCustom = s.alarmType.startsWith('custom:');
  $('soundRemove').disabled = !isCustom;
  if (isCustom) loadCustom(s.alarmType.slice(7)).catch(() => {}); // siapkan lebih awal supaya alarm tidak telat
}
$('soundAdd').addEventListener('click', async () => {
  const r = await window.api.addSound();
  if (!r) return;
  if (r.error) return setSoundMsg(r.error, true);
  setSoundMsg(`Ditambahkan: ${r.name}`);
  send({ type: 'settings', patch: { alarmType: 'custom:' + r.id } });
});
$('soundRemove').addEventListener('click', async () => {
  const v = $('alarmType').value;
  if (v.startsWith('custom:') && confirm('Hapus suara ini dari aplikasi?')) await window.api.removeSound(v.slice(7));
});

// ---------- Hotkey ----------
let recording = null;          // { id, btn } saat menunggu tombol baru
let hotkeyFailed = [];
window.api.onHotkeyStatus(({ failed }) => { hotkeyFailed = failed; if (current) renderHotkeys(current.settings, true); });

function hotkeyMap(s) { return Hotkeys.effective(s.hotkeys); }

function renderHotkeys(s, force) {
  const sig = JSON.stringify([s.hotkeys, s.hotkeyGlobal, hotkeyFailed, recording && recording.id]);
  const list = $('hotkeyList');
  if (!force && list.dataset.sig === sig) return;
  list.dataset.sig = sig;
  const map = hotkeyMap(s);
  list.replaceChildren();
  Hotkeys.ACTIONS.forEach((a) => {
    const acc = map[a.id];
    const isRec = recording && recording.id === a.id;
    const btn = el('button', { className: 'btn hk' + (isRec ? ' rec' : '') + (!acc && !isRec ? ' empty' : ''), textContent: isRec ? 'Tekan tombol...' : acc || '(kosong)', title: 'Klik untuk mengubah' });
    btn.addEventListener('click', () => { recording = { id: a.id }; renderHotkeys(current.settings, true); btn.blur(); });
    let tag = '';
    let cls = 'tag';
    if (acc) {
      const eligible = Hotkeys.isGlobalEligible(acc);
      if (s.hotkeyGlobal && eligible) { tag = hotkeyFailed.includes(a.id) ? 'global gagal (dipakai aplikasi lain)' : 'global aktif'; cls += hotkeyFailed.includes(a.id) ? ' fail' : ' ok'; }
      else tag = s.hotkeyGlobal && !eligible ? 'lokal saja (butuh Ctrl/Alt/Shift)' : 'saat jendela ini aktif';
    }
    list.append(el('div', { textContent: a.label }), btn, el('div', { className: cls, textContent: tag }));
  });
}
function saveHotkeys(map, note) {
  send({ type: 'settings', patch: { hotkeys: map } });
  $('hotkeyMsg').textContent = note || '';
}
$('hotkeyReset').addEventListener('click', () => { recording = null; saveHotkeys({ ...Hotkeys.DEFAULT_HOTKEYS }, 'Dikembalikan ke bawaan.'); });

// Tangkap tombol saat merekam (fase capture supaya mendahului penangan lain)
document.addEventListener('keydown', (e) => {
  if (!recording) return;
  e.preventDefault(); e.stopPropagation();
  const id = recording.id;
  const map = hotkeyMap(current.settings);
  if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) { recording = null; renderHotkeys(current.settings, true); return; }
  if (e.code === 'Backspace' || e.code === 'Delete') { recording = null; map[id] = ''; saveHotkeys(map, 'Dikosongkan.'); renderHotkeys(current.settings, true); return; }
  const acc = Hotkeys.fromKeyboardEvent(e);
  if (!acc) return; // hanya modifier / tombol tidak didukung: tunggu tombol berikutnya
  let note = '';
  for (const other of Hotkeys.ACTIONS) {
    if (other.id !== id && map[other.id] === acc) { map[other.id] = ''; note = `Pintasan ${acc} dipindah dari "${other.label}".`; }
  }
  map[id] = acc;
  recording = null;
  saveHotkeys(map, note);
  renderHotkeys(current.settings, true);
}, true);
document.addEventListener('click', (e) => {
  if (recording && !e.target.closest('.hk')) { recording = null; renderHotkeys(current.settings, true); }
});

// ---------- Pengaturan ----------
settingIds.forEach((id) => $(id).addEventListener('input', (e) => send({ type: 'settings', patch: { [id]: e.target.value } })));
numIds.forEach((id) => $(id).addEventListener('input', (e) => send({ type: 'settings', patch: { [id]: Number(e.target.value) } })));
boolIds.forEach((id) => $(id).addEventListener('change', (e) => send({ type: 'settings', patch: { [id]: e.target.checked } })));

$('countdownTest').addEventListener('click', () => {
  [3, 2, 1].forEach((n, i) => setTimeout(() => playTick(n, Number($('alarmVolume').value)), i * 1000));
});
$('alarmTest').addEventListener('click', () => playAlarm($('alarmType').value, Number($('alarmVolume').value)));

// ---------- Output ----------
async function loadDisplays() {
  const list = await window.api.getDisplays();
  const prevA = $('outDisplay').value, prevB = $('outDisplayB').value;
  const opts = list.map((d) => `<option value="${d.id}">${d.name}</option>`).join('');
  $('outDisplay').innerHTML = opts;
  $('outDisplayB').innerHTML = opts;
  const has = (v) => list.some((d) => String(d.id) === v);
  // Pilih monitor non-utama kalau ada (biasanya itu layar HDMI)
  const second = list.find((d) => !d.name.includes('utama'));
  const fallback = second ? String(second.id) : String(list[0].id);
  $('outDisplay').value = has(prevA) ? prevA : fallback;
  $('outDisplayB').value = has(prevB) ? prevB : fallback;
  $('displayInfo').textContent = `${list.length} monitor terdeteksi.`;
}
$('refreshDisplays').addEventListener('click', () => loadDisplays());
// Windows kadang butuh sekejap setelah kabel HDMI dicolok sebelum monitor siap dibaca.
window.api.onDisplaysChanged(() => { loadDisplays(); setTimeout(loadDisplays, 1000); });
// Baca ulang daftar monitor setiap jendela kontrol diaktifkan (mis. setelah colok monitor baru).
window.addEventListener('focus', loadDisplays);
$('outToggle').addEventListener('click', () => {
  if (outputOpen) window.api.output({ action: 'close' });
  else window.api.output({
    action: 'open', mode: $('outMode').value, layout: $('outLayout').value,
    displayId: Number($('outDisplay').value), displayIdB: Number($('outDisplayB').value),
  });
});
$('outLayout').addEventListener('change', () => {
  const split = $('outLayout').value === 'split';
  $('outDisplayBWrap').style.display = split ? '' : 'none';
  $('outDisplayLabel').textContent = split ? 'Monitor Timer A' : 'Monitor';
});
window.api.onOutputStatus((open) => {
  outputOpen = open;
  $('fsToggle').disabled = !open;
  $('onTop').disabled = !open;
  $('outToggle').textContent = open ? 'Tutup output' : 'Buka output';
  $('outToggle').className = 'btn ' + (open ? 'stop' : 'go');
});

$('fsToggle').addEventListener('click', () => window.api.outputCtl({ type: 'fullscreen', value: 'toggle' }));
$('onTop').addEventListener('change', (e) => window.api.outputCtl({ type: 'onTop', value: e.target.checked }));
window.api.onOutputInfo(({ fullscreen, onTop }) => {
  $('fsToggle').textContent = fullscreen ? '\u26F6 Keluar layar penuh' : '\u26F6 Layar penuh';
  $('onTop').checked = onTop;
});

// ---------- Tombol global + hotkey ----------
document.querySelectorAll('[data-cmd]').forEach((b) =>
  b.addEventListener('click', () => send({ type: b.dataset.cmd, id: b.dataset.id })));

let spaceHandled = false;
document.addEventListener('keydown', (e) => {
  if (recording || !current) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' && ['text', 'number'].includes(e.target.type)) return; // jangan ganggu saat mengetik
  if (tag === 'select') return;
  const acc = Hotkeys.fromKeyboardEvent(e);
  if (!acc) return;
  const st = current.settings;
  // Hotkey yang terdaftar global sudah ditangani proses utama; jangan jalankan dua kali.
  if (st.hotkeyGlobal && Hotkeys.isGlobalEligible(acc)) return;
  const map = hotkeyMap(st);
  const action = Hotkeys.ACTIONS.find((a) => map[a.id] === acc);
  if (!action) return;
  e.preventDefault();
  if (e.code === 'Space') spaceHandled = true;
  if (action.special === 'fullscreen') window.api.outputCtl({ type: 'fullscreen', value: 'toggle' });
  else send(action.cmd);
});
// Spasi di tombol/kotak centang memicu klik saat dilepas; cegah bila sudah dipakai sebagai hotkey.
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && spaceHandled) { e.preventDefault(); spaceHandled = false; }
});

window.api.onCountdown(({ sec }) => {
  if (current) playTick(sec, current.settings.alarmVolume);
});
window.api.onFinished(() => {
  if (current) playAlarm(current.settings.alarmType, current.settings.alarmVolume);
});
// Jam digital berjalan tanpa state baru dari mesin; segarkan tampilannya tiap 0,5 detik.
setInterval(() => {
  if (!current) return;
  document.querySelectorAll('.tcard').forEach((card) => {
    const t = current.timers.find((x) => x.id === card.dataset.id);
    if (t && t.mode === 'clock') card.querySelector('.tdisplay').textContent = TF.text(t, current.settings);
  });
}, 500);

// ---------- Server lokal ----------
function urlRow(name, url) {
  const copy = el('button', { className: 'btn sm', textContent: 'Salin' });
  copy.addEventListener('click', () => { navigator.clipboard.writeText(url).then(() => { copy.textContent = 'Tersalin'; setTimeout(() => { copy.textContent = 'Salin'; }, 1200); }, () => {}); });
  return el('div', { className: 'urlrow' }, el('span', { className: 'nm', textContent: name }), el('code', { textContent: url }), copy);
}
async function refreshServer() {
  if (!current) return;
  const s = current.settings;
  const info = await window.api.serverInfo();
  const msg = $('serverMsg');
  msg.className = 'hint' + (info.error ? ' warnmsg' : '');
  msg.textContent = !s.serverEnabled ? 'Server mati.'
    : info.error ? info.error
    : info.running ? `Server berjalan di port ${info.port}${info.lan ? ' (terbuka untuk jaringan lokal)' : ' (hanya komputer ini)'}.` : 'Server belum berjalan.';
  const box = $('serverUrls');
  box.replaceChildren();
  if (info.obs) {
    box.append(urlRow('Semua timer', info.obs.all), urlRow('Hanya Timer A', info.obs.a), urlRow('Hanya Timer B', info.obs.b));
  }
  $('serverPhone').hidden = !info.phone;
  if (info.phone) {
    $('phoneUrl').textContent = info.phone;
    $('serverPin').textContent = info.pin;
    $('serverQr').hidden = !info.qr;
    if (info.qr) $('serverQr').src = info.qr;
  } else if (s.serverEnabled && s.serverLan && info.running) {
    msg.textContent += ' Alamat WiFi komputer tidak terbaca; cek koneksi jaringan.';
  }
}
let serverInit = false;
function initServerCard() {
  if (serverInit || !current) return;
  serverInit = true;
  const s = current.settings;
  $('serverEnabled').checked = s.serverEnabled;
  $('serverLan').checked = s.serverLan;
  $('serverPort').value = s.serverPort;
  $('serverEnabled').addEventListener('change', (e) => send({ type: 'settings', patch: { serverEnabled: e.target.checked } }));
  $('serverLan').addEventListener('change', (e) => send({ type: 'settings', patch: { serverLan: e.target.checked } }));
  $('serverPort').addEventListener('change', (e) => {
    const v = Math.min(65535, Math.max(1024, Number(e.target.value) || 4777));
    e.target.value = v;
    send({ type: 'settings', patch: { serverPort: v } });
  });
  $('pinNew').addEventListener('click', () => window.api.serverNewPin().then(refreshServer));
  $('phoneCopy').addEventListener('click', () => navigator.clipboard.writeText($('phoneUrl').textContent).catch(() => {}));
  window.api.onServerChanged(() => refreshServer());
  refreshServer();
  setInterval(refreshServer, 5000);
}
window.api.onState((st) => { updateUI(st); initServerCard(); });
loadDisplays();
