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

// ---- V2: rundown segmen + overtime ----
{
  const fin = [];
  const e = new Engine(null, (id) => fin.push(id));
  const t0 = 9_000_000;
  e.command({ type: 'segAdd', id: 'A', name: 'Buka', ms: 3000 });
  e.command({ type: 'segAdd', id: 'A', name: 'Tutup', ms: 2000 });
  assert.strictEqual(e.timer('A').remaining, 3000);          // segmen pertama otomatis dipakai
  e.command({ type: 'segNext', id: 'A' });
  assert.strictEqual(e.timer('A').remaining, 2000);
  e.command({ type: 'segPrev', id: 'A' });
  assert.strictEqual(e.timer('A').segIndex, 0);

  // autoAdvance 'run': habis -> pindah segmen dan jalan terus
  e.command({ type: 'settings', patch: { autoAdvance: 'run' } });
  e.command({ type: 'start', id: 'A' }, t0);
  e.tick(t0 + 3100);
  assert.strictEqual(e.timer('A').segIndex, 1);
  assert.ok(e.timer('A').running);
  assert.deepStrictEqual(fin, ['A']);
  // segmen terakhir habis tanpa overtime -> berhenti
  e.tick(t0 + 3100 + 2100);
  assert.ok(!e.timer('A').running && e.timer('A').finished);

  // overtime: hitung naik setelah 0, jeda, lanjut, reset
  const e2 = new Engine(null, () => {});
  e2.command({ type: 'settings', patch: { overtime: true } });
  e2.command({ type: 'setDuration', id: 'B', ms: 2000 });
  e2.command({ type: 'start', id: 'B' }, t0);
  e2.tick(t0 + 2000);
  assert.ok(e2.timer('B').inOver && e2.timer('B').running);
  e2.tick(t0 + 5000);
  assert.strictEqual(e2.timer('B').over, 3000);
  e2.command({ type: 'pause', id: 'B' }, t0 + 5000);
  e2.tick(t0 + 9000);
  assert.strictEqual(e2.timer('B').over, 3000);
  e2.command({ type: 'start', id: 'B' }, t0 + 9000);
  e2.tick(t0 + 10000);
  assert.strictEqual(e2.timer('B').over, 4000);
  e2.command({ type: 'reset', id: 'B' });
  assert.ok(!e2.timer('B').inOver && e2.timer('B').remaining === 2000);

  // simpan & muat rundown
  const e3 = new Engine(e.persistable());
  assert.strictEqual(e3.timer('A').segments.length, 2);
  assert.strictEqual(e3.timer('A').segments[1].name, 'Tutup');
  console.log('Tes V2 (rundown + overtime) lolos');
}

// ---- V2: overtime ----
{
  const fin = [];
  const e = new Engine(null, (id) => fin.push(id));
  e.command({ type: 'settings', patch: { overtime: true, autoAdvance: 'off' } });
  e.command({ type: 'setDuration', id: 'A', ms: 5000 });
  const t = 9_000_000;
  e.command({ type: 'start', id: 'A' }, t);
  e.tick(t + 7000); // lewat 2 detik
  assert.strictEqual(e.timer('A').remaining, -2000);
  assert.ok(e.timer('A').running && e.timer('A').finished);
  assert.deepStrictEqual(fin, ['A']);          // alarm hanya sekali
  e.tick(t + 9000);
  assert.deepStrictEqual(fin, ['A']);
  e.command({ type: 'pause', id: 'A' }, t + 9000);
  assert.strictEqual(e.timer('A').remaining, -4000);
  e.command({ type: 'start', id: 'A' }, t + 20000); // lanjut dari lembur, bukan reset
  e.tick(t + 21000);
  assert.strictEqual(e.timer('A').remaining, -5000);
  e.command({ type: 'reset', id: 'A' });
  assert.strictEqual(e.timer('A').remaining, 5000);
  console.log('Tes overtime lolos');
}

