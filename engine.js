// Mesin timer: murni Node.js (tanpa Electron) supaya mudah dites.
// Waktu dihitung dari Date.now(), jadi tidak melenceng walau jendela lag.

const { DEFAULT_HOTKEYS } = require('./hotkeys');

const MODES = ['down', 'up', 'clock'];

const makeTimer = (id) => ({
  id, label: `Timer ${id}`, duration: 180000, remaining: 180000,
  running: false, finished: false, endAt: 0, lastSec: null,
  inOver: false,  // true = sedang/pernah lembur (lewat 00:00 dengan overtime aktif)
  over: 0,        // lama lembur dalam ms (selalu >= 0)
  segments: [],   // rundown: [{ id, name, duration }]
  segIndex: -1,   // segmen yang sedang dipakai (-1 = tanpa rundown)
  mode: 'down',   // 'down' = hitung mundur | 'up' = hitung maju | 'clock' = jam digital
  elapsed: 0,     // lama berjalan (ms), dipakai mode 'up'
  startAt: 0,
});

const DEFAULT_STATE = () => ({
  timers: [makeTimer('A'), makeTimer('B')],
  settings: {
    dual: true,            // true = tampil 2 timer, false = 1 timer (A saja)
    showLabel: true,
    showSegment: true,     // tampilkan nama segmen di output
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
    overtime: false,       // true = setelah 00:00 lanjut menghitung ke minus
    autoAdvance: 'load',   // saat segmen habis: 'off' | 'load' (siapkan berikutnya) | 'run' (siapkan + jalan)
    alarmMaxSec: 10,       // batas lama suara alarm dari file (0 = sampai selesai)
    customSounds: [],      // [{ id, name, file }] suara alarm milik pengguna; dipilih lewat alarmType 'custom:<id>'
    hotkeys: { ...DEFAULT_HOTKEYS },
    hotkeyGlobal: false,   // true = hotkey juga jalan saat aplikasi tidak sedang aktif
    fontScale: 100,        // ukuran angka timer di output (persen)
    fontWeight: 700,
    fontCustom: '',        // nama font lain yang terpasang di komputer (menimpa fontFamily bila diisi)
    clock24: true,         // jam digital: format 24 jam
    clockSeconds: true,    // jam digital: tampilkan detik
    serverEnabled: true,   // server lokal untuk OBS Browser Source dan kontrol HP
    serverPort: 4777,
    serverLan: false,      // true = bisa diakses perangkat lain di jaringan (HP), dilindungi PIN
    serverPin: '',         // diisi acak oleh aplikasi saat pertama kali
  },
});

class Engine {
  constructor(saved, onFinished, onCountdown) {
    this.state = DEFAULT_STATE();
    this.onFinished = onFinished || (() => {});
    this.onCountdown = onCountdown || (() => {});
    this._seq = 0;
    if (saved) this.load(saved);
  }

  newSegId() { return `s${Date.now().toString(36)}${(this._seq++).toString(36)}`; }

  load(saved) {
    const d = DEFAULT_STATE();
    this.state.settings = { ...d.settings, ...(saved.settings || {}) };
    this.state.settings.hotkeys = { ...DEFAULT_HOTKEYS, ...((saved.settings && saved.settings.hotkeys) || {}) };
    if (!Array.isArray(this.state.settings.customSounds)) this.state.settings.customSounds = [];
    (saved.timers || []).forEach((st, i) => {
      const t = this.state.timers[i];
      if (!t) return;
      const dur = Number(st.duration) > 0 ? Number(st.duration) : d.timers[i].duration;
      t.label = st.label || d.timers[i].label;
      t.mode = MODES.includes(st.mode) ? st.mode : 'down';
      t.duration = t.remaining = dur;
      t.segments = (Array.isArray(st.segments) ? st.segments : [])
        .filter((s) => s && Number(s.duration) > 0)
        .map((s) => ({ id: s.id || this.newSegId(), name: String(s.name || '').slice(0, 40), duration: Number(s.duration) }));
      if (t.segments.length) {
        const idx = Math.min(Math.max(Number(st.segIndex) || 0, 0), t.segments.length - 1);
        this._select(t, idx);
      }
    });
  }

