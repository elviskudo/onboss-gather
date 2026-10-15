import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
const RUN = Date.now().toString(36);
async function enter(page: Page, name: string, room: string) {
  await page.addInitScript(() =>
    localStorage.setItem("hallstatt-quality", "low"),
  );
  await page.goto("/?room=" + room);
  await page
    .getByRole("button", { name: "Enter village", exact: true })
    .click();
  await page.getByLabel("What should we call you?").fill(name);
  await page
    .getByRole("button", { name: "Enter the village", exact: true })
    .click();
}
test("offline recovery restores one session and movement agrees with the server", async ({
  browser,
}) => {
  const a = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    b = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const p = await a.newPage(),
      observer = await b.newPage();
    const frames: any[] = [];
    const welcomes: any[] = [];
    let connections = 0;
    p.on("websocket", (socket) => {
      connections++;
      socket.on("framereceived", (f) => {
        try {
          const m = JSON.parse(String(f.payload));
          if (m.type === "welcome") welcomes.push(m);
        } catch {}
      });
    });
    observer.on("websocket", (socket) =>
      socket.on("framereceived", (f) => {
        try {
          frames.push(JSON.parse(String(f.payload)));
        } catch {}
      }),
    );
    const room = "recovery-" + RUN;
    await enter(p, "Recovering", room);
    await expect(p.getByText("Connected", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await enter(observer, "Observer", room);
    await expect(observer.getByText("Connected", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await p
      .getByRole("button", { name: "Lakeside lounge A moment by the water" })
      .click();
    await expect
      .poll(() =>
        frames.some(
          (m) => m.type === "move" && m.id === welcomes[0]?.id && m.x === 21,
        ),
      )
      .toBe(true);
    await a.setOffline(true);
    await expect(p.getByText("Reconnecting…", { exact: true })).toBeVisible();
    await p.getByRole("button", { name: "Retry", exact: true }).dblclick();
    expect(connections).toBe(1);
    await p.screenshot({ path: "docs/reconnecting.png", fullPage: true });
    await a.setOffline(false);
    await expect(p.getByText("Connected", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect.poll(() => welcomes.length).toBe(2);
    expect(welcomes[1].id).not.toBe(welcomes[0].id);
    expect(welcomes[1].self.x).toBe(3.5);
    expect(welcomes[1].self.z).toBe(9);
    await expect(p.locator(".location-pill")).toContainText("Village square");
    await observer
      .getByRole("button", { name: "People", exact: false })
      .first()
      .click();
    await expect(observer.locator(".person-row")).toHaveCount(2);
    await p.keyboard.down("d");
    await expect
      .poll(
        () =>
          frames.some(
            (m) =>
              m.type === "move" &&
              m.id === welcomes[1].id &&
              m.x > 3.5 &&
              m.x < 7,
          ),
        { timeout: 8000 },
      )
      .toBe(true);
    await p.keyboard.up("d");
    expect(connections).toBe(2);
    await expect(
      p.getByRole("button", { name: "Unmute microphone" }),
    ).toBeVisible();
    await expect(
      p.getByRole("button", { name: "Turn camera on" }),
    ).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});
test("a transport without room admission times out and manual retry cancels backoff", async ({
  page,
}) => {
  const routes: { route: WebSocketRoute; closed: boolean }[] = [];
  await page.routeWebSocket(/\/api\/rooms\/.*\/socket/, (route) => {
    const entry = { route, closed: false };
    routes.push(entry);
    route.onClose(() => {
      entry.closed = true;
    });
  });
  await enter(page, "Pending", "pending-" + RUN);
  await expect(page.getByText("Connecting…", { exact: true })).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Reconnecting…", { exact: true })).toBeVisible({
    timeout: 16000,
  });
  await expect.poll(() => routes[0]?.closed).toBe(true);
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => routes.filter((r) => !r.closed).length).toBe(1);
  const count = routes.length;
  // The retired automatic retry was scheduled for at most 1.9 seconds.
  // Observe beyond that deadline to detect a second, orphaned connection.
  await page.waitForTimeout(2200);
  expect(routes.length).toBe(count);
  expect(routes.filter((r) => !r.closed)).toHaveLength(1);
});
test("an admitted connection without heartbeat replies is replaced", async ({
  page,
}) => {
  const routes: { route: WebSocketRoute; closed: boolean }[] = [];
  let pingCount = 0;
  await page.routeWebSocket(/\/api\/rooms\/.*\/socket/, (route) => {
    const entry = { route, closed: false };
    routes.push(entry);
    route.onClose(() => {
      entry.closed = true;
    });
    route.onMessage((m) => {
      if (m === "ping") pingCount++;
    });
    const self = {
      id: "heartbeat-" + routes.length,
      name: "Heartbeat",
      color: "#c87855",
      x: 3.5,
      z: 9,
      mic: false,
      camera: false,
      meeting: false,
      host: true,
    };
    route.send(
      JSON.stringify({ type: "welcome", id: self.id, self, history: [] }),
    );
    route.send(
      JSON.stringify({ type: "state", people: [self], locked: false }),
    );
  });
  await enter(page, "Heartbeat", "heartbeat-" + RUN);
  await expect(page.getByText("Connected", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect.poll(() => pingCount, { timeout: 16000 }).toBeGreaterThan(0);
  await expect.poll(() => routes.length, { timeout: 15000 }).toBe(2);
  expect(routes[0].closed).toBe(true);
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  expect(routes.filter((r) => !r.closed)).toHaveLength(1);
});
test("repeated admission followed by disconnect exhausts the retry budget", async ({
  page,
}) => {
  let admissions = 0;
  await page.routeWebSocket(/\/api\/rooms\/.*\/socket/, (route) => {
    admissions++;
    const self = {
      id: "flapping-" + admissions,
      name: "Flapping",
      color: "#c87855",
      x: 3.5,
      z: 9,
      mic: false,
      camera: false,
      meeting: false,
      host: true,
    };
    route.send(
      JSON.stringify({ type: "welcome", id: self.id, self, history: [] }),
    );
    route.send(
      JSON.stringify({ type: "state", people: [self], locked: false }),
    );
    setTimeout(
      () =>
        void route
          .close({ code: 1011, reason: "Synthetic unstable transport" })
          .catch(() => {}),
      250,
    );
  });
  await enter(page, "Flapping", "flapping-" + RUN);
  await expect(page.getByText("Offline", { exact: true })).toBeVisible({
    timeout: 70000,
  });
  expect(admissions).toBe(7);
  await expect(page.getByRole("status")).toContainText(
    "Could not connect to the room",
  );
  // Another backoff tick would have fired by now if a retired timer remained.
  await page.waitForTimeout(2200);
  expect(admissions).toBe(7);
});
