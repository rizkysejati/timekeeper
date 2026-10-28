// Daftar aksi hotkey + pengolah teks pintasan (accelerator).
// Dipakai di proses utama (Node) dan di jendela kontrol (browser), jadi ditulis tanpa dependensi.
(function (root) {
  const ACTIONS = [
    { id: 'toggleAll', label: 'Mulai/jeda semua timer', cmd: { type: 'toggle', id: 'ALL' } },
    { id: 'toggleA', label: 'Mulai/jeda Timer A', cmd: { type: 'toggle', id: 'A' } },
    { id: 'toggleB', label: 'Mulai/jeda Timer B', cmd: { type: 'toggle', id: 'B' } },
    { id: 'pauseAll', label: 'Jeda semua timer', cmd: { type: 'pause', id: 'ALL' } },
    { id: 'resetAll', label: 'Reset semua timer', cmd: { type: 'reset', id: 'ALL' } },
    { id: 'resetA', label: 'Reset Timer A', cmd: { type: 'reset', id: 'A' } },
    { id: 'resetB', label: 'Reset Timer B', cmd: { type: 'reset', id: 'B' } },
    { id: 'nextAll', label: 'Segmen berikutnya (semua timer)', cmd: { type: 'segNext', id: 'ALL' } },
    { id: 'prevAll', label: 'Segmen sebelumnya (semua timer)', cmd: { type: 'segPrev', id: 'ALL' } },
    { id: 'nextA', label: 'Segmen berikutnya Timer A', cmd: { type: 'segNext', id: 'A' } },
    { id: 'nextB', label: 'Segmen berikutnya Timer B', cmd: { type: 'segNext', id: 'B' } },
    { id: 'fullscreen', label: 'Layar penuh output (aktif/nonaktif)', special: 'fullscreen' },
  ];

  const DEFAULT_HOTKEYS = {
    toggleAll: 'Space', toggleA: '1', toggleB: '2', resetAll: 'R', nextAll: 'N', prevAll: 'P',
    pauseAll: '', resetA: '', resetB: '', nextA: '', nextB: '', fullscreen: '',
  };

  const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];
  const MOD_ALIAS = {
    ctrl: 'Ctrl', control: 'Ctrl', commandorcontrol: 'Ctrl', cmdorctrl: 'Ctrl',
    alt: 'Alt', option: 'Alt', altgr: 'Alt',
    shift: 'Shift',
    meta: 'Meta', super: 'Meta', cmd: 'Meta', command: 'Meta', win: 'Meta',
  };
  const NAMED_KEYS = ['Space', 'Return', 'Escape', 'Tab', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown',
    'Insert', 'Delete', 'Backspace', 'numadd', 'numsub', 'nummult', 'numdiv', 'numdec'];
  const PUNCT = '-=,./;\'[]\\`';

  // Nama tombol kanonik, atau '' kalau tidak dikenal.
  function canonKey(k) {
    if (!k) return '';
    const lower = k.toLowerCase();
    if (/^[a-z]$/.test(lower)) return lower.toUpperCase();
    if (/^[0-9]$/.test(lower)) return lower;
    if (/^f([1-9]|1\d|2[0-4])$/.test(lower)) return lower.toUpperCase();
    if (/^num[0-9]$/.test(lower)) return lower;
    if (k.length === 1 && PUNCT.includes(k)) return k;
    return NAMED_KEYS.find((n) => n.toLowerCase() === lower) || '';
  }

  // "ctrl+alt+a" -> { mods: ['Ctrl','Alt'], key: 'A' } | null
  function parse(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = str.split('+').map((p) => p.trim()).filter((p, i, a) => p !== '' || i === a.length - 1);
    if (!parts.length) return null;
    const keyRaw = parts.pop();
    const mods = new Set();
    for (const p of parts) {
      const m = MOD_ALIAS[p.toLowerCase()];
      if (!m) return null;
      mods.add(m);
    }
    const key = canonKey(keyRaw);
    if (!key) return null;
    return { mods: MOD_ORDER.filter((m) => mods.has(m)), key };
  }

  // Bentuk kanonik untuk dibandingkan/disimpan: "Ctrl+Alt+A". '' kalau tidak valid.
  function normalize(str) {
    const p = parse(str);
    return p ? [...p.mods, p.key].join('+') : '';
  }

  // Hotkey global hanya diizinkan bila memakai Ctrl/Alt/Shift/Meta atau tombol F1-F24,
  // supaya tombol biasa (spasi, huruf) tidak "dicuri" dari aplikasi lain.
  function isGlobalEligible(str) {
    const p = parse(str);
    return !!p && (p.mods.length > 0 || /^F\d+$/.test(p.key));
  }

  // Format untuk globalShortcut milik Electron.
  function toElectron(str) {
    const p = parse(str);
    return p ? [...p.mods.map((m) => (m === 'Meta' ? 'Super' : m)), p.key].join('+') : '';
  }

  const CODE_MAP = {
    Space: 'Space', Enter: 'Return', NumpadEnter: 'Return', Escape: 'Escape', Tab: 'Tab',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    Insert: 'Insert', Delete: 'Delete', Backspace: 'Backspace',
    NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec',
    Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: '\'',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`',
  };

  // KeyboardEvent -> bentuk kanonik. '' bila hanya tombol modifier atau tidak didukung.
  function fromKeyboardEvent(e) {
    const code = e.code || '';
    let key = '';
    if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
    else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
    else if (/^Numpad[0-9]$/.test(code)) key = 'num' + code.slice(6);
    else if (/^F([1-9]|1\d|2[0-4])$/.test(code)) key = code;
    else key = CODE_MAP[code] || '';
    if (!key) return '';
    const mods = [];
    if (e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Meta');
    return [...mods, key].join('+');
  }

  // Peta hotkey efektif = bawaan + pilihan pengguna.
  function effective(saved) {
    const out = {};
    for (const a of ACTIONS) {
      const v = saved && Object.prototype.hasOwnProperty.call(saved, a.id) ? saved[a.id] : DEFAULT_HOTKEYS[a.id];
      out[a.id] = normalize(v);
    }
    return out;
  }

  const api = { ACTIONS, DEFAULT_HOTKEYS, parse, normalize, isGlobalEligible, toElectron, fromKeyboardEvent, effective };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Hotkeys = api;
})(typeof window !== 'undefined' ? window : this);
