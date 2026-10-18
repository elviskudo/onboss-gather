import { test, expect, type BrowserContext } from "@playwright/test";
import WebSocket from "ws";
import { FARM_ANIMALS, animalAt, FEED_DISTANCE } from "../shared/animals";
const origin = "http://127.0.0.1:8789";
async function seed(c: BrowserContext, name: string) {
  await c.addInitScript(() => localStorage.setItem("hallstatt-quality", "low"));
  expect(
    (
      await c.request.post("/__test/login", {
        data: { name, email: `${name}-${crypto.randomUUID()}@example.com` },
      })
    ).ok(),
  ).toBe(true);
}
async function wire(c: BrowserContext, room: string, space = "space-2") {
  const events: any[] = [];
  const ws = new WebSocket(
    `${origin.replace("http", "ws")}/api/rooms/${room}/socket?name=Keeper&space=${space}`,
    {
      closeTimeout: 1000,
      headers: {
        Origin: origin,
        Cookie: (await c.cookies())
          .map((x) => `${x.name}=${x.value}`)
          .join("; "),
      },
    },
  );
  ws.on("message", (v) => {
    if (String(v) !== "pong") events.push(JSON.parse(String(v)));
  });
  await expect.poll(() => events.some((e) => e.type === "welcome")).toBe(true);
  return {
    ws,
    events,
    self: events.find((e) => e.type === "welcome").self,
    send: (m: unknown) => ws.send(JSON.stringify(m)),
  };
}
test("feeding is distance-authorized, shared across clients, persists across reload and is isolated from Space 1 and interiors", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const clients: any[] = [];
  try {
    await seed(a, "Keeper");
    await seed(b, "Witness");
    const room = "herd-" + Date.now(),
      p = await wire(a, room),
      q = await wire(b, room);
    clients.push(p, q);
    p.send({ type: "animal-feed", id: "cow-1" });
    await expect
      .poll(() =>
        p.events.some(
          (e) => e.type === "error" && e.message.includes("Dekati"),
        ),
      )
      .toBe(true);
    expect(q.events.filter((e) => e.type === "farm")).toHaveLength(0);
    const def = FARM_ANIMALS.find((a) => a.id === "cat-3")!,
      point = animalAt(def, Date.now());
    const dx = point.x - p.self.x,
      dz = point.z - p.self.z,
      steps = Math.ceil(Math.hypot(dx, dz) / 0.4);
    for (let i = 1; i <= steps; i++)
      p.send({
        type: "move",
        x: p.self.x + (dx * i) / steps,
        z: p.self.z + (dz * i) / steps,
      });
    p.send({ type: "animal-feed", id: def.id });
    await expect
      .poll(() => q.events.some((e) => e.type === "farm" && e.feeds[def.id]))
      .toBe(true);
    const state = q.events.filter((e) => e.type === "farm").at(-1);
    expect(state.feeds[def.id].by).toBe("Keeper");
    expect(animalAt(def, state.now + 1000, state.feeds[def.id]).feeding).toBe(
      true,
    );
    p.send({ type: "animal-feed", id: def.id });
    await expect
      .poll(() =>
        p.events.some(
          (e) => e.type === "error" && e.message.includes("masih makan"),
        ),
      )
      .toBe(true);
    const again = await wire(b, room);
    clients.push(again);
    expect(
      again.events.find((e) => e.type === "welcome").farm.feeds[def.id].at,
    ).toBe(state.feeds[def.id].at);
    const space1 = await wire(b, room, "space-1");
    clients.push(space1);
    space1.send({ type: "animal-feed", id: def.id });
    await expect
      .poll(() =>
        space1.events.some(
          (e) => e.type === "error" && e.message.includes("Space 2"),
        ),
      )
      .toBe(true);
    expect(
      space1.events.find((e) => e.type === "welcome").farm,
    ).toBeUndefined();
    p.send({ type: "area", area: "workspace" });
    p.send({ type: "animal-feed", id: def.id });
    await expect
      .poll(() =>
        p.events.some(
          (e) => e.type === "error" && e.message.includes("Space 2"),
        ),
      )
      .toBe(true);
  } finally {
    clients.forEach((c) => c.ws.close());
    await a.close();
    await b.close();
  }
});
test("proportional farm renders 21 articulated animals, feeding works by button and F, and mobile controls fit", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  let witness: Awaited<ReturnType<typeof wire>> | undefined;
  try {
    await seed(a, "Farmer");
    await seed(b, "Guest");
    const p = await a.newPage(),
      errors: string[] = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const url = "/rooms/farm-visual-" + Date.now() + "?space=space-2";
    for (const page of [p]) {
      await page.goto(url);
      await expect(page.locator(".connection")).toHaveText("Connected", {
        timeout: 15000,
      });
      await expect(page.locator("canvas[data-assets-loaded=true]")).toBeVisible(
        { timeout: 15000 },
      );
    }
    // A real second authenticated socket verifies shared state without a second GPU scene.
    witness = await wire(b, new URL(url, origin).pathname.split("/")[2]);
    await p.getByRole("button", { name: /Hewan kebun/ }).click();
    await expect(p.locator(".farm-herd-list button")).toHaveCount(21);
    await expect(p.getByRole("button", { name: /Lihat .* Bebek/ })).toHaveCount(
      5,
    );
    await expect(
      p.getByRole("button", { name: /Lihat .* Anjing/ }),
    ).toHaveCount(0);
    await p
      .getByRole("button", { name: "Lihat Luna Kucing", exact: true })
      .click();
    await p.getByRole("button", { name: /Dekati/ }).click();
    await expect(
      p.getByRole("button", { name: "Beri makan F", exact: true }),
    ).toBeEnabled({ timeout: 15000 });
    await p.screenshot({
      path: "docs/farm-proportions.png",
      animations: "disabled",
    });
    await p.getByRole("button", { name: "Beri makan F", exact: true }).click();
    await expect(p.locator(".farm-animal-card")).toHaveAttribute(
      "data-activity",
      "fed",
    );
    await expect(
      p.getByText("Sedang makan · diberi Farmer", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        witness!.events.some(
          (e) => e.type === "farm" && e.feeds["cat-3"]?.by === "Farmer",
        ),
      )
      .toBe(true);
    await p.screenshot({
      path: "docs/farm-feeding.png",
      animations: "disabled",
    });
    await expect(p.locator(".farm-animal-card")).not.toHaveAttribute(
      "data-activity",
      "fed",
      { timeout: 12000 },
    );
    await p.keyboard.press("f");
    await expect(p.locator(".farm-animal-card")).toHaveAttribute(
      "data-activity",
      "fed",
    );
    await p.setViewportSize({ width: 390, height: 844 });
    await expect(p.getByRole("button", { name: /Hewan kebun/ })).toBeVisible();
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await p.screenshot({ path: "docs/farm-npcs-mobile.png", fullPage: true });
    await p.getByLabel("Masuk rumah di kebun").selectOption("workspace");
    await expect(p.locator(".farm-hud")).toHaveCount(0);
    await p.getByRole("button", { name: "Keluar ke desa" }).click();
    await expect(p.locator(".farm-hud")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    witness?.ws.close();
    await a.close();
    await b.close();
  }
});

test("all five species accept food through real authoritative movement", async ({
  browser,
}) => {
  const c = await browser.newContext();
  let p: any;
  try {
    await seed(c, "Keeper");
    p = await wire(c, "all-herds-" + Date.now());
    let current = { x: p.self.x, z: p.self.z };
    const walk = async (target: { x: number; z: number }) => {
      const steps = Math.ceil(
        Math.hypot(target.x - current.x, target.z - current.z) / 2,
      );
      for (let i = 1; i <= steps; i++)
        p.send({
          type: "move",
          x: current.x + ((target.x - current.x) * i) / steps,
          z: current.z + ((target.z - current.z) * i) / steps,
        });
      p.send({ type: "status", mic: false, camera: false });
      await expect
        .poll(() => {
          const own = p.events
            .filter((e: any) => e.type === "state")
            .at(-1)
            ?.people.find((a: any) => a.id === p.self.id);
          return own && Math.hypot(own.x - target.x, own.z - target.z) < 0.01;
        })
        .toBe(true);
      current = target;
    };
    for (const id of ["cow-1", "sheep-1", "cat-3", "chicken-1", "duck-1"]) {
      if (id === "sheep-1") {
        await walk({ x: 7, z: 3 });
        await walk({ x: -11, z: 3 });
      }
      const def = FARM_ANIMALS.find((a) => a.id === id)!;
      await walk(animalAt(def, Date.now()));
      p.send({ type: "animal-feed", id });
      await expect
        .poll(() => p.events.some((e: any) => e.type === "farm" && e.feeds[id]))
        .toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 1600));
    }
    const feeds = p.events.filter((e: any) => e.type === "farm").at(-1).feeds;
    expect(Object.keys(feeds)).toHaveLength(5);
    for (const feed of Object.values(feeds) as any[])
      expect(feed.by).toBe("Keeper");
  } finally {
    p?.ws.close();
    await c.close();
  }
});