  snapshot() {
    return {
      timers: this.state.timers.map((t) => {
        const seg = t.segments[t.segIndex];
        return {
          id: t.id, label: t.label, duration: t.duration, remaining: t.remaining,
          mode: t.mode, elapsed: t.elapsed,
          running: t.running, finished: t.finished,
          segName: seg ? seg.name : '', segIndex: t.segIndex, segCount: t.segments.length,
          segments: t.segments,
        };
      }),
      settings: this.state.settings,
    };
  }

  timer(id) { return this.state.timers.find((t) => t.id === id); }

  // Dipanggil tiap ~100 ms. Mengembalikan true kalau ada yang berubah.
  tick(now = Date.now()) {
    let changed = false;
    const s = this.state.settings;
    for (const t of this.state.timers) {
      if (!t.running) continue;
      changed = true;
      if (t.mode === 'up') { t.elapsed = Math.max(0, now - t.startAt); continue; }
      const left = t.endAt - now;

      if (left > 0) {
        t.remaining = left;
        const sec = Math.ceil(left / 1000);
        if (sec !== t.lastSec) {
          t.lastSec = sec;
          const n = Number(s.countdownFrom) || 0;
          if (n > 0 && sec <= n) this.onCountdown(t.id, sec);
        }
        continue;
      }

      // Waktu habis
      const firstTime = !t.finished;
      t.finished = true;
      if (s.overtime) {
        t.remaining = left;            // negatif = lembur, timer terus jalan
        t.inOver = true;
        t.over = -left;
      } else {
        t.remaining = 0;
        t.running = false;
      }
      if (firstTime) {
        this.onFinished(t.id);
        if (!s.overtime) this._autoAdvance(t, now);
      }
    }
    return changed;
  }

  _autoAdvance(t, now) {
    const mode = this.state.settings.autoAdvance;
    if (mode === 'off' || t.segIndex < 0 || t.segIndex >= t.segments.length - 1) return;
    this._select(t, t.segIndex + 1);
    if (mode === 'run') this._start(t, now);
  }

  // Satu pintu untuk semua perintah dari jendela kontrol / hotkey.
  command(cmd, now = Date.now()) {
    const ids = cmd.id === 'ALL' ? this.state.timers.map((t) => t.id) : [cmd.id];
    const s = this.state.settings;
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
        if (t.mode === 'up') {
          t.elapsed = Math.max(0, t.elapsed + cmd.ms);
          if (t.running) t.startAt = now - t.elapsed;
          break;
        }
        t.remaining += cmd.ms;
        if (!s.overtime) t.remaining = Math.max(0, t.remaining);
        if (t.running) t.endAt = now + t.remaining;
        t.finished = t.finished && t.remaining <= 0;
        break;
      }
      case 'setMode': {
        const t = this.timer(cmd.id);
        if (MODES.includes(cmd.mode) && t.mode !== cmd.mode) { t.mode = cmd.mode; this._reset(t); }
        break;
      }
      case 'setLabel': this.timer(cmd.id).label = String(cmd.label).slice(0, 40); break;
      case 'settings': Object.assign(s, cmd.patch); break;

