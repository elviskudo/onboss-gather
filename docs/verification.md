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

## 16 October 2026 — mosque and connection recovery

- Replaced the entire former religious landmark mesh with an original mosque: a faceted sage-green dome, minaret with balcony, arched openings and gold crescent ornaments. The scene contains no remaining church/spire mesh or cross ornament. Refreshed desktop/mobile screenshots show the mosque.
- Added admission timeout (12 seconds), a single retained connection, cancellation of retired callbacks/timers, bounded retry with jitter, online/offline handling, and a 12-second heartbeat with an 8-second reply deadline. Durable Object native auto-response handles `ping`/`pong` while preserving hibernation support.
- The server welcome packet includes authoritative spawn coordinates. The client resynchronizes its avatar to those coordinates on each admission; reconnect leaves microphone/camera off.
- Strict client/Worker checks and production build passed. Protocol smoke test passed with 20 clients, including native ping/pong and spawn metadata.
- Existing UI, chat/host controls, API and synthetic WebRTC browser scenarios passed again. A real offline/online cycle with two participants passed: retry while offline created no socket, recovery produced one new session, the observer saw two participants, and post-recovery movement was accepted by the server.
- Admission-timeout/backoff and unresponsive-heartbeat browser tests are recorded below once their running checks complete. See `production-readiness.md` for the unchanged full release scope.
- All seven browser scenarios passed in the combined run (2.6 minutes): desktop/mobile scene, two-user social/host controls, API routes, synthetic WebRTC, real offline recovery with authoritative movement, admission timeout/manual retry cancellation, and replacement of a socket that stopped replying to heartbeat.
- An additional retry-budget test covers a server that repeatedly admits then closes a connection. Backoff is reset only after a successful heartbeat reply, rather than on admission alone; the result is recorded after that targeted test completes.

- The flapping-admission test passed: one initial admission plus six retries, then Offline with no orphaned retry timer.
- Corrected a client/server world-envelope mismatch that previously clamped the north path to z=-16 even though the client could walk to z=-24. Both now import the same bounds; the protocol check explicitly exercises movement to z=-23.

- Final protocol rerun passed, including movement to z=-23 under the shared client/server bounds. Desktop and mobile screenshots were visually inspected and both display the new mosque.
- The exploration-preview browser test passed again (11.2 seconds): the refreshed preview screenshot shows the mosque, avatar customization works, media controls remain disabled and no room WebSocket is opened.

## 16 October 2026 — human avatars, interiors and Google login

- Added six original human presets, eyes/nose/ears/hair, articulated walking, live profile/bio/shirt changes, a closer follow camera and direct avatar/profile picking. Rigid human surfaces are merged per material while preserving animated joints.
- Added working space, community hall, lakeside house and creative studio interiors with room-specific audio/meeting membership; outdoor kitchen, river/bridge and animated fountain basin. Shared collision geometry is enforced by client movement and server validation, including trunks, lamps, furniture and kitchen counters.
- Six browser scenarios passed together (2.6 minutes): desktop/mobile UI, two-user chat/locks/kick, APIs, decoded synthetic WebRTC audio/video, live avatar/profile synchronization and isolated building meetings, and unconfigured OAuth error handling.
- Four unit checks passed: 20-camera subscription cap, nearest spatial selection, cross-building audio/video isolation, and collision for trees/lamps/river/furniture.
- Real WebSocket smoke tests passed with 20 connections. A second protocol scenario passed profile changes, per-building locks, blocked cross-building signaling, accepted same-building signaling, and authoritative furniture/lamp collision.
- A separate local Worker with AUTH_REQUIRED=true rejected anonymous and forged-cookie media/socket access and forged OAuth callback state. Wrangler deployment dry-run passed with ROOMS and AUTH bindings.
- Google authorization-code flow uses PKCE, single-use state, nonce and JOSE signature/issuer/audience/expiry verification. AuthStore persists user profiles and hashed sessions; cookies last eight hours. No real Google login has been claimed or tested: owner has not yet created the OAuth Client. Wrangler whoami confirmed the computer is still unauthenticated.
- See cloudflare-google-setup.md for account setup and exact callback/secrets commands. No secrets are committed. Cloudflare production rollout and internet media/network tests remain pending.
- Visual QA found the profile screenshot captured the opening animation at zero opacity. Screenshot capture now disables finite animations so the saved artifact shows the actual dialog; profile controls themselves passed the browser scenario.
- Twenty distinct walkable arrival spots per exterior/interior were verified, so new participants do not start stacked on top of each other. Reconnect still uses the authoritative free spawn supplied by the server.

