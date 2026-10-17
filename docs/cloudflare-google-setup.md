# Cloudflare + Google login

Aplikasi lengkap diterbitkan di https://hallstatt-social.elviskudo.workers.dev pada 17 Oktober 2026. Secret Google sudah tersedia di Worker. Endpoint session melaporkan konfigurasi aktif dan endpoint login mengarahkan ke Google dengan PKCE serta cookie state aman. Login sampai selesai dengan akun pengguna masih perlu dicoba pengguna.

## 1. Login Cloudflare

Di terminal proyek ini:

```sh
cd /Users/elviskudo/Sites/onboss-gather
npx wrangler login
npx wrangler whoami
```

Gunakan akun Cloudflare yang akan memiliki aplikasinya. Durable Object `Room` dan `AuthStore` dibuat melalui migrasi `v1`/`v2` saat deployment. Jangan menghapus migrasi yang pernah diterapkan.

## 2. Dapatkan domain aplikasi

```sh
npm run check
npm run deploy
```

Wrangler menampilkan URL Worker. Pada domain deployment, multiplayer secara otomatis wajib login Google. Sebelum OAuth dikonfigurasi, aplikasi tetap dapat dijelajahi, tetapi akses room dan media ditolak. Ini disengaja agar aplikasi publik tidak menerima sesi anonim.

## 3. Buat OAuth Client Google

Di [Google Cloud Console](https://console.cloud.google.com/), buat/pilih project, lalu buka **Google Auth Platform**:

1. **Branding**: isi nama aplikasi, email dukungan dan kontak pemilik.
2. **Audience**: pilih audience yang sesuai. Selama status Testing, tambahkan akun Google penguji sebagai test users.
3. **Data Access**: aplikasi hanya meminta `openid`, `email`, `profile`.
4. **Clients → Create client → Web application**.
5. Tambahkan **Authorized redirect URI** dengan domain persis hasil deployment: `https://hallstatt-social.elviskudo.workers.dev/api/auth/callback`. Untuk custom domain, daftarkan callback domain tersebut juga. Jangan menambahkan slash setelah `callback`.
6. Simpan Client ID dan Client Secret melalui perintah berikut. Masukkan nilainya di prompt terminal, jangan di source code, screenshot, atau chat:

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Konfigurasi lokal opsional menggunakan `.dev.vars` yang diabaikan Git. Set `AUTH_REQUIRED=true` untuk menguji keharusan login di localhost. Callback localhost harus didaftarkan tersendiri bila dipakai.

## 4. Verifikasi deployment

Buka domain Worker → halaman /login → Sign in with Google → pilih akun → masuk desa. Login Google pertama otomatis mendaftarkan akun. Buka browser/profil kedua dengan akun Google lain dan room undangan yang sama. Pastikan:

- Kedua peserta muncul dan bergerak secara realtime; perubahan profil terlihat di browser lain.
- Pilihan avatar dan warna tersimpan; setelah login kembali, profil dipulihkan.
- Masuk working space/hall, mulai meeting di ruangan yang sama, lalu nyalakan kamera dan mic.
- Browser pada ruangan berbeda tidak menerima audio/video meeting tersebut.
- Sign out mengakhiri sesi; endpoint socket tanpa cookie login ditolak.

Login memakai authorization code, PKCE, state sekali pakai, nonce, verifikasi tanda tangan JWKS Google, issuer, audience, masa berlaku token dan email verified. Sesi aplikasi 8 jam memakai cookie HttpOnly/SameSite=Lax/Secure pada HTTPS. Hanya hash token sesi dan profil dasar tersimpan di Durable Object; access token dan ID token Google tidak disimpan.

## Batas rilis yang masih berlaku

Voice/video saat ini native WebRTC P2P dengan maksimum tiga video remote per pengguna. Uji dua browser lokal tidak membuktikan koneksi lintas jaringan. Untuk rilis internet perlu konfigurasi TURN yang sesuai atau integrasi RealtimeKit serta pengujian perangkat/jaringan nyata. Kode sekarang Three.js/TypeScript; migrasi Rust/Bevy, D1 dan managed media dalam PRD awal masih terbuka. Preview privat Sites hanya eksplorasi, bukan deployment multiplayer Cloudflare.

Referensi: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/general/), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

Tombol **Sign in with Google** tersedia di header dan dialog masuk. Preview Sites mengarah ke OAuth di domain Worker melalui navigasi penuh agar cookie sesi tetap di domain aplikasi lengkap. Jangan memakai callback domain preview Sites untuk OAuth Worker.

## Halaman login dan dashboard founder

Pengunjung belum login diarahkan ke `/login` sebelum index/3D dimuat. Room undangan diteruskan melalui login. Setelah Google memverifikasi identitas, akun didaftarkan dan diarahkan ke index desa. Sign out kembali ke halaman login.

