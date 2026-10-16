# Hallstatt Social

Dunia sosial 3D alpine dengan UI premium, geometri orisinal, avatar, chat realtime, proximity audio, dan meeting kecil.

Rilis, bukti verifikasi, dan gerbang yang belum terpenuhi: [RELEASE.md](RELEASE.md).

## Menjalankan

Node 22.12+ (diverifikasi dengan Node 26), npm, dan Chrome.

```sh
npm ci
npm run dev:full
```

Buka http://localhost:8787. Dua tab dengan URL ruang yang sama akan bertemu. Pengguna pertama menjadi host. Mic/kamera selalu dimulai dalam keadaan mati. Untuk hot reload frontend, jalankan `npm run dev` pada terminal lain; Vite meneruskan `/api` ke Worker lokal.

```sh
npm run check
npm run build
npm test
```

Pengujian menggunakan Chrome di macOS. Di Linux/CI, atur `CHROME_PATH` atau gunakan executable Chromium yang dipasang Playwright. Tes menjalankan Worker lokal bila belum aktif. `npm run build:preview` menghasilkan preview statis yang secara eksplisit menonaktifkan koneksi ruang; jangan gunakan build tersebut untuk deployment realtime.

## Implementasi saat ini

- Enam avatar manusia berwajah dengan animasi sendi (cowok, cewek, anak, remaja, dewasa, orang tua), profil yang bisa diklik, warna baju dan kamera dekat mengikuti avatar.
- Empat interior cutaway: working space, community hall, lakeside house, creative studio; meeting dan lock dipisahkan per interior. Dapur terbuka, sungai berjembatan dan kolam dengan semburan air mancur animasi. Collision bangunan, pohon, lampu, dapur dan furnitur berlaku di klien serta server.
- Google OpenID Connect authorization code + PKCE, verifikasi JWKS, sesi HttpOnly 8 jam, serta profil permanen dalam AuthStore Durable Object. Di domain deployment, akses multiplayer/media wajib login; anonim hanya di localhost untuk pengujian. Login Google sungguhan belum diuji sebelum OAuth Client tersedia.
- Desa 3D halus bergaya desa pertanian hangat dengan masjid tepi danau, kubah, menara, serta ornamen bulan sabit sesuai preferensi pengguna.
- Lima tekstur prosedural asli (rumput, batu, kayu, genteng, plester), kanopi kebun membulat, perbukitan lembut, kebun sayur dan bunga; brief visual/provenance di `docs/art/`.
- React + TypeScript untuk UI; Three.js untuk dunia 3D. Material dibagi dan geometri statis digabung untuk mengurangi draw call; render idle dibatasi.
- Worker TypeScript + satu SQLite-backed Durable Object per ruang, WebSocket hibernation, attachment untuk presence, riwayat 60 pesan terakhir persisten.
- Native WebRTC untuk audio/video peer-to-peer, perfect negotiation, koneksi ulang ICE, mic/camera opt-in. Audio dipudarkan berdasarkan jarak 12 unit, dan meeting memakai channel grup. Sender menutup peer ketika peserta keluar dari jangkauan/channel.
- Host pertama: lock/unlock meeting dan kick. Host dialihkan ke peserta tersisa saat host keluar. Ini peran sesi sementara, bukan kepemilikan akun permanen.
- Batas presence 20. Empat tile video maksimum pada meeting. Setiap penerima berlangganan maksimum tiga kamera remote melalui kebijakan sender, ditambah satu preview lokal. Video di luar seleksi tidak ditambahkan ke peer sender. Audio masih P2P dan belum memakai SFU; target 20 avatar bukan jaminan 20 kamera.
- WASD/panah, klik tanah, navigasi landmark, orbit/zoom, kontrol sentuh, kualitas grafis ringan, layout responsif.
- PWA manifest dan service worker dengan halaman offline; sesi sosial membutuhkan koneksi. Aplikasi belum menyimpan seluruh shell untuk penggunaan offline.
- Pemulihan koneksi memakai satu socket aktif, timeout admission 12 detik, backoff terbatas, retry manual yang membatalkan timer lama, dan respons online/offline browser. Heartbeat native Durable Object memeriksa sambungan macet tanpa membangunkan ruang idle. Setelah reconnect, posisi diselaraskan ke spawn server dan media kembali mati.
- Validasi nama/room/message/position, batas 16 KiB pesan, rate limit per sesi 35 pesan/detik, same-origin WebSocket, CSP dan header keamanan.

## Deployment penuh ke Cloudflare

```sh
npx wrangler login
npm run deploy
```

`wrangler.jsonc` mendefinisikan Worker, static assets, binding ROOMS/AUTH, dan migrasi Durable Object. Jangan deploy build preview; `npm run deploy` membangun ulang mode penuh. Gunakan HTTPS untuk media dan undangan antarperangkat. `npx wrangler tail` untuk diagnosis. Kunci versi ada pada package-lock.json.

