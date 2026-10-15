# Verification — 15 October 2026 (Asia/Jakarta)

- `npm run build`: passed; strict client TypeScript and production Vite bundle.
- `npm run check`: passed; strict client and Cloudflare Worker TypeScript.
- Initial browser suite: 3 passed. Desktop/mobile layout, graphics quality, landmark navigation, invite link; two independent sessions with presence/chat/meeting lock/kick; health/config/unknown API responses.
- `npm run test:protocol`: passed with 20 simultaneous real WebSocket clients. Verified 21st client rejected with 503, name/session presence, 500-character chat truncation, landmark movement broadcast, unauthorized lock ignored, locked meeting entry denied, distant media signaling denied, host kick, deterministic host succession. This is a protocol smoke test, not a sustained performance/load benchmark.
- Browser screenshot artifacts: `desktop.png` (1440×1000), `mobile.png` (390×844).
- Dependency audit at installation: 0 reported vulnerabilities. Versions pinned and lockfile tracked.
- Cloudflare deployment account check: not authenticated. Full backend deployment has not been performed.
- Sites publication: exploration-only private static preview; status recorded when publication completes.

Not yet verified: Safari, physical phones/tablets, real microphones/cameras across different networks, TURN traversal, sustained 20-avatar frame/bandwidth performance, production Cloudflare WebSocket hibernation behavior, accessibility audit, cost/load/error monitoring. Receiver video subscriptions are capped at three remote cameras by sender track reconciliation; audio and upstream fanout still use P2P and require a sustained bandwidth test. See README for release gates and architecture deviations.

- Synthetic WebRTC device test: passed with two independent browsers contexts. Both cameras negotiated, the remote video decoded frames (`videoWidth > 0`), remote audio tracks were live, and muting the sender set the receiver audio volume to zero. This does not replace testing real hardware or TURN across networks.
- A repeated chat assertion initially matched persisted history from an earlier run; test rooms now include a run identifier so tests remain isolated.

- Isolated multiplayer test rerun after room isolation fix: passed. All four browser scenarios have now passed (desktop/mobile UI, multiplayer/host controls, API, synthetic WebRTC).

- Added bounded camera subscription policy (three remote cameras per receiver), matching displayed tiles. Unit scenarios cover a twenty-camera meeting, nearest-camera selection, muted cameras and meeting isolation. The policy does not substitute for SFU load testing.

- After the subscription-cap change, the synthetic WebRTC browser scenario passed again (42.1 seconds). Both remote video and audio remained functional with sender-side track reconciliation.
- Private Sites deployment succeeded at https://hallstatt-social-village.awarecarp4097.chatgpt.site (exploration-only build).

- Exploration-preview browser scenario passed: camera and microphone controls are disabled, avatar customization works, and zero WebSocket connections are opened. Preview screenshot: `preview.png`.
- Final protocol rerun also passed oversized-message rejection (close code 1009).
