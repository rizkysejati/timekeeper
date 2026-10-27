// Mesin timer: murni Node.js (tanpa Electron) supaya mudah dites.
// Waktu dihitung dari Date.now(), jadi tidak melenceng walau jendela lag.

const DEFAULT_STATE = () => ({
  timers: [
    { id: 'A', label: 'Timer A', duration: 180000, remaining: 180000, running: false, finished: false, endAt: 0 },
    { id: 'B', label: 'Timer B', duration: 180000, remaining: 180000, running: false, finished: false, endAt: 0 },
  ],
  settings: {
    dual: true,            // true = tampil 2 timer, false = 1 timer (A saja)
    showLabel: true,
    bg: 'black',           // 'black' | 'transparent' | 'color'
    bgColor: '#00b140',    // dipakai kalau bg = 'color' (hijau chroma key)
    textColor: '#ffffff',
    fontFamily: "'Segoe UI', Arial, sans-serif",
    warnEnabled: true,
    warn1At: 30, warn1Color: '#facc15',   // kuning
    warn2At: 10, warn2Color: '#ef4444',   // merah
    alarmType: 'bel',      // 'bel' | 'beep' | 'buzzer' | 'off'
    alarmVolume: 0.8,
    countdownFrom: 10,     // bunyi tiap detik pada N detik terakhir (0 = mati)
  },
});

class Engine {
  constructor(saved, onFinished, onCountdown) {
    this.state = DEFAULT_STATE();
    this.onFinished = onFinished || (() => {});
    this.onCountdown = onCountdown || (() => {});
    if (saved) this.load(saved);
  }

  load(saved) {
    const d = DEFAULT_STATE();
    this.state.settings = { ...d.settings, ...(saved.settings || {}) };
    (saved.timers || []).forEach((t, i) => {
      if (!this.state.timers[i]) return;
      const dur = Number(t.duration) > 0 ? Number(t.duration) : d.timers[i].duration;
      Object.assign(this.state.timers[i], { label: t.label || d.timers[i].label, duration: dur, remaining: dur });
    });
  }

  snapshot() {
    return {
      timers: this.state.timers.map(({ id, label, duration, remaining, running, finished }) => ({
        id, label, duration, remaining, running, finished,
      })),
      settings: this.state.settings,
    };
  }

  timer(id) { return this.state.timers.find((t) => t.id === id); }

  // Dipanggil tiap ~100 ms. Mengembalikan true kalau ada yang berubah.
  tick(now = Date.now()) {
    let changed = false;
    for (const t of this.state.timers) {
      if (!t.running) continue;
      t.remaining = Math.max(0, t.endAt - now);
      changed = true;
      const sec = Math.ceil(t.remaining / 1000);
      if (sec !== t.lastSec) {
        t.lastSec = sec;
        const n = Number(this.state.settings.countdownFrom) || 0;
        if (sec > 0 && n > 0 && sec <= n) this.onCountdown(t.id, sec);
      }
      if (t.remaining === 0) {
        t.running = false;
        t.finished = true;
        this.onFinished(t.id);
      }
    }
    return changed;
  }

  // Satu pintu untuk semua perintah dari jendela kontrol / hotkey.
  command(cmd, now = Date.now()) {
    const ids = cmd.id === 'ALL' ? this.state.timers.map((t) => t.id) : [cmd.id];
    switch (cmd.type) {
      case 'start': ids.forEach((id) => this._start(this.timer(id), now)); break;
      case 'pause': ids.forEach((id) => this._pause(this.timer(id), now)); break;
      case 'toggle': {
        if (cmd.id === 'ALL') {
          const anyRunning = this.state.timers.some((t) => t.running);
          this.state.timers.forEach((t) => (anyRunning ? this._pause(t, now) : this._start(t, now)));
        } else {
          const t = this.timer(cmd.id);
          t.running ? this._pause(t, now) : this._start(t, now);
        }
        break;
      }
      case 'reset': ids.forEach((id) => this._reset(this.timer(id))); break;
      case 'setDuration': {
        const t = this.timer(cmd.id);
        t.duration = Math.max(1000, Math.round(cmd.ms / 1000) * 1000);
        this._reset(t);
        break;
      }
      case 'adjust': { // tambah/kurang waktu berjalan, mis. +10 detik
        const t = this.timer(cmd.id);
        t.remaining = Math.max(0, t.remaining + cmd.ms);
        if (t.running) t.endAt = now + t.remaining;
        t.finished = t.remaining === 0 && t.finished;
        break;
      }
      case 'setLabel': this.timer(cmd.id).label = String(cmd.label).slice(0, 40); break;
      case 'settings': Object.assign(this.state.settings, cmd.patch); break;
      default: break;
    }
  }

  _start(t, now) {
    if (t.running) return;
    if (t.remaining <= 0) this._reset(t);
    t.running = true;
    t.finished = false;
    t.lastSec = null;
    t.endAt = now + t.remaining;
  }
  _pause(t, now) {
    if (!t.running) return;
    t.remaining = Math.max(0, t.endAt - now);
    t.running = false;
  }
  _reset(t) {
    t.running = false;
    t.finished = false;
    t.remaining = t.duration;
  }

  // Data yang disimpan ke file (tanpa waktu berjalan).
  persistable() {
    return {
      timers: this.state.timers.map(({ label, duration }) => ({ label, duration })),
      settings: this.state.settings,
    };
  }
}

module.exports = { Engine, DEFAULT_STATE };
