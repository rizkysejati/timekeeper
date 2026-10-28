const params = new URLSearchParams(location.search);
function setFs(on) {
  document.body.classList.toggle('fullscreen', on);   // sembunyikan kursor
  document.body.classList.toggle('windowed', !on);
}
setFs(params.get('mode') === 'fullscreen');
window.api.onOutputFs(setFs);
// Klik dua kali atau F11 = layar penuh / keluar. Esc = keluar layar penuh.
document.addEventListener('dblclick', () => window.api.outputCtl({ type: 'fullscreen', value: 'toggle' }));
document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') { e.preventDefault(); window.api.outputCtl({ type: 'fullscreen', value: 'toggle' }); }
  if (e.key === 'Escape') window.api.outputCtl({ type: 'fullscreen', value: false });
});
if (params.get('frameless') === '1') document.body.classList.add('frameless');

const stage = document.getElementById('stage');
const only = params.get('timer'); // 'A' | 'B' | 'ALL'

function colorFor(t, s) {
  if (!s.warnEnabled) return s.textColor;
  const sec = Math.ceil(t.remaining / 1000);
  if (t.finished || sec <= s.warn2At) return s.warn2Color;
  if (sec <= s.warn1At) return s.warn1Color;
  return s.textColor;
}

function render(state) {
  const { timers, settings: s } = state;
  const list = only === 'A' || only === 'B'
    ? timers.filter((t) => t.id === only)
    : (s.dual ? timers : [timers[0]]);

  document.body.style.background =
    s.bg === 'transparent' ? 'transparent' : s.bg === 'color' ? s.bgColor : '#000';
  document.body.style.fontFamily = TF.fontFamily(s);
  document.documentElement.style.setProperty('--scale', String((Number(s.fontScale) || 100) / 100));

  stage.className = list.length === 1 ? 'one' : 'two';
  // Bangun ulang hanya kalau jumlah timer berubah, selain itu update isi saja.
  if (stage.children.length !== list.length) {
    stage.innerHTML = list.map(() => '<div class="cell"><div class="label"></div><div class="seg"></div><div class="time"></div></div>').join('');
  }
  list.forEach((t, i) => {
    const cell = stage.children[i];
    const label = cell.querySelector('.label');
    const time = cell.querySelector('.time');
    const seg = cell.querySelector('.seg');
    const isDown = !t.mode || t.mode === 'down';
    seg.textContent = t.segName || '';
    seg.style.display = s.showSegment && t.segName && isDown ? '' : 'none';
    seg.style.color = s.textColor;
    label.textContent = t.label;
    label.style.display = s.showLabel ? '' : 'none';
    label.style.color = s.textColor;
    time.textContent = TF.text(t, s);
    time.style.fontWeight = String(s.fontWeight || 700);
    time.style.color = isDown ? colorFor(t, s) : s.textColor;       // peringatan warna hanya untuk hitung mundur
    time.classList.toggle('blink', isDown && t.finished && !t.running); // lembur yang masih jalan tidak berkedip
  });
}

let lastState = null;
window.api.onState((st) => { lastState = st; render(st); });
// Jam digital harus bergerak tiap detik walau tidak ada perubahan state.
setInterval(() => { if (lastState && lastState.timers.some((t) => t.mode === 'clock')) render(lastState); }, 500);
