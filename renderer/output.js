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

function fmt(ms) {
  // Dibulatkan ke atas supaya 00:00 baru muncul saat benar-benar habis.
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

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
  document.body.style.fontFamily = s.fontFamily;

  stage.className = list.length === 1 ? 'one' : 'two';
  // Bangun ulang hanya kalau jumlah timer berubah, selain itu update isi saja.
  if (stage.children.length !== list.length) {
    stage.innerHTML = list.map(() => '<div class="cell"><div class="label"></div><div class="time"></div></div>').join('');
  }
  list.forEach((t, i) => {
    const cell = stage.children[i];
    const label = cell.querySelector('.label');
    const time = cell.querySelector('.time');
    label.textContent = t.label;
    label.style.display = s.showLabel ? '' : 'none';
    label.style.color = s.textColor;
    time.textContent = fmt(t.remaining);
    time.style.color = colorFor(t, s);
    time.classList.toggle('blink', t.finished);
  });
}

window.api.onState(render);