Deployment produksi berjalan di https://hallstatt-social.elviskudo.workers.dev; riwayat versi ada di [RELEASE.md](RELEASE.md). Multiplayer/media di domain ini wajib login Google, jadi pasang secrets OAuth sebelum mengundang pengguna.

Panduan konfigurasi Google lengkap: [docs/cloudflare-google-setup.md](docs/cloudflare-google-setup.md). Pasang GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET sebagai Wrangler secrets setelah membuat OAuth Client Web Application dengan callback `/api/auth/callback`.

TURN opsional untuk uji jaringan, dibutuhkan untuk cakupan konektivitas produksi:

```sh
npx wrangler secret put TURN_URL
npx wrangler secret put TURN_USERNAME
npx wrangler secret put TURN_CREDENTIAL
```

Gunakan kredensial TURN dengan TTL singkat dan scope terbatas. Implementasi sekarang mengembalikan konfigurasi TURN ke browser sebagaimana WebRTC memerlukannya; jangan memakai secret permanen bernilai tinggi. Endpoint ini belum memiliki issuer token per pengguna. Untuk publikasi skala produksi, gunakan penerbitan kredensial ephemeral dan media terkelola.

## Perbedaan terhadap PRD dan status rilis

Ini implementasi MVP web fungsional, **belum sertifikasi production-ready penuh**. PRD merekomendasikan Bevy/Rust, workers-rs, D1, R2, dan RealtimeKit. Versi ini memakai TypeScript/Three.js agar pengalaman browser dan realtime dapat diverifikasi dalam satu proyek. Tidak ada Bevy/WASM atau Rust API yang diklaim sudah selesai. Tidak ada integrasi RealtimeKit palsu, akun demo palsu, atau peserta contoh.

D1/R2 tidak diperlukan untuk geometri buatan kode dan sesi sementara saat ini. Identitas login Google dan profil sudah diimplementasikan dalam Durable Object, tetapi katalog ruang, konfigurasi lintas ruang, dan kepemilikan host permanen belum diimplementasikan. Riwayat chat memakai storage Durable Object, bukan D1. Untuk produk multi-tenant sesuai PRD, selesaikan konfigurasi/uji OAuth Google, token undangan/ruang yang tidak dapat ditebak, peran host permanen, D1 migrations dan kebijakan retensi. URL ruang saat ini bersifat shared-link di antara pengguna login, dan ruang default dapat ditebak. Kick berlaku pada sesi, bukan ban identitas.

Sebelum peluncuran publik:

1. Login/deploy ke akun Cloudflare pemilik, verifikasi WebSocket di domain HTTPS final.
2. Integrasikan SFU/RealtimeKit dengan token server, subscription audio/video terbatas, dan otorisasi proximity/meeting pada provider. WebRTC P2P saat ini untuk pilot kecil; peer dari klien modifikasi tidak boleh dianggap sebagai boundary privasi yang sudah diaudit.
3. Implementasikan token masuk yang tervalidasi, rate limit handshake lintas sesi/IP, moderasi/retensi, kepemilikan host permanen, serta proteksi penyalahgunaan biaya.
4. Uji audio/video di Safari/iOS/Android, izin perangkat, autoplay recovery, jaringan berbeda/NAT/TURN, reconnect, dan pergantian perangkat.
5. Jalankan load test 20 avatar dengan batas video; ukur frame time, memori, bandwidth, participant-minutes dan biaya.
6. Konfigurasi error monitoring, alert, anggaran Cloudflare, prosedur rollback, backup/retensi dan privacy notice.

Preview Sites bersifat privat dan hanya eksplorasi statis; frontend preview tidak mengklaim bahwa backend realtime telah dipublikasikan. Backend lengkap harus dideploy melalui Wrangler.

## Struktur

- `src/World.tsx`: scene, batch geometri, avatar, kamera, collision/input.
- `src/App.tsx`: UI, dialog, chat, meeting dan host controls.
- `src/useRoom.ts`: WebSocket, presence, reconnect dan signaling.
- `src/useMedia.ts`: media devices dan koneksi WebRTC.
- `server/index.ts`: Worker routing dan Durable Object.
- `server/auth.ts`: Google login, verifikasi token, sesi dan profil persisten.
- `shared/spaces.ts`: preset avatar, interior, collision dan batas channel audio.
- `tests/app.spec.ts`: alur browser desktop/mobile dan dua peserta.
- `tests/*.spec.ts`, `tests/*.mjs`: skenario browser, protokol 20 koneksi, kebijakan media, collision dan autentikasi.
- `RELEASE.md`: catatan rilis, bukti verifikasi dan gerbang rilis.
- `docs/`: bukti visual dan hasil verifikasi.

Semua geometri desa dibuat sendiri. Font DM Sans dan Manrope didistribusikan melalui Fontsource dengan lisensi OFL; lihat `node_modules/@fontsource/*/LICENSE`. Ikon Lucide berlisensi ISC. Tidak ada aset, nama produk, atau logo Gather.town yang digunakan.
