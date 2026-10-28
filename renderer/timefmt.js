// Format tampilan waktu yang dipakai bersama oleh jendela output, kontrol, dan halaman HP.
(function (root) {
  const pad = (n) => String(n).padStart(2, '0');

  function hms(total) {
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  // Hitung mundur: sisa waktu dibulatkan ke atas supaya 00:00 baru muncul saat benar-benar habis.
  // Lembur (ms negatif) tampil -00:05 dst.
  function down(ms) {
    const over = ms < 0;
    const total = over ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000);
    const body = hms(total);
    return over && total > 0 ? '-' + body : body;
  }
  // Hitung maju: dibulatkan ke bawah (detik berjalan).
  function up(ms) { return hms(Math.floor(ms / 1000)); }

  function clock(date, s) {
    let h = date.getHours();
    let suffix = '';
    if (!s.clock24) { suffix = h >= 12 ? ' PM' : ' AM'; h = h % 12 || 12; }
    const hh = s.clock24 ? pad(h) : String(h);
    return `${hh}:${pad(date.getMinutes())}${s.clockSeconds ? ':' + pad(date.getSeconds()) : ''}${suffix}`;
  }

  // Teks yang ditampilkan untuk sebuah timer menurut mode-nya.
  function text(t, s, now) {
    if (t.mode === 'up') return up(t.elapsed || 0);
    if (t.mode === 'clock') return clock(now || new Date(), s);
    return down(t.remaining);
  }

  // Font: nama font kustom (bila aman) menimpa pilihan dari daftar.
  function fontFamily(s) {
    const c = (s.fontCustom || '').trim();
    return c && /^[\w\s\-,'"]+$/.test(c) ? c + ', sans-serif' : s.fontFamily;
  }

  const api = { down, up, clock, text, fontFamily };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TF = api;
})(typeof window !== 'undefined' ? window : this);
