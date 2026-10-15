import WebSocket from "ws";
import assert from "node:assert/strict";
const origin = "http://127.0.0.1:8787",
  room = "protocol-" + Date.now(),
  clients = [];
const wait = async (fn, label) => {
  const end = Date.now() + 7000;
  while (!fn()) {
    if (Date.now() > end) throw new Error("Timed out: " + label);
    await new Promise((r) => setTimeout(r, 30));
  }
};
async function join(name) {
  const ws = new WebSocket(
    `${origin.replace("http", "ws")}/api/rooms/${room}/socket?name=${name}`,
    { origin },
  );
  const c = { ws, m: [], id: "", closed: 0 };
  clients.push(c);
  ws.on("message", (data) => {
    const m = JSON.parse(String(data));
    c.m.push(m);
    if (m.type === "welcome") c.id = m.id;
  });
  ws.on("close", (code) => (c.closed = code));
  ws.on("error", () => {});
  await wait(() => c.id, "welcome " + name);
  return c;
}
const send = (c, m) => c.ws.send(JSON.stringify(m));
try {
  const host = await join("Host"),
    guest = await join("Guest");
  await wait(
    () => host.m.some((m) => m.type === "state" && m.people.length === 2),
    "presence",
  );
  assert.equal(host.m.find((m) => m.type === "state").people[0].host, true);
  send(guest, { type: "lock", locked: true });
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(host.m.filter((m) => m.type === "state").at(-1).locked, false);
  send(host, { type: "lock", locked: true });
  await wait(
    () => guest.m.some((m) => m.type === "state" && m.locked),
    "host lock",
  );
  send(guest, { type: "meeting", join: true });
  await wait(
    () =>
      guest.m.some((m) => m.type === "error" && m.message.includes("locked")),
    "locked join denied",
  );
  send(guest, { type: "chat", text: "x".repeat(900) });
  await wait(() => host.m.some((m) => m.type === "chat"), "chat broadcast");
  assert.equal(host.m.find((m) => m.type === "chat").message.text.length, 500);
  send(guest, { type: "navigate", place: 1 });
  await wait(
    () =>
      host.m.some((m) => m.type === "move" && m.id === guest.id && m.x === 21),
    "navigation",
  );
  send(guest, {
    type: "signal",
    to: host.id,
    payload: { description: { type: "offer", sdp: "test" } },
  });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(
    host.m.some((m) => m.type === "signal"),
    false,
    "distant signaling denied",
  );
  for (let i = 2; i < 20; i++) await join("Visitor" + i);
  await wait(
    () => host.m.some((m) => m.type === "state" && m.people.length === 20),
    "20 participants",
  );
  const overflow = new WebSocket(
    `${origin.replace("http", "ws")}/api/rooms/${room}/socket?name=Overflow`,
    { origin },
  );
  let status = 0;
  overflow.on("unexpected-response", (_, res) => {
    status = res.statusCode;
    res.resume();
    overflow.terminate();
  });
  overflow.on("error", () => {});
  await wait(() => status, "capacity response");
  assert.equal(status, 503);
  send(host, { type: "kick", id: guest.id });
  await wait(() => guest.closed === 4003, "host kick");
  host.ws.close();
  await wait(
    () =>
      clients[2].m.some(
        (m) =>
          m.type === "state" &&
          m.people.find((p) => p.id === clients[2].id)?.host,
      ),
    "host transfer",
  );
  const oversized = await join("Oversized");
  oversized.ws.send("x".repeat(17000));
  await wait(() => oversized.closed === 1009, "oversized message rejection");
  console.log(
    "PASS: 20 real WebSocket clients; capacity, presence, chat truncation, navigation, host authorization, locked meeting, distant signaling denial, kick and host transfer.",
  );
} finally {
  for (const c of clients) c.ws.close();
}