## 16 October 2026 — smooth cozy village visual update

User narrowed the current work to 3D visuals inspired by the farming-village atmosphere of Harvest Moon. Installed and read threejs-scene-setup, threejs-materials-lighting and create-game-assets from the supplied gamedev-skills repository. Brief and original-asset provenance are in docs/art/.

Replaced faceted foliage and cone mountains with smooth orchard crowns and rolling hills; smoothed mosque domes and round props; added selective bevels to architectural geometry. Five original deterministic sRGB CanvasTextures provide grass, paving, timber grain, clay tiles and plaster detail. Geometry batches now retain UV coordinates. Added vegetable beds, flowers and a cottage fence; increased face detail and expressive head/eye proportions. Reframed the camera to keep the avatar clear of the mosque in the foreground. Existing gameplay collision remains separate from the detailed render geometry.

Strict client/Worker checks and full build passed. The dedicated desktop/mobile visual scenario passed (2.0 minutes), including direct avatar-profile interaction, six preset options, visual customization, landmark navigation, entering/exiting an interior, zero horizontal overflow at 390px, and no captured JavaScript/console errors. Screenshots: cozy-overview.png, cozy-character.png, cozy-village.png, cozy-interior.png and cozy-mobile.png. Native in-app browser inspection also verified the smooth village and crop area; cozy-village.jpg records that view. Automated WebGL screenshots required the Mac Metal backend after software-renderer capture timeouts.

- The final static-preview scenario passed (48.4 seconds): mic/camera remain disabled, no room WebSocket is opened, and the selected female avatar survives reload and is preselected when customization reopens. Mac browser QA now uses Metal; Linux CI retains the software-renderer flags.

## 16 October 2026 — production deployment

- `wrangler login` succeeded for the owner account; `npm run deploy` uploaded the full Worker with static assets, ROOMS and AUTH bindings (version `e0b8d5e0-f53e-48d0-a131-86ac7f3dc4ea`) to https://hallstatt-social.elviskudo.workers.dev.
- From the public domain, `/api/health` and `/api/auth/session` return 200, unknown API routes return 404 JSON, and media/socket routes stay behind the login gate because the hostname is not localhost.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are still missing, so `/api/auth/google` returns 503 until the OAuth Client is created; real Google login, TURN and cross-network media remain unverified.

## 17 October 2026 — visible Sign out

Added Sign out to the top bar (an accessible icon on narrow screens), the top of the owner's profile dialog and settings. It stops local media, leaves the realtime room and, in full mode, calls POST /api/auth/logout before showing success. A failed request leaves the account visibly signed in and reports that logout did not complete. Pending identity requests are aborted to prevent stale profile data from restoring the signed-in UI. Signing out removes the 3D world and presents a clear end-of-session screen with Masuk kembali. Preview mode explicitly ends the local visit without pretending to revoke a Google or ChatGPT session.

Strict checks and full/preview builds passed. Two full-mode browser scenarios passed with mocked account/logout responses (27.0 seconds), covering successful revocation/re-entry and a 503 logout failure. The preview scenario passed (10.5 seconds): mobile header access, no horizontal overflow, profile-menu access, world removal, re-entry and zero auth requests. Screenshot: signout-mobile.png. This does not claim a live Google OAuth integration test.

## 17 October 2026 — active Google sign in

Confirmed GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET exist as Cloudflare Worker secrets; values were not printed or copied into source. Added a reusable Google sign-in button to the anonymous header and required-login dialog. The private static Sites preview links to the full Worker OAuth origin through top-level navigation, preserving the invited room. Missing configuration shows a message without a broken OAuth link; authenticated headers retain Sign out.

