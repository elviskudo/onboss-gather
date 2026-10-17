import { test, expect, type BrowserContext } from "@playwright/test";
import WebSocket from "ws";
const origin = "http://127.0.0.1:8789";
async function seed(context: BrowserContext, name: string) {
  await context.addInitScript(() =>
    localStorage.setItem("hallstatt-quality", "low"),
  );
  expect(
    (
      await context.request.post("/__test/login", {
        data: { name, email: `${name}-${crypto.randomUUID()}@example.com` },
      })
    ).ok(),
  ).toBe(true);
}
async function socket(context: BrowserContext, room: string, name: string) {
  const cookie = (await context.cookies())
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const ws = new WebSocket(
    `${origin.replace("http", "ws")}/api/rooms/${room}/socket?name=${name}`,
    { headers: { Origin: origin, Cookie: cookie } },
  );
  const events: any[] = [];
  ws.on("message", (data) => {
    try {
      events.push(JSON.parse(String(data)));
    } catch {}
  });
  await expect.poll(() => events.some((e) => e.type === "welcome")).toBe(true);
  const self = events.find((e) => e.type === "welcome").self;
  return {
    ws,
    events,
    self,
    send: (value: any) => ws.send(JSON.stringify(value)),
    state: () => events.filter((e) => e.type === "state").at(-1),
    board: () => events.filter((e) => e.type === "board").at(-1)?.board,
  };
}
test("concurrent arrivals stay visible at distinct positions with one host; server rejects avatar overlap", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 8 }, () => browser.newContext()),
  );
  const nodes: Awaited<ReturnType<typeof socket>>[] = [];
  try {
    await Promise.all(contexts.map((c, i) => seed(c, "Concurrent" + i)));
    const room = "concurrent-" + Date.now();
    nodes.push(
      ...(await Promise.all(
        contexts.map((c, i) => socket(c, room, "Concurrent" + i)),
      )),
    );
    await expect.poll(() => nodes[0].state()?.people.length).toBe(8);
    const people = nodes[0].state().people;
    expect(people.filter((p: any) => p.host)).toHaveLength(1);
    for (let i = 0; i < people.length; i++)
      for (let j = i + 1; j < people.length; j++)
        expect(
          Math.hypot(people[i].x - people[j].x, people[i].z - people[j].z),
        ).toBeGreaterThanOrEqual(1.05);
    const sender = nodes[0],
      near = people.find(
        (p: any) =>
          p.id !== sender.self.id &&
          Math.hypot(p.x - sender.self.x, p.z - sender.self.z) < 3,
      );
    expect(near).toBeTruthy();
    sender.send({ type: "move", x: near.x, z: near.z });
    await expect
      .poll(() =>
        sender.events.some(
          (e) =>
            e.type === "relocate" &&
            e.x === sender.self.x &&
            e.z === sender.self.z,
        ),
      )
      .toBe(true);
  } finally {
    for (const n of nodes) n.ws.close();
    for (const c of contexts) await c.close();
  }
});
test("boards persist, merge simultaneous edits, reject malformed strokes, and isolate each house", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext(),
    c = await browser.newContext();
  const nodes: Awaited<ReturnType<typeof socket>>[] = [];
  try {
    await seed(a, "BoardOwner");
    await seed(b, "BoardGuest");
    await seed(c, "OtherHouse");
    const room = "boards-" + Date.now(),
      x = await socket(a, room, "BoardOwner"),
      y = await socket(b, room, "BoardGuest"),
      z = await socket(c, room, "OtherHouse");
    nodes.push(x, y, z);
    for (const n of [x, y]) n.send({ type: "area", area: "workspace" });
    z.send({ type: "area", area: "studio" });
    await expect
      .poll(() => x.state()?.people.find((p: any) => p.id === y.self.id)?.area)
      .toBe("workspace");
    x.send({ type: "board-note", text: "Owner agenda" });
    y.send({ type: "board-note", text: "Guest ideas" });
    await expect.poll(() => x.board()?.notes.length).toBe(2);
    await expect.poll(() => y.board()?.notes.length).toBe(2);
    z.send({ type: "board-open" });
    await expect.poll(() => z.board()?.notes.length).toBe(0);
    x.send({
      type: "board-stroke",
      stroke: {
        id: "valid-stroke",
        color: "#294d3e",
        width: 4,
        points: [
          [0.1, 0.1],
          [0.6, 0.5],
        ],
      },
    });
    await expect.poll(() => y.board()?.strokes.length).toBe(1);
    y.send({
      type: "board-stroke",
      stroke: {
        id: "invalid-stroke",
        color: "#294d3e",
        width: 4,
        points: [
          [5, 0.1],
          [0.3, 0.2],
        ],
      },
    });
    y.send({ type: "board-open" });
    await expect.poll(() => y.board()?.strokes.length).toBe(1);
    y.send({ type: "board-clear", revision: y.board().revision });
    await expect
      .poll(() =>
        y.events.some(
          (e) => e.type === "error" && e.message.includes("Hanya host"),
        ),
      )
      .toBe(true);
    for (const area of ["hall", "lounge", "studio"]) {
      z.send({ type: "area", area });
      z.send({ type: "board-open" });
      await expect.poll(() => z.board()?.area).toBe(area);
      expect(z.board().notes).toHaveLength(0);
    }
    y.ws.close();
    const reconnect = await socket(b, room, "BoardGuest");
    nodes.push(reconnect);
    reconnect.send({ type: "area", area: "workspace" });
    reconnect.send({ type: "board-open" });
    await expect.poll(() => reconnect.board()?.notes.length).toBe(2);
    expect(reconnect.board().strokes).toHaveLength(1);
  } finally {
    for (const n of nodes) n.ws.close();
    await a.close();
    await b.close();
    await c.close();
  }
});
test("avatars are mutually visible, E starts proximity voice, accepted invitations seat both participants, and the board synchronizes", async ({
  browser,
}) => {
  const owner = await browser.newContext({
      permissions: ["microphone", "camera"],
    }),
    guest = await browser.newContext({ permissions: ["microphone", "camera"] });
  try {
    await seed(owner, "SocialOwner");
    await seed(guest, "SocialGuest");
    const a = await owner.newPage(),
      b = await guest.newPage();
    const url = "/rooms/social-" + Date.now();
    await Promise.all([a.goto(url), b.goto(url)]);
    for (const p of [a, b])
      await expect(p.getByText("Connected", { exact: true })).toBeVisible();
    await expect(
      a.getByRole("button", { name: "Buka profil SocialGuest", exact: true }),
    ).toBeVisible();
    await expect(
      b.getByRole("button", { name: "Buka profil SocialOwner", exact: true }),
    ).toBeVisible();
    await a.keyboard.press("e");
    await expect(
      a.getByRole("heading", { name: "Bersama SocialGuest" }),
    ).toBeVisible();
    await a
      .getByRole("button", { name: "Ajak ngobrol & nyalakan mic" })
      .click();
    await expect(
      b.getByRole("region", { name: "Undangan aktivitas" }),
    ).toBeVisible();
    await b.getByRole("button", { name: "Terima & nyalakan mic" }).click();
    for (const p of [a, b])
      await expect(
        p.getByRole("button", { name: "Mute microphone", exact: true }),
      ).toBeVisible();
    await expect
      .poll(
        () =>
          b
            .locator("audio")
            .evaluateAll((items: HTMLAudioElement[]) =>
              items.some((audio) =>
                (audio.srcObject as MediaStream | null)
                  ?.getAudioTracks()
                  .some((t) => t.readyState === "live"),
              ),
            ),
        { timeout: 15000 },
      )
      .toBe(true);
    for (const p of [a, b])
      await p
        .getByRole("button", { name: "Mute microphone", exact: true })
        .click();
    await a.keyboard.press("e");
    await a.getByLabel("Ajak meeting ke rumah").selectOption("workspace");
    await a.getByRole("button", { name: "Kirim ajakan meeting" }).click();
    await b.getByRole("button", { name: "Tolak", exact: true }).click();
    for (const p of [a, b])
      await expect(p.locator(".scene-shell")).toHaveAttribute(
        "data-area",
        "village",
      );
    await a.keyboard.press("e");
    await a.getByRole("button", { name: "Kirim ajakan meeting" }).click();
    await b.getByRole("button", { name: "Terima ajakan meeting" }).click();
    for (const p of [a, b]) {
      await expect(p.locator(".scene-shell")).toHaveAttribute(
        "data-area",
        "workspace",
      );
      await expect(
        p.locator(".world-person-label[data-seated=true]"),
      ).toHaveCount(2);
    }
    for (const p of [a, b])
      await p.getByRole("button", { name: "Papan tulis", exact: true }).click();
    await a.getByLabel("Tambahkan catatan").fill("Agenda kolaborasi tim");
    await a.getByRole("button", { name: "Kirim catatan" }).click();
    await expect(
      b.getByText("Agenda kolaborasi tim", { exact: true }),
    ).toBeVisible();
    const box = await a.getByLabel("Kanvas papan tulis bersama").boundingBox();
    expect(box).toBeTruthy();
    await a.mouse.move(box!.x + 80, box!.y + 80);
    await a.mouse.down();
    await a.mouse.move(box!.x + 220, box!.y + 150, { steps: 8 });
    await a.mouse.up();
    await expect(b.getByText("1 coretan · 1 catatan")).toBeVisible();
    await a.screenshot({
      path: "docs/social-whiteboard.png",
      fullPage: true,
      animations: "disabled",
    });
    await b.setViewportSize({ width: 390, height: 844 });
    expect(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await b.screenshot({
      path: "docs/social-board-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    await b.setViewportSize({ width: 1440, height: 1000 });
    for (const p of [a, b])
      await p.getByRole("button", { name: "Tutup papan tulis" }).click();
    await a.screenshot({
      path: "docs/social-seated.png",
      fullPage: true,
      animations: "disabled",
    });
    await b.keyboard.press("e");
    await expect(
      b.getByRole("button", { name: "Buka profil SocialGuest", exact: true }),
    ).toHaveAttribute("data-seated", "false");
    await b.getByRole("button", { name: "Keluar ke desa" }).click();
    await b.getByRole("button", { name: "Working space", exact: true }).click();
    await b.getByRole("button", { name: "Papan tulis", exact: true }).click();
    await expect(
      b.getByText("Agenda kolaborasi tim", { exact: true }),
    ).toBeVisible();
    await b.getByRole("button", { name: "Tutup papan tulis" }).click();
    await b.getByRole("button", { name: "Keluar ke desa" }).click();
    await a
      .getByRole("button", { name: "People", exact: false })
      .first()
      .click();
    await a
      .getByRole("button", { name: "View profile SocialGuest", exact: true })
      .click();
    await a
      .getByRole("button", { name: "Temui SocialGuest", exact: false })
      .click();
    await expect(a.locator(".scene-shell")).toHaveAttribute(
      "data-area",
      "village",
    );
    await expect(
      a.getByRole("button", { name: "Buka profil SocialGuest", exact: true }),
    ).toBeVisible();
  } finally {
    await owner.close();
    await guest.close();
  }
});
