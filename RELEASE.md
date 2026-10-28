# RELEASE — Hallstatt Social

## Pembaruan 28 Oktober 2026 — share screen dan papan tulis bersama

Pembaruan ini mempertahankan versi paket `1.0.0`. Versi deployment Cloudflare dicatat terpisah di riwayat deployment.

### Isi pembaruan

- Share screen untuk peserta dalam percakapan dekat atau meeting yang sama. Di rumah, tombol berada di antara **Duduk & meeting / Bangun** dan **Papan tulis**, lalu berubah menjadi **Stop sharing** saat aktif.
- Pemilih browser menawarkan seluruh layar, jendela, atau tab Chrome, termasuk tab aplikasi saat ini. Kamera dan layar memakai track serta tampilan terpisah; tersedia preview lokal, pemilih beberapa layar, minimize dan fullscreen. Audio sistem tidak ditangkap; percakapan tetap memakai mic.
- Capture berhenti saat dihentikan lewat aplikasi/browser, pindah area/channel, keluar, terputus, atau peserta terakhir meninggalkan percakapan. Hasil pemilih layar yang terlambat setelah sesi berakhir langsung dihentikan.
- Papan tulis persisten tersedia di desa dan tiap rumah. Undangan berbagi berlaku 30 detik untuk peserta dalam percakapan/meeting yang sama; penerima memilih membuka papan. Konten dibagi per area, dengan edit bersama dan pembersihan oleh host atau founder melalui konfirmasi.
- Signaling kamera/layar memiliki batas 64 KiB; pesan biasa tetap 16 KiB. Penggunaan ulang sender dan serialisasi signaling menjaga berbagi berulang serta pemulihan koneksi.
- Navigasi dan kontrol percakapan tetap dapat diakses ketika layar dibagikan; empat tombol interaksi muat pada lebar 390px.

### Bukti verifikasi

- Type check klien/Worker, build produksi, dan tiga pengujian kebijakan media lulus.
- Lima skenario integrasi share screen lulus bersama dalam 39,9 detik, termasuk dua layar meeting dengan mic aktif, decoding video remote, pembatalan capture, urutan tombol, layout 390px, undangan/edit papan desa, serta batas pesan.
- Tujuh skenario gabungan sebelumnya lulus dalam 34 detik, termasuk audio setelah reconnect dengan avatar tetap dan regresi persistensi/isolasi papan rumah.
- Screenshot mobile layar bersama dan bilah interaksi sudah diperiksa. Bukti dan batas pengujian ada di [docs/verification.md](docs/verification.md).
- Pemilih layar sistem diganti stream canvas pada tes; WebSocket dan WebRTC tetap nyata. Pemilih native, perangkat fisik, dan media lintas jaringan/TURN belum diverifikasi.

### Status produksi

Pembaruan sudah tersedia di https://hallstatt-social.elviskudo.workers.dev. Pemeriksaan publik memastikan health 200, login Google wajib dan terkonfigurasi, serta bundle aplikasi dan CSS terbaru cocok dengan build lokal. Semua peserta perlu memuat ulang tab setelah deployment. Preview Sites tetap hanya eksplorasi statis; gunakan URL Cloudflare untuk multiplayer dan media.

## Riwayat deployment terbaru

| Tanggal | Lingkungan | Versi Cloudflare | Perubahan |
| ------- | ---------- | ---------------- | --------- |
| 28 Okt 2026 | produksi | d7c668a2-8008-4af6-b7c8-4082a4f67c93 | Deployment ulang fitur share screen/papan bersama; dokumentasi rilis diperbarui |
| 28 Okt 2026 | produksi | e50a0ca6-dd5a-454a-b685-ef294fc642b4 | Share screen, tombol interaksi rumah, dan undangan papan desa |
| 18 Okt 2026 | produksi | 90d4cce3-ab88-4371-a79b-06a56d4890ec | Bangunan Harvest Farm 3D |

Semua versi di tabel ini memakai https://hallstatt-social.elviskudo.workers.dev dan binding Durable Object ROOMS/AUTH yang sama. Catatan 16 Oktober berikut merupakan arsip rilis awal; konfigurasi OAuth produksi sudah terpasang pada deployment terbaru.

