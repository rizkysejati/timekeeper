(function () {
  const $ = (id) => document.getElementById(id);
  const pinBox = $('pin'), app = $('app'), conn = $('conn'), box = $('timers');
  let last = null, started = false;

  const getPin = () => { try { return sessionStorage.getItem('tkPin') || ''; } catch { return ''; } };
  const setPin = (v) => { try { sessionStorage.setItem('tkPin', v); } catch {} };

  async function checkAuth() {
    try {
      const r = await fetch('/api/auth', { headers: { 'x-pin': getPin() } });
      return await r.json();
    } catch { return { ok: false, local: false, error: true }; }
  }

  async function begin(showError) {
    const a = await checkAuth();
    if (a.ok) {
      pinBox.hidden = true; app.hidden = false;
      if (!started) { started = true; start(); }
      return;
    }
    app.hidden = true; pinBox.hidden = false;
    $('pinMsg').textContent = showError ? (a.error ? 'Tidak bisa terhubung ke komputer.' : 'PIN salah, atau terlalu banyak percobaan (tunggu 1 menit).') : '';
  }
  $('pinBtn').onclick = () => { setPin($('pinInput').value.trim()); begin(true); };
  $('pinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('pinBtn').click(); });

  function start() {
    window.api.onConnection((ok) => { conn.textContent = ok ? 'terhubung' : 'terputus'; conn.className = 'conn ' + (ok ? 'ok' : 'bad'); });
    window.api.onState((st) => { last = st; render(); });
    box.addEventListener('click', onClick);
    document.querySelector('.all').addEventListener('click', onClick);
    setInterval(() => { if (last) paint(); }, 200);
  }

  async function send(cmd) {
    const code = await window.api.command(cmd);
    if (code === 401) { started = true; begin(true); }
  }
  function onClick(e) {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const cmd = { type: b.dataset.act, id: b.dataset.id };
    if (b.dataset.ms) cmd.ms = Number(b.dataset.ms);
    send(cmd);
  }

  let sig = '';
  function render() {
    const s = last.timers.map((t) => t.id + t.label + t.mode + t.segCount).join('|');
    if (s !== sig) {
      sig = s;
      box.innerHTML = last.timers.map((t) => `
        <section class="t" data-t="${t.id}">
          <div class="lbl"></div><div class="seg"></div><div class="disp"></div>
          <div class="row">
            <button class="btn go" data-act="toggle" data-id="${t.id}">Mulai</button>
            <button class="btn" data-act="reset" data-id="${t.id}">Reset</button>
          </div>
          <div class="row">
            <button class="btn" data-act="adjust" data-id="${t.id}" data-ms="-10000">-10s</button>
            <button class="btn" data-act="adjust" data-id="${t.id}" data-ms="10000">+10s</button>
            <button class="btn" data-act="adjust" data-id="${t.id}" data-ms="60000">+1m</button>
          </div>
          ${t.segCount > 1 ? `<div class="row"><button class="btn" data-act="segPrev" data-id="${t.id}">« Segmen</button><button class="btn" data-act="segNext" data-id="${t.id}">Segmen »</button></div>` : ''}
        </section>`).join('');
    }
    paint();
  }
  function paint() {
    last.timers.forEach((t) => {
      const sec = box.querySelector(`[data-t="${t.id}"]`);
      if (!sec) return;
      sec.className = 't' + (t.running ? ' running' : '') + (t.finished ? ' finished' : '');
      sec.querySelector('.lbl').textContent = t.label;
      sec.querySelector('.seg').textContent = t.segName ? `${t.segName} (${t.segIndex + 1}/${t.segCount})` : '';
      const d = sec.querySelector('.disp');
      d.textContent = TF.text(t, last.settings);
      d.className = 'disp' + (t.mode === 'down' && t.remaining < 0 ? ' over' : '');
      const tg = sec.querySelector('[data-act="toggle"]');
      tg.textContent = t.running ? 'Jeda' : 'Mulai';
      tg.className = 'btn ' + (t.running ? 'stop' : 'go');
    });
  }
  begin(false);
})();
