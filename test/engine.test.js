const assert = require('assert');
const { Engine } = require('../engine');

const finished = [];
const e = new Engine(null, (id) => finished.push(id));
const t0 = 1_000_000;

// set durasi 5 detik, mulai A
e.command({ type: 'setDuration', id: 'A', ms: 5000 }, t0);
assert.strictEqual(e.timer('A').remaining, 5000);
e.command({ type: 'start', id: 'A' }, t0);
e.tick(t0 + 2000);
assert.strictEqual(e.timer('A').remaining, 3000);

// jeda lalu lanjut: sisa waktu harus terjaga
e.command({ type: 'pause', id: 'A' }, t0 + 2000);
e.tick(t0 + 9000);
assert.strictEqual(e.timer('A').remaining, 3000);
e.command({ type: 'start', id: 'A' }, t0 + 9000);
e.tick(t0 + 11000);
assert.strictEqual(e.timer('A').remaining, 1000);

// tambah 10 detik saat berjalan
e.command({ type: 'adjust', id: 'A', ms: 10000 }, t0 + 11000);
assert.strictEqual(e.timer('A').remaining, 11000);

// habis -> finished + callback sekali
e.tick(t0 + 30000);
assert.strictEqual(e.timer('A').remaining, 0);
assert.ok(e.timer('A').finished && !e.timer('A').running);
assert.deepStrictEqual(finished, ['A']);

// reset
e.command({ type: 'reset', id: 'A' });
assert.strictEqual(e.timer('A').remaining, 5000);
assert.ok(!e.timer('A').finished);

// toggle ALL: dua timer jalan bersamaan
e.command({ type: 'toggle', id: 'ALL' }, t0);
assert.ok(e.timer('A').running && e.timer('B').running);
e.command({ type: 'toggle', id: 'ALL' }, t0 + 1000);
assert.ok(!e.timer('A').running && !e.timer('B').running);

// simpan & muat
const e2 = new Engine(e.persistable());
assert.strictEqual(e2.timer('A').duration, 5000);

console.log('Semua tes engine lolos');

// ---- hitung mundur bersuara ----
{
  const beeps = [];
  const e3 = new Engine(null, () => {}, (id, sec) => beeps.push([id, sec]));
  e3.command({ type: 'settings', patch: { countdownFrom: 5 } });
  e3.command({ type: 'setDuration', id: 'A', ms: 8000 });
  const t = 5_000_000;
  e3.command({ type: 'start', id: 'A' }, t);
  for (let ms = 0; ms <= 8000; ms += 100) e3.tick(t + ms);
  assert.deepStrictEqual(beeps.map((b) => b[1]), [5, 4, 3, 2, 1]);
  // mati = tidak bunyi
  const none = [];
  const e4 = new Engine(null, () => {}, (id, sec) => none.push(sec));
  e4.command({ type: 'settings', patch: { countdownFrom: 0 } });
  e4.command({ type: 'setDuration', id: 'A', ms: 3000 });
  e4.command({ type: 'start', id: 'A' }, t);
  for (let ms = 0; ms <= 3000; ms += 100) e4.tick(t + ms);
  assert.strictEqual(none.length, 0);
  console.log('Tes hitung mundur lolos');
}
