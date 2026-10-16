# RELEASE — Hallstatt Social

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