Strict checks and full/preview builds passed. Five full-mode browser checks passed (20.5 seconds), covering mobile login visibility/room preservation, missing configuration, real local OAuth redirect with PKCE/state, forged callback rejection, and sign-out success/failure. Session/logout UI cases use mocked account responses; no successful Google identity was fabricated. Production session returned required=true/configured=true/user=null. Production OAuth returned 302 to Google with the correct HTTPS callback, S256 PKCE and an HttpOnly/SameSite=Lax/Secure state cookie. A real browser opened Google's sign-in page without redirect_uri_mismatch, invalid_client or Access blocked. After deployment, clicking the actual production header button navigated to Google Accounts. Completing account selection and consent remains a user action.

Full Worker deployment: https://hallstatt-social.elviskudo.workers.dev, version 0d8d1d98-f117-4cac-8e4b-96b04d516899. Screenshot: google-signin-full-mobile.png. Cross-network audio/video and managed media release gates remain unchanged.

Preview browser checks also passed (2 scenarios, 23.3 seconds): Google login points to the full Cloudflare application and preserves the room, mobile stays within the viewport, and local preview sign out/re-entry still works without auth requests. Screenshot: google-signin-preview-mobile.png.

## 17 October 2026 — dedicated login and founder analytics

Added a standalone /login page before the village. Production index requests redirect unauthenticated visitors to login while preserving the invited room; the client also gates access before importing the 3D module. The first verified Google login registers the account. Sign out returns to login and removes the world/media. Sessions from before verified-email storage require one fresh Google login. Sites preview now serves the same login gateway and directs Google authentication to the full Worker origin.

Founder access is exclusively the server-verified Google email elviskudo@gmail.com. /founder and /api/founder/summary enforce authorization independently of the frontend. The dashboard displays counted visits, cookie-based unique browsers, registered accounts, unique joined accounts, accepted room connections, meeting participations, a seven-day WIB breakdown, account identities/last login/last join, and paginated room-entry history. Persistent SQLite tables in the existing AuthStore record activity from feature activation onward; anonymous visitors use a hashed random cookie and no IP address is stored. A new visit requires a 30-minute inactivity gap; reconnects are new connections and meeting participations are not unique meetings. No historical activity or live production account data is fabricated.

Strict client/Worker checks and full build passed. Three integration scenarios passed (25.8 seconds) against an isolated test Worker: anonymous redirect/no 3D download, ordinary-account access with founder API/page denial and forged-header denial, and real Durable Object counters for deduplicated visits, registered identities, actual WebSocket room admission and meeting participation. The dashboard survives reload and its mobile layout does not overflow. The fixture only seeds local test sessions; it is not in the production Worker entrypoint and does not simulate a successful real Google token exchange. Five updated OAuth/sign-out browser checks passed (22.4 seconds), including missing config and failed logout. Screenshots: login-desktop.png, login-mobile.png, founder-desktop.png and founder-mobile.png; founder screenshots show isolated synthetic test records, not real production users. The login art was captured from the original 3D canvas with interface overlays hidden.

The additional founder pagination/revocation scenario passed (1.9 seconds): seeded more than 25 isolated accounts, verified disjoint bounded result pages, rejected a cross-origin visit request, revoked the founder session and confirmed the summary API returned 401. Live production checks confirmed index and founder redirects (302, no-store) and anonymous summary denial (401, no-store). A fresh live browser verified desktop/mobile login layout, room preservation, no village/Three.js download before login, no horizontal overflow, and navigation from the login page to Google Accounts. Final full Worker version: fdd362f2-1bc8-4041-b27c-4f69fceeca8f. Screenshots: login-live-desktop.png and login-live-mobile.png.

Three static-preview browser scenarios passed (9.0 seconds): dedicated login, preserved invitation room, full-Worker Google navigation target, and zero local auth/API/WebSocket/3D activity before login. Four full-mode-only checks were intentionally skipped for this preview build.

## 17 October 2026 — shared room invitations and automatic admission

Diagnosed a missing connection step: the authenticated village opened in local exploration and did not call room.join until a separate form submission. Added automatic multiplayer admission for authenticated users, using their saved identity/profile and the room from the invitation. Effect cleanup leaves the socket on unmount and supports React Strict Mode. Explicit Leave remains intentional; mic/camera are not automatically enabled.

Invitations now use stable /rooms/ROOM_ID URLs. A shared parser resolves room paths and legacy ?room= links identically on client and server, validates the whole ID, preserves the room through login, and sends the OAuth callback back to the canonical room. Invite friends copies that address and the breadcrumb identifies the current room. Room identity remains independent of the Google account/session; different room IDs remain separate Durable Objects.

