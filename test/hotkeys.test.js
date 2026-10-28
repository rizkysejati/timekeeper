const assert = require('assert');
const H = require('../hotkeys');

assert.strictEqual(H.normalize('ctrl+alt+a'), 'Ctrl+Alt+A');
assert.strictEqual(H.normalize('Alt+Ctrl+a'), 'Ctrl+Alt+A');          // urutan modifier seragam
assert.strictEqual(H.normalize('CommandOrControl+Shift+f5'), 'Ctrl+Shift+F5');
assert.strictEqual(H.normalize('space'), 'Space');
assert.strictEqual(H.normalize('Ctrl+'), '');                           // tanpa tombol = tidak valid
assert.strictEqual(H.normalize('Foo+A'), '');                           // modifier tidak dikenal
assert.strictEqual(H.normalize(''), '');
assert.strictEqual(H.normalize(undefined), '');

// kelayakan hotkey global
assert.ok(!H.isGlobalEligible('Space'));
assert.ok(!H.isGlobalEligible('N'));
assert.ok(H.isGlobalEligible('F5'));
assert.ok(H.isGlobalEligible('Ctrl+Space'));
assert.ok(H.isGlobalEligible('Alt+1'));

// format Electron
assert.strictEqual(H.toElectron('Ctrl+Meta+A'), 'Ctrl+Super+A');

// dari KeyboardEvent
const ev = (code, o = {}) => ({ code, ctrlKey: !!o.ctrl, altKey: !!o.alt, shiftKey: !!o.shift, metaKey: !!o.meta });
assert.strictEqual(H.fromKeyboardEvent(ev('Space')), 'Space');
assert.strictEqual(H.fromKeyboardEvent(ev('KeyN', { ctrl: true, shift: true })), 'Ctrl+Shift+N');
assert.strictEqual(H.fromKeyboardEvent(ev('Digit1')), '1');
assert.strictEqual(H.fromKeyboardEvent(ev('Numpad5')), 'num5');
assert.strictEqual(H.fromKeyboardEvent(ev('F9')), 'F9');
assert.strictEqual(H.fromKeyboardEvent(ev('ArrowUp', { alt: true })), 'Alt+Up');
assert.strictEqual(H.fromKeyboardEvent(ev('ControlLeft', { ctrl: true })), ''); // modifier saja
// hasil rekaman harus lolos normalize apa adanya
['Space', 'Ctrl+Shift+N', '1', 'num5', 'F9', 'Alt+Up', 'Ctrl+-'].forEach((a) => assert.strictEqual(H.normalize(a), a));

// peta efektif: bawaan + pilihan pengguna (kosong = dimatikan)
const eff = H.effective({ toggleAll: 'ctrl+space', nextAll: '' });
assert.strictEqual(eff.toggleAll, 'Ctrl+Space');
assert.strictEqual(eff.nextAll, '');
assert.strictEqual(eff.toggleA, '1');
assert.strictEqual(H.effective(undefined).resetAll, 'R');

// tiap aksi punya perintah atau aksi khusus
H.ACTIONS.forEach((a) => assert.ok(a.cmd || a.special, a.id));
console.log('Tes hotkey lolos');
