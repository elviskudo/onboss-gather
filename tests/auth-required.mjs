import WebSocket from "ws";
import assert from "node:assert/strict";
const origin = "http://127.0.0.1:8788";
const session = await fetch(origin + "/api/auth/session").then((r) => r.json());
assert.equal(session.required, true);
assert.equal(session.configured, false);
assert.equal(session.user, null);
for (const headers of [
  {},
  {
    Cookie: "hallstatt_session=forged",
    "X-User-Id": "google:forged",
    "X-Session-Expires": String(Date.now() + 3600000),
  },
]) {
  assert.equal(
    (await fetch(origin + "/api/media-config", { headers })).status,
    401,
  );
  const status = await new Promise((resolve, reject) => {
    const ws = new WebSocket(
      origin.replace("http", "ws") + "/api/rooms/auth-test/socket",
      { origin, headers },
    );
    ws.on("unexpected-response", (_, res) => {
      res.resume();
      resolve(res.statusCode);
      ws.terminate();
    });
    ws.on("open", () => {
      ws.close();
      reject(new Error("unauthorized connection accepted"));
    });
    ws.on("error", () => {});
    setTimeout(() => reject(new Error("timeout")), 5000).unref();
  });
  assert.equal(status, 401);
}
assert.equal(
  (await fetch(origin + "/api/auth/callback?state=forged&code=forged")).status,
  400,
);
console.log(
  "PASS: required Google authentication rejects anonymous and forged-cookie media/socket access; callback rejects forged state.",
);