## 1.0.0 — 16 Oktober 2026

Rilis pertama yang berisi seluruh MVP web: dunia sosial 3D, realtime, media, dan login.

### Isi rilis

- Enam avatar manusia asli dengan animasi sendi, profil yang bisa diklik, kamera dekat mengikuti avatar, dan perubahan baju/profil tersinkron antar klien.
- Empat interior cutaway (working space, community hall, lakeside house, creative studio) dengan audio dan meeting terisolasi per interior; dapur terbuka, sungai berjembatan, dan air mancur animasi.
- Desa cozy bergaya pertanian: mahkota pohon halus, perbukitan lembut, lima tekstur prosedural asli, kebun sayur dan bunga, pagar cottage, serta masjid tepi danau dengan kubah, menara, dan ornamen bulan sabit.
- Login Google OpenID Connect (authorization code + PKCE), sesi HttpOnly 8 jam, profil permanen di AuthStore Durable Object; di domain deployment multiplayer/media wajib login.
- Pemulihan koneksi: satu socket aktif, timeout admission 12 detik, backoff terbatas, retry manual, respons online/offline, heartbeat native Durable Object, dan spawn otoritatif ulang setelah reconnect.
- Kebijakan media: maksimal tiga kamera remote per penerima, audio jarak 12 unit, channel grup untuk meeting, sender menutup peer di luar jangkauan/channel.
- Collision klien sekaligus server untuk bangunan, pohon, lampu, furnitur, dapur, dan tepi air; 20 titik arrival tersebar agar peserta baru tidak bertumpuk.
- Batas 20 presence, riwayat 60 pesan, rate limit 35 pesan/detik, validasi input, CSP dan header keamanan, PWA manifest + service worker.

Detail teknis ada di [README.md](README.md).

### Bukti verifikasi

- `npm run check` dan `npm run build` lulus (TypeScript ketat klien + Worker, bundle produksi).
- `npm run test:protocol` lulus dengan 20 klien WebSocket serentak: gerbang presence, chat, lock per interior, spawn otoritatif, dan ping/pong native.
- Uji unit lulus: kebijakan 20 kamera, seleksi terdekat, isolasi audio/video antar bangunan, collision.
- Skenario browser Playwright lulus: desktop/mobile, dua pemain (chat/host/lock/kick), API, WebRTC sintetis, sinkronisasi avatar/profil, isolasi meeting, offline/online recovery, timeout admission, heartbeat macet, dan preview statis.
- Catatan harian: [docs/verification.md](docs/verification.md).

### Gerbang yang belum terpenuhi

- OAuth Client Google belum dibuat, sehingga login Google sungguhan belum pernah diuji → [docs/cloudflare-google-setup.md](docs/cloudflare-google-setup.md).
- Belum ada SFU/RealtimeKit, token admission anti-abuse, peran host permanen, moderasi/retensi, D1 dan R2.
- Belum diuji: Safari/iOS/Android, perangkat fisik, TURN lintas jaringan, load test 20 avatar, monitoring/biaya/rollback.
- Audit lengkap: [docs/production-readiness.md](docs/production-readiness.md).

### Rilis ke Cloudflare

```sh
npx wrangler login
npm run check && npm test
npm run deploy
npx wrangler tail
```

`npm run deploy` membangun mode penuh lalu menerapkan Worker, static assets, dan migrasi Durable Object ROOMS/AUTH. Jangan deploy hasil `npm run build:preview`; build tersebut mematikan koneksi realtime. Secrets: `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` wajib agar login berfungsi di domain publik; `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL` opsional.

### Riwayat deployment

| Tanggal     | Lingkungan | URL                                            | Versi                                |
| ----------- | ---------- | ---------------------------------------------- | ------------------------------------ |
| 16 Okt 2026 | produksi   | https://hallstatt-social.elviskudo.workers.dev | e0b8d5e0-f53e-48d0-a131-86ac7f3dc4ea |

Catatan deployment: `/api/health` membalas 200 dan gate login aktif karena hostname bukan localhost. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` belum dipasang sebagai Wrangler secrets, sehingga `/api/auth/google` membalas 503 sampai OAuth Client dibuat mengikuti [docs/cloudflare-google-setup.md](docs/cloudflare-google-setup.md).
