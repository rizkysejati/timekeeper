# Timekeeper

Aplikasi desktop **timer countdown** untuk debat, acara, dan panggung. Operator mengatur semuanya di jendela kontrol, sementara penonton hanya melihat **output bersih berisi timer** lewat HDMI/proyektor atau OBS.

> Dibuat dengan Electron (HTML, CSS, JavaScript). Windows (macOS menyusul).

## Unduh

Unduh installer terbaru di halaman **[Releases](../../releases/latest)**, lalu jalankan `Timekeeper Setup x.x.x.exe`.

Jika Windows menampilkan peringatan *"Windows protected your PC"*, klik **More info > Run anyway**. Peringatan ini muncul karena aplikasi belum memiliki tanda tangan digital berbayar.

## Fitur

- **Dua timer sekaligus** (misalnya dua kandidat), bisa ditampilkan dalam satu jendela atau **dipisah** menjadi jendela output sendiri-sendiri
- **Output bersih** tanpa tombol atau menu, layar penuh di monitor HDMI/proyektor yang dipilih
- Latar **hitam, transparan, atau warna bebas** (mis. hijau untuk chroma key), warna teks dan font bisa diganti
- **Peringatan warna** yang bisa diatur (default kuning di 30 detik terakhir, merah di 10 detik terakhir)
- **Bunyi hitung mundur** di 3, 5, atau 10 detik terakhir, dan **alarm** saat waktu habis (bel, beep, buzzer)
- Kontrol **layar penuh** dan **selalu di atas** saat output sudah terbuka, serta deteksi monitor yang dicolok belakangan
- Cocok untuk **OBS** (Window Capture) dan vMix
- Pengaturan tersimpan otomatis

## Cara pakai singkat

1. Atur durasi tiap timer lalu klik **Atur**, tekan **Mulai**.
2. Pilih mode, tata letak, dan monitor, lalu klik **Buka output**.
3. Hotkey (saat jendela kontrol aktif): `Spasi` mulai/jeda semua, `1` Timer A, `2` Timer B, `R` reset semua.

## Menjalankan dari kode

Butuh [Node.js](https://nodejs.org) LTS.

```bash
npm install
npm start
```

## Membuat installer

```bash
npm run build:win
```

Hasilnya ada di folder `dist/`. Di Windows, aktifkan *Developer Mode* bila pembuatan installer gagal karena izin symbolic link.

## Struktur proyek

| File | Fungsi |
| --- | --- |
| `main.js` | Proses utama: jendela, monitor, penyimpanan pengaturan |
| `engine.js` | Logika timer (dapat dites dengan `npm test`) |
| `preload.js` | Jembatan aman antara jendela dan proses utama |
| `renderer/` | Tampilan kontrol dan output |

## Rencana pengembangan

- [x] V1: dua timer, output bersih, warna peringatan, alarm, hitung mundur bersuara
- [ ] V2: rundown segmen berurutan dan overtime
- [ ] V3: hotkey kustom (termasuk global) dan alarm dari file sendiri
- [ ] V4: mode count-up, jam digital, pilihan font
- [ ] V5: output lewat URL lokal untuk OBS Browser Source, virtual camera

## Lisensi

[MIT](LICENSE)

## Pembuat

Rizky Dwi Karunia Sejati, [@rizkysejati](https://github.com/rizkysejati)
