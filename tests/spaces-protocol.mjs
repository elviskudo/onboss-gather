import WebSocket from "ws";
import assert from "node:assert/strict";
const origin = "http://127.0.0.1:8787",
  room = "spaces-protocol-" + Date.now();
const wait = async (fn) => {
  const end = Date.now() + 5000;
  while (!fn()) {
    if (Date.now() > end) throw new Error("Protocol timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
};
const clients = [];
async function join(name) {
  const ws = new WebSocket(
    origin.replace("http", "ws") +
      "/api/rooms/" +
      room +
      "/socket?name=" +
      name,
    { origin },
  );
  const c = { ws, id: "", messages: [] };
  clients.push(c);
  ws.on("message", (d) => {
    const m = JSON.parse(String(d));
    c.messages.push(m);
    if (m.type === "welcome") c.id = m.id;
  });
  await wait(() => c.id);
  return c;
}
const send = (c, m) => c.ws.send(JSON.stringify(m));
const latest = (c) => c.messages.filter((m) => m.type === "state").at(-1);
try {
  const a = await join("Host"),
    b = await join("Guest");
  send(a, {
    type: "profile",
    name: "Nadia",
    avatar: "woman",
    color: "#798ab6",
    bio: "Designer",
  });
  await wait(
    () => latest(b)?.people.find((p) => p.id === a.id)?.avatar === "woman",
  );
  send(a, { type: "area", area: "workspace" });
  send(b, { type: "area", area: "hall" });
  await wait(
    () => latest(a)?.people.find((p) => p.id === b.id)?.area === "hall",
  );
  send(a, { type: "meeting", join: true });
  send(b, { type: "meeting", join: true });
  await wait(() => latest(a)?.people.every((p) => p.meeting));
  send(a, { type: "signal", to: b.id, payload: { test: "cross-room" } });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(
    b.messages.some((m) => m.type === "signal"),
    false,
  );
  send(a, { type: "lock", locked: true });
  await wait(() => latest(a)?.locked === true);
  assert.equal(latest(b).locked, false);
  send(a, { type: "move", x: 0, z: 4 });
  send(a, { type: "move", x: 0, z: 2 });
  send(a, { type: "move", x: 0, z: 0 });
  await wait(() =>
    b.messages.some((m) => m.type === "move" && m.id === a.id && m.z === 2),
  );
  assert.equal(
    b.messages.filter((m) => m.type === "move" && m.id === a.id).at(-1).z,
    2,
  );
  send(b, { type: "area", area: "workspace" });
  await wait(() => latest(b)?.locked === true);
  send(b, { type: "meeting", join: true });
  await wait(() =>
    b.messages.some((m) => m.type === "error" && m.message.includes("locked")),
  );
  send(a, { type: "lock", locked: false });
  await wait(() => latest(b)?.locked === false);
  send(b, { type: "meeting", join: true });
  await wait(() => latest(a)?.people.every((p) => p.meeting));
  send(a, { type: "signal", to: b.id, payload: { test: "same-room" } });
  await wait(() =>
    b.messages.some(
      (m) => m.type === "signal" && m.payload.test === "same-room",
    ),
  );
  send(a, { type: "navigate", place: 3 });
  await wait(
    () => latest(b)?.people.find((p) => p.id === a.id)?.area === "village",
  );
  for (const [x, z] of [
    [-15, -10],
    [-17, -10],
    [-19, -10],
  ])
    send(a, { type: "move", x, z });
  await wait(() =>
    b.messages.some((m) => m.type === "move" && m.id === a.id && m.x === -17),
  );
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(
    b.messages.filter((m) => m.type === "move" && m.id === a.id).at(-1).x,
    -17,
  );
  console.log(
    "PASS: live avatar profile, building isolation, per-building lock, same-room signaling, furniture and lamp collision enforced on server.",
  );
} finally {
  for (const c of clients) c.ws.close();
}