Dashboard `/founder` dan API `/api/founder/summary` hanya dapat diakses akun Google terverifikasi `elviskudo@gmail.com`. Flag founder berasal dari email hasil verifikasi token Google di server, bukan dari nama profil, localStorage, parameter URL atau header browser. Sesi lama yang belum menyimpan email terverifikasi perlu login ulang sekali.

Statistik tersimpan di SQLite dalam AuthStore yang sudah ada: jumlah sesi kunjungan (jeda 30 menit), browser unik berdasarkan cookie acak HttpOnly, akun terdaftar, akun unik yang pernah bergabung, total koneksi ruang yang diterima, dan partisipasi meeting. Nama, email, waktu login serta riwayat masuk ruang hanya dikembalikan melalui API founder. Tidak menyimpan alamat IP atau identitas pengunjung anonim. Reconnect dihitung sebagai koneksi baru; partisipasi meeting bukan jumlah meeting unik. Ringkasan harian menggunakan WIB dan daftar pengguna/riwayat memakai halaman 25 baris.

Pencatatan dimulai saat fitur diterbitkan, tanpa mengarang data historis. Akun lama tercatat saat login ulang. Pengunjung yang menghapus cookie atau memakai browser lain dapat dihitung sebagai browser unik baru. Preview Sites sekarang menjadi halaman login yang menuju aplikasi lengkap Cloudflare.

Jalankan `npm run test:founder` untuk uji integrasi dengan entrypoint fixture lokal terisolasi. Fixture `/__test/login` hanya ada dalam `tests/fixtures/founder-worker.ts`; tidak dipakai konfigurasi atau bundle produksi.

## Undangan room bersama

Undangan memakai alamat tetap `/rooms/ROOM_ID` (contoh `/rooms/hallstatt-village`), bukan ID pengguna atau sesi login. Link tersebut membawa room yang sama melewati pengalihan login dan callback OAuth. Link lama `/?room=ROOM_ID` tetap didukung. Parser room dipakai bersama oleh klien dan server, dengan validasi seluruh ID.

Setelah login, akun otomatis tersambung ke multiplayer pada room tujuan; mic dan kamera tetap mengikuti pilihan pengguna. Invite friends menyalin alamat room tersebut. Room lain memakai Durable Object lain, sehingga peserta dan chat terpisah. Untuk menguji dua akun bersamaan, gunakan dua browser/profil atau perangkat dengan cookie terpisah; mengganti akun secara bergantian dalam satu sesi browser bukan dua peserta yang hadir bersamaan.

## Interaksi sosial, kursi, dan papan tulis

Masuk room yang sama lalu gunakan **People → profil → Temui** untuk mendekati teman, termasuk jika ia berada di rumah lain. Daftar peserta menunjukkan lokasi/keadaan duduk. Admission, pesan WebSocket dan perpindahan state diproses berurutan agar dua orang yang masuk bersamaan memperoleh posisi berbeda serta satu host. Collision tubuh memakai jarak minimum 1,05 unit dan pemeriksaan lintasan pada klien/server; snapshot server mengoreksi gerak yang ditolak.

**E** membuka interaksi dengan teman yang dekat (radius percakapan 12 unit), atau membangunkan avatar yang sedang duduk. Pilihan **Ajak ngobrol & nyalakan mic** meminta izin mic browser; teman dapat menerima/menolak. Audio proximity memakai aturan jarak dan rumah yang sudah ada. Jangan menganggap percakapan proximity sebagai percakapan privat dua orang: peserta lain yang dekat dan berada di area/audio space yang sama juga dapat mendengar.

Ajakan meeting memilih salah satu dari empat rumah. Setelah penerima menyetujui, kedua peserta masuk rumah yang sama dan menggunakan kursi yang tersedia. Ada enam kursi per rumah; peserta lain dapat berdiri dalam meeting jika kursi penuh. Tombol **Duduk & meeting** dan **Bangun** tersedia dalam rumah. Mic mengikuti pilihan pengguna dan tidak diaktifkan otomatis hanya karena menerima ajakan meeting.

Setiap rumah memiliki papan tulis terpisah yang bisa dibuka lewat tombol atau permukaan papan di 3D. Coretan dan catatan tersimpan di Room Durable Object, disinkronkan ke peserta di rumah tersebut, dan dibaca kembali saat masuk/reconnect. Host dapat membersihkan papan melalui konfirmasi dengan pemeriksaan revisi agar perubahan baru tidak terhapus tanpa diperiksa. Maksimum 128 titik per coretan (coretan panjang dipadatkan), 300 coretan, 40 catatan, dan total data papan 100.000 byte. Tidak ada endpoint pengujian yang dideploy.

Voice diuji menggunakan mic sintetis di dua browser lokal. Koneksi suara lintas jaringan/perangkat nyata masih memerlukan verifikasi; status TURN/managed media pada batas rilis sebelumnya tetap berlaku.