// ---- V2: rundown segmen ----
{
  const e = new Engine(null);
  e.command({ type: 'settings', patch: { overtime: false, autoAdvance: 'load', countdownFrom: 0 } });
  e.command({ type: 'segAdd', id: 'A', name: 'Pembukaan', ms: 3000 });
  e.command({ type: 'segAdd', id: 'A', name: 'Rebuttal', ms: 2000 });
  e.command({ type: 'segAdd', id: 'A', name: 'Penutup', ms: 1000 });
  const a = e.timer('A');
  assert.strictEqual(a.segIndex, 0);
  assert.strictEqual(a.remaining, 3000);          // segmen pertama otomatis dipilih
  assert.strictEqual(e.snapshot().timers[0].segName, 'Pembukaan');

  // auto-lanjut: habis -> segmen berikutnya siap, tidak jalan
  const t = 1_000_000;
  e.command({ type: 'start', id: 'A' }, t);
  e.tick(t + 3500);
  assert.strictEqual(a.segIndex, 1);
  assert.strictEqual(a.remaining, 2000);
  assert.ok(!a.running && !a.finished);

  // mode 'run': langsung jalan
  e.command({ type: 'settings', patch: { autoAdvance: 'run' } });
  e.command({ type: 'start', id: 'A' }, t + 4000);
  e.tick(t + 6500);
  assert.strictEqual(a.segIndex, 2);
  assert.ok(a.running);

  // segmen terakhir habis: berhenti di 00:00
  e.tick(t + 8000);
  assert.strictEqual(a.segIndex, 2);
  assert.ok(!a.running && a.finished && a.remaining === 0);

  // navigasi manual, pindah urutan, hapus, salin
  e.command({ type: 'segPrev', id: 'A' });
  assert.strictEqual(a.segIndex, 1);
  e.command({ type: 'segMove', id: 'A', index: 1, dir: -1 });
  assert.deepStrictEqual(a.segments.map((s) => s.name), ['Pembukaan', 'Rebuttal', 'Penutup'].slice(0, 0).concat(['Rebuttal', 'Pembukaan', 'Penutup']));
  assert.strictEqual(a.segIndex, 0);                // pilihan ikut berpindah
  e.command({ type: 'segRemove', id: 'A', index: 2 });
  assert.strictEqual(a.segments.length, 2);
  e.command({ type: 'segCopy', from: 'A', to: 'B' });
  assert.deepStrictEqual(e.timer('B').segments.map((s) => s.name), ['Rebuttal', 'Pembukaan']);
  assert.notStrictEqual(e.timer('B').segments[0].id, a.segments[0].id);

  // simpan & muat
  const e2 = new Engine(e.persistable());
  assert.strictEqual(e2.timer('A').segments.length, 2);
  assert.strictEqual(e2.timer('A').remaining, e2.timer('A').segments[e2.timer('A').segIndex].duration);
  console.log('Tes segmen lolos');
}

// ---- V5: mode hitung maju & jam ----
{
  const fin = [];
  const e = new Engine(null, (id) => fin.push(id));
  const t = 20_000_000;
  e.command({ type: 'setMode', id: 'A', mode: 'up' });
  assert.strictEqual(e.timer('A').mode, 'up');
  e.command({ type: 'start', id: 'A' }, t);
  e.tick(t + 4000);
  assert.strictEqual(e.timer('A').elapsed, 4000);
  e.command({ type: 'pause', id: 'A' }, t + 5000);
  assert.strictEqual(e.timer('A').elapsed, 5000);
  e.tick(t + 9000);
  assert.strictEqual(e.timer('A').elapsed, 5000);              // jeda menahan angka
  e.command({ type: 'start', id: 'A' }, t + 10000);
  e.tick(t + 12000);
  assert.strictEqual(e.timer('A').elapsed, 7000);              // lanjut dari 5 detik
  e.command({ type: 'adjust', id: 'A', ms: 3000 }, t + 12000);
  assert.strictEqual(e.timer('A').elapsed, 10000);
  e.command({ type: 'adjust', id: 'A', ms: -99000 }, t + 12000);
  assert.strictEqual(e.timer('A').elapsed, 0);                 // tidak boleh negatif
  e.command({ type: 'reset', id: 'A' });
  assert.ok(!e.timer('A').running && e.timer('A').elapsed === 0);
  assert.deepStrictEqual(fin, []);                              // hitung maju tidak membunyikan alarm

  // jam digital tidak bisa dijalankan; ganti mode mereset
  e.command({ type: 'setMode', id: 'B', mode: 'clock' });
  e.command({ type: 'toggle', id: 'B' }, t);
  assert.ok(!e.timer('B').running);
  e.command({ type: 'setMode', id: 'B', mode: 'bukan-mode' });
  assert.strictEqual(e.timer('B').mode, 'clock');              // mode tidak valid diabaikan
  e.command({ type: 'segNext', id: 'A' });                      // segmen hanya untuk hitung mundur: tidak error

  // mode ikut tersimpan
  const e2 = new Engine(e.persistable());
  assert.strictEqual(e2.timer('A').mode, 'up');
  assert.strictEqual(e2.timer('B').mode, 'clock');
  assert.strictEqual(e.snapshot().timers[0].mode, 'up');
  console.log('Tes mode up/clock lolos');
}