Strict checks and full build passed. Authenticated integration scenarios passed for two separate accounts: opening a copied room invitation while logged out, preserving its target at login, automatically connecting both users, mutual participant visibility and chat delivery, isolation from another room, returning to the same room after reload without a duplicate participant, and legacy/canonical invitation compatibility (two scenarios, 22.9 seconds). Founder counter, pagination/revocation and login-gate scenarios passed; the ordinary-account scenario was updated to assert automatic Connected status instead of the former Enter village button and passed separately (3.7 seconds). These use isolated local test sessions to replace only Google's identity step; production Google account consent was not impersonated. Screenshots: shared-room-owner.png and shared-room-guest.png.

Full Worker version 89cecdb5-8a58-4c83-8eee-dfcc941c4f92 was deployed. Live anonymous checks confirmed /rooms/hallstatt-village and /rooms/invite-check redirect to login with the same room preserved. Simultaneous account testing requires separate browser profiles or devices because a browser profile shares its login cookie across tabs.

The updated static-preview gateway scenarios passed (3 scenarios, 7.2 seconds), including a /rooms/team-preview invitation. A failed preview launch was corrected by restoring the preview-mode build and using the Worker preview instead of a self-proxying Vite preview; no failed result was treated as verification.

## 17 October 2026 — avatar visibility, collision and house collaboration

Found two asynchronous state races: simultaneous room admissions could calculate the same spawn/host before awaiting analytics, and an area-change message could be overtaken by the next message while authentication was being checked. Admission and socket event mutations now run sequentially within the Room. Added shared swept body collision (1.05 units), server position corrections, and safe free-position relocation; legacy overlaps can separate instead of becoming stuck. Added visible participant location and a profile Temui action that locates a friend across areas.

Added contextual E interaction, explicit microphone activation for proximity chat invitations, accepted/declined meeting invitations to the four existing houses, six reserved seats per house, synchronized seated animation with bent knees, stand-up controls, and shared per-house whiteboards. Board writes validate normalized stroke data and author identity, commit transactionally, remain scoped to the sender's current house, persist in Room storage, and are bounded to 100,000 encoded bytes. Host clear requires confirmation and a matching revision. The 3D board surface shows the same content. Remote muted video previews no longer label the remote participant as you.

Strict client/Worker checks, full build, three collision checks and three media-policy checks passed. Eight account/room/social protocol scenarios passed in the broader fixture run; the combined UI scenario was then corrected to exit a house before re-entering it and passed separately. Its final run passed again (8.8 seconds) after adding cross-house Temui verification and long-stroke sampling. It checks mutual in-world avatar labels, E interaction, accepted proximity voice with a live synthetic remote audio track, declined and accepted house invitations, two seated avatars, shared note and stroke delivery, mobile overflow, standing up, persisted content after leaving/re-entering, and locating a friend in another area. Fixtures replace only Google identity setup; no real user's Google session is impersonated.

Concurrent admission testing used eight authenticated sessions and confirmed unique spawn positions, one host, and server rejection of avatar overlap. Whiteboard protocol checks confirmed merged edits from two participants, malformed-stroke rejection, denied non-host clear, isolation of all four houses, and content persistence after reconnect. Existing 20-socket capacity/presence/chat/navigation/host/lock/kick checks and building-profile/media-isolation/environment-collision protocol checks passed. This does not certify 20-user media performance or cross-network audio. Screenshots social-seated.png, social-whiteboard.png and social-board-mobile.png were visually inspected.

Full Cloudflare Worker deployed with existing ROOMS/AUTH bindings, version 577fdb0f-5345-40aa-9c4a-297a33e65e9c. Both browsers must refresh to load the updated client and recreate old connections. The authenticated interaction tests ran on an isolated local Worker, including synthetic microphone tracks; cross-network/per-device production voice has not yet been verified.

Live checks confirmed health 200, preservation of hallstatt-village through the 302 login redirect, the new production client entrypoint, and rejection of an anonymous WebSocket with 401. Three preview gateway checks passed (10.0 seconds), with four full-mode-only checks intentionally skipped. Preview still requires the separate Google login path and does not start a local world, API session or room socket before login.
