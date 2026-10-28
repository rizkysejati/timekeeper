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
- **Rundown segmen** per timer (misalnya Pembukaan, Rebuttal, Penutup): atur nama dan durasi, urutkan ulang, pindah manual atau otomatis, nama segmen tampil di output
- **Lembur (overtime)**: setelah 00:00 timer bisa lanjut menghitung ke minus (-00:05) berwarna merah
- **Hotkey yang bisa diatur sendiri** untuk 12 aksi (mulai/jeda, reset, segmen, layar penuh), dengan opsi **hotkey global** yang tetap jalan walau aplikasi tidak sedang aktif
- **Alarm dari file suara sendiri** (mp3, wav, ogg, m4a, aac, flac), bisa ditambah dan dihapus, dengan batas lama putar
- **Tiga mode per timer**: hitung mundur, hitung maju (stopwatch), dan jam digital (12/24 jam, dengan/tanpa detik)
- **Font**: pilihan bawaan, nama font sendiri yang terpasang di komputer, ukuran dan ketebalan
- **OBS Browser Source**: output juga tersedia sebagai alamat web lokal (`http://localhost:4777/output`, atau `?timer=A` / `?timer=B` untuk satu timer saja), latar transparan ikut bekerja
- **Remote lewat HP**: kendalikan timer dari browser HP di WiFi yang sama (QR code, dilindungi PIN 6 digit)
- Pengaturan dan rundown tersimpan otomatis

## Cara pakai singkat

1. Atur durasi tiap timer lalu klik **Atur**, tekan **Mulai**.
2. Pilih mode, tata letak, dan monitor, lalu klik **Buka output**.
3. Hotkey bawaan: `Spasi` mulai/jeda semua, `1` Timer A, `2` Timer B, `R` reset semua, `N` segmen berikutnya, `P` segmen sebelumnya. Semua bisa diubah di kartu **Hotkey**.

## OBS Browser Source dan remote HP

Buka kartu **Server lokal** di aplikasi. Server hanya menerima perintah Mulai, Jeda, Reset, Atur waktu, dan Segmen; pengaturan aplikasi tidak bisa diubah dari luar.

- **OBS**: tambah sumber *Browser*, tempel alamat output, atur lebar dan tinggi sesuai kanvas.
- **HP**: centang *Izinkan perangkat lain di jaringan*, scan QR atau ketik alamatnya di HP, lalu masukkan PIN. Port 4777 mungkin perlu diizinkan di Windows Firewall saat diminta.
- Secara bawaan server hanya bisa dibuka dari komputer itu sendiri. Perangkat lain wajib memakai PIN, dan salah PIN berkali-kali dikunci sementara.

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
| `server.js` | Server lokal untuk OBS Browser Source dan remote HP |
| `engine.js` | Logika timer (dapat dites dengan `npm test`) |
| `hotkeys.js` | Daftar aksi dan pengolah pintasan keyboard |
| `preload.js` | Jembatan aman antara jendela dan proses utama |
| `renderer/` | Tampilan kontrol dan output |

## Rencana pengembangan

- [x] V1: dua timer, output bersih, warna peringatan, alarm, hitung mundur bersuara
- [x] V2: rundown segmen berurutan dan overtime
- [x] V3: hotkey kustom (termasuk global) dan alarm dari file sendiri
- [x] V5: mode count-up dan jam digital, pilihan font, output lewat URL lokal untuk OBS Browser Source, remote lewat HP
- [ ] V6: preset, impor/ekspor rundown, laporan waktu
- [ ] V7: tampilan pembicara dan pesan ke panggung
- [ ] Virtual camera

## Lisensi

[MIT](LICENSE)

## Pembuat

Rizky Dwi Karunia Sejati, [@rizkysejati](https://github.com/rizkysejati)
