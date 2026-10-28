// Pengganti window.api untuk halaman yang dibuka di browser biasa / OBS Browser Source / HP.
// Di jendela Electron, window.api sudah disediakan oleh preload.js, jadi berkas ini tidak melakukan apa-apa.
(function () {
  if (window.api) return;
  const noop = () => {};
  const pin = () => { try { return sessionStorage.getItem('tkPin') || ''; } catch { return ''; } };

  let es = null;
  const stateCbs = [];
  const statusCbs = [];
  function connect() {
    es = new EventSource('/events');
    es.onmessage = (ev) => { try { const st = JSON.parse(ev.data); stateCbs.forEach((cb) => cb(st)); } catch {} };
    es.onopen = () => statusCbs.forEach((cb) => cb(true));
    es.onerror = () => statusCbs.forEach((cb) => cb(false)); // EventSource menyambung ulang sendiri
  }

  window.api = {
    onState: (cb) => { stateCbs.push(cb); if (!es) connect(); },
    onConnection: (cb) => statusCbs.push(cb),
    command: (cmd) => fetch('/api/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pin': pin() },
      body: JSON.stringify(cmd),
    }).then((r) => r.status).catch(() => 0),
    onOutputFs: noop, outputCtl: noop, onFinished: noop, onCountdown: noop,
    onOutputStatus: noop, onOutputInfo: noop, onHotkeyStatus: noop, onDisplaysChanged: noop,
  };
})();
