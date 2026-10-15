# Verification — 15 October 2026 (Asia/Jakarta)

- `npm run build`: passed; strict client TypeScript and production Vite bundle.
- `npm run check`: passed; strict client and Cloudflare Worker TypeScript.
- Initial browser suite: 3 passed. Desktop/mobile layout, graphics quality, landmark navigation, invite link; two independent sessions with presence/chat/meeting lock/kick; health/config/unknown API responses.
- `npm run test:protocol`: passed with 20 simultaneous real WebSocket clients. Verified 21st client rejected with 503, name/session presence, 500-character chat truncation, landmark movement broadcast, unauthorized lock ignored, locked meeting entry denied, distant media signaling denied, host kick, deterministic host succession. This is a protocol smoke test, not a sustained performance/load benchmark.
- Browser screenshot artifacts: `desktop.png` (1440×1000), `mobile.png` (390×844).
- Dependency audit at installation: 0 reported vulnerabilities. Versions pinned and lockfile tracked.
- Cloudflare deployment account check: not authenticated. Full backend deployment has not been performed.
- Sites publication: exploration-only private static preview; status recorded when publication completes.

Not yet verified: Safari, physical phones/tablets, real microphones/cameras across different networks, TURN traversal, sustained 20-avatar frame/bandwidth performance, production Cloudflare WebSocket hibernation behavior, accessibility audit, cost/load/error monitoring. A four-tile UI cap does not limit upstream P2P stream count. See README for release gates and architecture deviations.

- Synthetic WebRTC device test: passed with two independent browsers contexts. Both cameras negotiated, the remote video decoded frames (`videoWidth > 0`), remote audio tracks were live, and muting the sender set the receiver audio volume to zero. This does not replace testing real hardware or TURN across networks.
- A repeated chat assertion initially matched persisted history from an earlier run; test rooms now include a run identifier so tests remain isolated.

- Isolated multiplayer test rerun after room isolation fix: passed. All four browser scenarios have now passed (desktop/mobile UI, multiplayer/host controls, API, synthetic WebRTC).
