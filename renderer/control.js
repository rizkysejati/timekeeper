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
function playAlarm(type, volume) {
  if (type === 'off') return;
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
    </div>`).join('');

  wrap.querySelectorAll('.tcard').forEach((card) => {
    const id = card.dataset.id;
    const t = current.timers.find((x) => x.id === id);
    card.querySelector('.dm').value = Math.floor(t.duration / 60000);
    card.querySelector('.ds').value = Math.floor((t.duration % 60000) / 1000);
    card.querySelector('.tlabel').addEventListener('input', (e) => send({ type: 'setLabel', id, label: e.target.value }));
    card.querySelector('.toggle').addEventListener('click', () => send({ type: 'toggle', id }));
    card.querySelector('.reset').addEventListener('click', () => send({ type: 'reset', id }));
    card.querySelector('.setdur').addEventListener('click', () => {
      const m = Number(card.querySelector('.dm').value) || 0;
      const s = Number(card.querySelector('.ds').value) || 0;
      send({ type: 'setDuration', id, ms: (m * 60 + s) * 1000 });
    });
    card.querySelectorAll('[data-adj]').forEach((b) =>
      b.addEventListener('click', () => send({ type: 'adjust', id, ms: Number(b.dataset.adj) })));
  });
}

function fmt(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

// ---------- Update tampilan saat state berubah ----------
const settingIds = ['bg', 'bgColor', 'textColor', 'fontFamily', 'warn1Color', 'warn2Color', 'alarmType'];
const numIds = ['warn1At', 'warn2At', 'alarmVolume', 'countdownFrom'];
const boolIds = ['dual', 'showLabel', 'warnEnabled'];

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

  $('timers').classList.toggle('single', !s.dual);
  document.querySelectorAll('.tcard').forEach((card) => {
    const t = state.timers.find((x) => x.id === card.dataset.id);
    const hidden = !s.dual && t.id !== 'A';
    card.style.display = hidden ? 'none' : '';
    card.classList.toggle('running', t.running);
    card.classList.toggle('finished', t.finished);
    card.querySelector('.tdisplay').textContent = fmt(t.remaining);
    const tg = card.querySelector('.toggle');
    tg.textContent = t.running ? '⏸ Jeda' : '▶ Mulai';
    tg.className = 'btn toggle ' + (t.running ? 'stop' : 'go');
  });
}

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

document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' && ['text', 'number'].includes(e.target.type)) return; // jangan ganggu saat mengetik
  if (tag === 'select') return;
  if (e.code === 'Space') { e.preventDefault(); send({ type: 'toggle', id: 'ALL' }); }
  else if (e.key === '1') send({ type: 'toggle', id: 'A' });
  else if (e.key === '2') send({ type: 'toggle', id: 'B' });
  else if (e.key.toLowerCase() === 'r') send({ type: 'reset', id: 'ALL' });
});

window.api.onCountdown(({ sec }) => {
  if (current) playTick(sec, current.settings.alarmVolume);
});
window.api.onFinished(() => {
  if (current) playAlarm(current.settings.alarmType, current.settings.alarmVolume);
});
window.api.onState(updateUI);
loadDisplays();