      // ---- rundown segmen ----
      case 'segAdd': {
        const t = this.timer(cmd.id);
        t.segments.push({
          id: this.newSegId(),
          name: String(cmd.name || `Segmen ${t.segments.length + 1}`).slice(0, 40),
          duration: Math.max(1000, Math.round((cmd.ms || t.duration) / 1000) * 1000),
        });
        if (t.segIndex < 0) this._select(t, 0);
        break;
      }
      case 'segUpdate': {
        const t = this.timer(cmd.id);
        const seg = t.segments[cmd.index];
        if (!seg) break;
        if (cmd.name !== undefined) seg.name = String(cmd.name).slice(0, 40);
        if (cmd.ms !== undefined) seg.duration = Math.max(1000, Math.round(cmd.ms / 1000) * 1000);
        // Segmen yang sedang dipakai dan belum jalan: durasinya ikut berubah.
        if (cmd.index === t.segIndex && cmd.ms !== undefined && !t.running) this._select(t, t.segIndex);
        break;
      }
      case 'segRemove': {
        const t = this.timer(cmd.id);
        if (!t.segments[cmd.index]) break;
        t.segments.splice(cmd.index, 1);
        if (!t.segments.length) { t.segIndex = -1; }
        else if (cmd.index < t.segIndex) { t.segIndex -= 1; }
        else if (cmd.index === t.segIndex) { this._select(t, Math.min(t.segIndex, t.segments.length - 1)); }
        break;
      }
      case 'segMove': {
        const t = this.timer(cmd.id);
        const i = cmd.index, j = i + cmd.dir;
        if (!t.segments[i] || !t.segments[j]) break;
        [t.segments[i], t.segments[j]] = [t.segments[j], t.segments[i]];
        if (t.segIndex === i) t.segIndex = j; else if (t.segIndex === j) t.segIndex = i;
        break;
      }
      case 'segSelect': {
        const t = this.timer(cmd.id);
        if (t.segments[cmd.index]) this._select(t, cmd.index);
        break;
      }
      case 'segNext': ids.forEach((id) => this._step(this.timer(id), +1)); break;
      case 'segPrev': ids.forEach((id) => this._step(this.timer(id), -1)); break;
      case 'segCopy': { // salin rundown satu timer ke timer lain
        const from = this.timer(cmd.from), to = this.timer(cmd.to);
        if (!from || !to || from === to) break;
        to.segments = from.segments.map((x) => ({ ...x, id: this.newSegId() }));
        if (to.segments.length) this._select(to, 0); else to.segIndex = -1;
        break;
      }
      default: break;
    }
  }

  _step(t, dir) {
    if (t.mode !== 'down') return;
    const i = t.segIndex + dir;
    if (t.segIndex < 0 || i < 0 || i >= t.segments.length) return;
    this._select(t, i);
  }

  _select(t, i) {
    t.segIndex = i;
    t.duration = t.segments[i].duration;
    this._reset(t);
  }

  _overtimePaused(t) {
    return this.state.settings.overtime && t.finished && t.remaining < 0;
  }

  _start(t, now) {
    if (t.running) return;
    if (t.mode === 'clock') return;
    if (t.mode === 'up') { t.running = true; t.startAt = now - t.elapsed; return; }
    const resumeOver = this._overtimePaused(t);
    if (t.remaining <= 0 && !resumeOver) this._reset(t);
    t.running = true;
    if (!resumeOver) t.finished = false;
    t.lastSec = null;
    t.endAt = now + t.remaining;
  }
  _pause(t, now) {
    if (!t.running) return;
    if (t.mode === 'up') { t.elapsed = Math.max(0, now - t.startAt); t.running = false; return; }
    const left = t.endAt - now;
    const over = this.state.settings.overtime && t.finished;
    t.remaining = over ? left : Math.max(0, left);
    if (over) t.over = -left;
    t.running = false;
  }
  _reset(t) {
    t.running = false;
    t.elapsed = 0;
    t.finished = false;
    t.inOver = false;
    t.over = 0;
    t.remaining = t.duration;
    t.lastSec = null;
  }

  // Data yang disimpan ke file (tanpa waktu berjalan).
  persistable() {
    return {
      timers: this.state.timers.map(({ label, duration, segments, segIndex, mode }) => ({ label, duration, segments, segIndex, mode })),
      settings: this.state.settings,
    };
  }
}

module.exports = { Engine, DEFAULT_STATE };
