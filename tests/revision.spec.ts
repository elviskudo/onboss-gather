import { test, expect, type BrowserContext } from "@playwright/test";
import WebSocket from "ws";
const origin = "http://127.0.0.1:8789";
async function seed(
  c: BrowserContext,
  name: string,
  sub?: string,
  email?: string,
) {
  await c.addInitScript(() => localStorage.setItem("hallstatt-quality", "low"));
  expect(
    (
      await c.request.post("/__test/login", {
        data: {
          name,
          sub,
          email: email || `${name}-${crypto.randomUUID()}@example.com`,
        },
      })
    ).ok(),
  ).toBe(true);
}
async function wire(c: BrowserContext, room: string, name: string) {
  const events: any[] = [];
  let closed = 0;
  const ws = new WebSocket(
    origin.replace("http", "ws") + `/api/rooms/${room}/socket?name=${name}`,
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
    if (String(v) === "pong") {
      events.push({ type: "pong" });
      return;
    }
    events.push(JSON.parse(String(v)));
  });
  ws.on("close", (code) => (closed = code));
  await expect.poll(() => events.some((e) => e.type === "welcome")).toBe(true);
  return {
    ws,
    events,
    self: events.find((e) => e.type === "welcome").self,
    closeCode: () => closed,
    state: () => events.filter((e) => e.type === "state").at(-1),
  };
}
test("one account retains one stable presence across overlapping reconnects and new login sessions", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    w = await browser.newContext();
  const all: Awaited<ReturnType<typeof wire>>[] = [];
  const room = "dedup-" + Date.now(),
    sub = "dedup-user-" + Date.now();
  try {
    await seed(a, "Elvis", sub, "elvis-test@example.com");
    await seed(w, "Witness");
    const watcher = await wire(w, room, "Witness");
    all.push(watcher);
    let last = await wire(a, room, "Elvis");
    all.push(last);
    const id = last.self.id;
    for (let i = 0; i < 5; i++) {
      await seed(a, "Elvis", sub, "elvis-test@example.com");
      const next = await wire(a, room, "Elvis");
      all.push(next);
      expect(next.self.id).toBe(id);
      expect(next.self.connection).not.toBe(last.self.connection);
      await expect.poll(() => last.closeCode()).toBe(4004);
      await expect
        .poll(
          () =>
            watcher.state()?.people.filter((p: any) => p.name === "Elvis")
              .length,
        )
        .toBe(1);
      expect(watcher.state().people).toHaveLength(2);
      watcher.ws.send(
        JSON.stringify({
          type: "signal",
          to: next.self.id,
          toConnection: last.self.connection,
          payload: { description: { type: "offer", sdp: "obsolete-" + i } },
        }),
      );
      watcher.ws.send(
        JSON.stringify({
          type: "signal",
          to: next.self.id,
          toConnection: next.self.connection,
          payload: { description: { type: "offer", sdp: "current-" + i } },
        }),
      );
      await expect
        .poll(() =>
          next.events.some(
            (e) =>
              e.type === "signal" &&
              e.payload.description?.sdp === "current-" + i,
          ),
        )
        .toBe(true);
      expect(
        next.events.some(
          (e) =>
            e.type === "signal" &&
            e.payload.description?.sdp === "obsolete-" + i,
        ),
      ).toBe(false);
      expect(next.events.find((e) => e.type === "signal").connection).toBe(
        watcher.self.connection,
      );
      last = next;
    }
  } finally {
    for (const n of all) n.ws.close();
    await a.close();
    await w.close();
  }
});
test("abandoned transport after a long background pause cannot stack avatars and replaced tabs stay stopped", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    w = await browser.newContext();
  try {
    await seed(a, "IdleOwner");
    await seed(w, "IdleWitness");
    const p = await a.newPage(),
      q = await w.newPage();
    const welcomes: string[] = [];
    await p.addInitScript(() => {
      const Native = window.WebSocket;
      class LossySocket extends Native {
        constructor(url: string, protocols?: string | string[]) {
          super(url, protocols);
          this.addEventListener("message", (e) => {
            if ((window as any).__ignorePongs && e.data === "pong")
              e.stopImmediatePropagation();
          });
        }
        close(code?: number, reason?: string) {
          if ((window as any).__dropNextClose) {
            (window as any).__dropNextClose = false;
            (window as any).__ignorePongs = false;
            return;
          }
          super.close(code, reason);
        }
      }
      window.WebSocket = LossySocket;
    });
    p.on("websocket", (ws) =>
      ws.on("framereceived", ({ payload }) => {
        try {
          const e = JSON.parse(String(payload));
          if (e.type === "welcome") welcomes.push(e.id);
        } catch {}
      }),
    );
    await p.clock.install();
    const url = "/rooms/idle-" + Date.now();
    await p.goto(url);
    await q.goto(url);
    for (const page of [p, q])
      await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await q
      .getByRole("button", { name: "People", exact: false })
      .first()
      .click();
    for (let i = 0; i < 3; i++) {
      const previous = welcomes.length;
      await p.evaluate(() => {
        (window as any).__ignorePongs = true;
        (window as any).__dropNextClose = true;
      });
      await p.clock.fastForward(300000);
      await p.evaluate(() =>
        document.dispatchEvent(new Event("visibilitychange")),
      );
      await expect.poll(() => welcomes.length).toBeGreaterThan(previous);
      await expect(q.locator(".person-row")).toHaveCount(2);
      await expect(
        q.getByRole("button", { name: "View profile IdleOwner", exact: true }),
      ).toHaveCount(1);
    }
    expect(new Set(welcomes).size).toBe(1);
    const replacement = await a.newPage();
    await replacement.goto(url);
    await expect(
      replacement.getByText("Connected", { exact: true }),
    ).toBeVisible();
    await expect(p.getByRole("status")).toContainText("tab/perangkat lain");
    await p.clock.fastForward(600000);
    await p.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(q.locator(".person-row")).toHaveCount(2);
  } finally {
    await a.close();
    await w.close();
  }
});
test("presence lease expires abandoned sockets but native heartbeats keep active sockets", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const nodes: Awaited<ReturnType<typeof wire>>[] = [];
  try {
    await seed(a, "Quiet");
    await seed(b, "Active");
    const room = "lease-" + Date.now(),
      quiet = await wire(a, room, "Quiet"),
      active = await wire(b, room, "Active");
    nodes.push(quiet, active);
    await new Promise((r) => setTimeout(r, 1600));
    active.ws.send("ping");
    await expect
      .poll(() => active.events.some((e) => e.type === "pong"))
      .toBe(true);
    const result = await b.request
      .post(`/__test/sweep?room=${room}&offset=179000`)
      .then((r) => r.json());
    expect(result.people.map((p: any) => p.name)).toEqual(["Active"]);
    await expect.poll(() => quiet.closeCode()).toBe(4005);
    expect(active.closeCode()).toBe(0);
  } finally {
    for (const n of nodes) n.ws.close();
    await a.close();
    await b.close();
  }
});
test("participants erase strokes and notes; founder can clear a board without being room host", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  try {
    await seed(a, "ActualHost");
    await seed(b, "Founder", undefined, "elviskudo@gmail.com");
    const p = await a.newPage(),
      q = await b.newPage();
    const url = "/rooms/delete-" + Date.now();
    await p.goto(url);
    await expect(p.getByText("Connected", { exact: true })).toBeVisible();
    await q.goto(url);
    for (const page of [p, q]) {
      await expect(page.getByText("Connected", { exact: true })).toBeVisible();
      await page
        .getByRole("button", { name: "Working space", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Papan tulis", exact: true })
        .click();
    }
    await p.getByLabel("Tambahkan catatan").fill("Hapus catatan ini");
    await p.getByRole("button", { name: "Kirim catatan" }).click();
    await q
      .getByRole("button", { name: "Hapus catatan Hapus catatan ini" })
      .click();
    await expect(p.getByText("Hapus catatan ini", { exact: true })).toHaveCount(
      0,
    );
    const box = await p.getByLabel("Kanvas papan tulis bersama").boundingBox();
    await p.mouse.move(box!.x + 0.1 * box!.width, box!.y + 0.1 * box!.height);
    await p.mouse.down();
    await p.mouse.move(box!.x + 0.5 * box!.width, box!.y + 0.5 * box!.height, {
      steps: 150,
    });
    await p.mouse.up();
    await expect(q.getByText("1 coretan · 0 catatan")).toBeVisible();
    await q.getByRole("button", { name: "Mode penghapus" }).click();
    const other = await q
      .getByLabel("Kanvas papan tulis bersama")
      .boundingBox();
    await q.mouse.click(
      other!.x + 0.3 * other!.width,
      other!.y + 0.3 * other!.height,
    );
    await expect(p.getByText("0 coretan · 0 catatan")).toBeVisible();
    await p.getByLabel("Tambahkan catatan").fill("Bersihkan seluruh papan");
    await p.getByRole("button", { name: "Kirim catatan" }).click();
    await expect(
      q.getByRole("button", { name: "Bersihkan", exact: true }),
    ).toBeEnabled();
    await q.getByRole("button", { name: "Bersihkan", exact: true }).click();
    await q.getByRole("button", { name: "Ya, bersihkan" }).click();
    await expect(p.getByText("0 coretan · 0 catatan")).toBeVisible();
    await q.screenshot({
      path: "docs/board-delete-fixed.png",
      fullPage: true,
      animations: "disabled",
    });
  } finally {
    await a.close();
    await b.close();
  }
});
test("Space 2 preserves invitation through login, uses uploaded assets, separates presence and boards, and supports faceless avatars", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  try {
    const room = "farm-" + Date.now(),
      p = await a.newPage(),
      q = await b.newPage();
    const assetErrors: string[] = [];
    p.on("response", (r) => {
      if (r.url().includes("/assets/farm/") && r.status() !== 200)
        assetErrors.push(r.url());
    });
    await p.goto(`/rooms/${room}?space=space-2`);
    await expect(p).toHaveURL(
      new RegExp(`/login\\?room=${room}&space=space-2`),
    );
    await expect(
      p.getByRole("link", { name: "Sign in with Google" }),
    ).toHaveAttribute("href", `/api/auth/google?room=${room}&space=space-2`);
    await seed(a, "Farmer");
    await p.reload();
    await expect(p).toHaveURL(`${origin}/rooms/${room}?space=space-2`);
    await expect(p.getByText("Connected", { exact: true })).toBeVisible();
    await expect(p.locator("canvas[data-assets-loaded=true]")).toBeVisible();
    await expect(p.locator(".scene-shell")).toHaveAttribute(
      "data-space",
      "space-2",
    );
    expect(assetErrors).toEqual([]);
    await seed(b, "HallstattFriend");
    await q.goto("/rooms/" + room);
    await expect(q.getByText("Connected", { exact: true })).toBeVisible();
    for (const page of [p, q])
      await page
        .getByRole("button", { name: "People", exact: false })
        .first()
        .click();
    await expect(p.locator(".person-row")).toHaveCount(1);
    await expect(q.locator(".person-row")).toHaveCount(1);
    await q.getByLabel("Pilih space").selectOption("space-2");
    await expect(q.getByText("Connected", { exact: true })).toBeVisible();
    await expect(
      p.getByRole("button", {
        name: "View profile HallstattFriend",
        exact: true,
      }),
    ).toBeVisible();
    await p
      .getByRole("button", { name: "Invite friends", exact: true })
      .click();
    await expect(p.getByLabel("Your village link")).toHaveValue(
      `${origin}/rooms/${room}?space=space-2`,
    );
    await p.getByRole("button", { name: "Close dialog" }).click();
    await p.locator("button.profile").click();
    await expect(
      p.getByRole("dialog").locator(".avatar-presets button"),
    ).toHaveCount(8);
    await expect(
      p.getByRole("dialog").getByRole("button", { name: /Shirt #/ }),
    ).toHaveCount(24);
    await p.getByRole("button", { name: "Dewasa", exact: true }).click();
    await expect(
      p.getByRole("dialog").locator(".profile-draft [data-beard=black]"),
    ).toHaveCount(1);
    await p.getByRole("button", { name: "Orang tua", exact: true }).click();
    await expect(
      p.getByRole("dialog").locator(".profile-draft [data-beard=white]"),
    ).toHaveCount(1);
    await p.getByRole("button", { name: "Cadar", exact: true }).click();
    await p.getByRole("button", { name: "Shirt #663c64", exact: true }).click();
    await p.screenshot({
      path: "docs/faceless-avatar-options.png",
      fullPage: true,
      animations: "disabled",
    });
    await p.getByRole("button", { name: "Simpan profil" }).click();
    await p.screenshot({
      path: "docs/space-2-farm.png",
      fullPage: true,
      animations: "disabled",
    });
    for (const page of [p, q]) {
      await page
        .getByRole("button", { name: "Working space", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Papan tulis", exact: true })
        .click();
    }
    await p.getByLabel("Tambahkan catatan").fill("Hanya untuk Space 2");
    await p.getByRole("button", { name: "Kirim catatan" }).click();
    await expect(
      q.getByText("Hanya untuk Space 2", { exact: true }),
    ).toBeVisible();
    await p.getByRole("button", { name: "Tutup papan tulis" }).click();
    await p.getByLabel("Pilih space").selectOption("space-1");
    await expect(p.getByText("Connected", { exact: true })).toBeVisible();
    await expect(p.locator(".scene-shell")).toHaveAttribute(
      "data-space",
      "space-1",
    );
    await p.getByRole("button", { name: "Working space", exact: true }).click();
    await p.getByRole("button", { name: "Papan tulis", exact: true }).click();
    await expect(p.getByText("0 coretan · 0 catatan")).toBeVisible();
    await expect(
      p.getByText("Hanya untuk Space 2", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await a.close();
    await b.close();
  }
});

test("faceless age and head-cover presets render in the 3D world and all colors fit on mobile", async ({
  browser,
}) => {
  const c = await browser.newContext();
  try {
    await seed(c, "AvatarReview");
    const p = await c.newPage();
    const errors: string[] = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("/rooms/avatar-review-" + Date.now());
    await expect(p.getByText("Connected", { exact: true })).toBeVisible();
    for (let i = 0; i < 4; i++)
      await p.getByRole("button", { name: "Zoom in", exact: true }).click();
    for (const [label, id] of [
      ["Anak", "child"],
      ["Dewasa", "adult"],
      ["Orang tua", "elder"],
      ["Cewek", "hijab"],
      ["Cadar", "niqab"],
    ]) {
      await p.locator("button.profile").click();
      await p.getByRole("button", { name: label, exact: true }).click();
      await p.getByRole("button", { name: "Simpan profil" }).click();
      await expect(p.locator("button.profile [data-avatar]")).toHaveAttribute(
        "data-avatar",
        id === "hijab" ? "woman" : id,
      );
      // Let the 3D renderer settle after replacing the age-specific model.
      await p.evaluate(
        () =>
          new Promise<void>((resolve) => {
            let frames = 0;
            const settle = () =>
              ++frames >= 20 ? resolve() : requestAnimationFrame(settle);
            requestAnimationFrame(settle);
          }),
      );
      await p.screenshot({
        path: `docs/avatar-3d-${id}.png`,
        animations: "disabled",
      });
    }
    await p.locator("button.profile").click();
    await p.setViewportSize({ width: 390, height: 844 });
    const swatches = p
      .getByRole("dialog")
      .getByRole("button", { name: /Shirt #/ });
    await expect(swatches).toHaveCount(24);
    for (let i = 0; i < 24; i++) {
      const box = await swatches.nth(i).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      expect(box!.width).toBeGreaterThanOrEqual(30);
    }
    await swatches.last().click();
    await p.screenshot({
      path: "docs/avatar-options-mobile.png",
      fullPage: true,
    });
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await c.close();
  }
});

test("a stable avatar reconnect renews its WebRTC audio transport", async ({
  browser,
}) => {
  const a = await browser.newContext({ permissions: ["microphone", "camera"] });
  const b = await browser.newContext({ permissions: ["microphone", "camera"] });
  try {
    await seed(a, "AudioWitness");
    await seed(b, "AudioReconnect");
    const p = await a.newPage(),
      q = await b.newPage();
    const ids: string[] = [];
    const states: any[] = [];
    for (const page of [p, q])
      page.on("websocket", (ws) =>
        ws.on("framereceived", ({ payload }) => {
          try {
            const m = JSON.parse(String(payload));
            if (["state", "welcome", "error"].includes(m.type))
              states.push({
                page: page === p ? "witness" : "reconnect",
                type: m.type,
                id: m.id,
                people: m.people?.map((x: any) => ({
                  id: x.id,
                  name: x.name,
                  mic: x.mic,
                  connection: x.connection,
                })),
                message: m.message,
              });
          } catch {}
        }),
      );
    q.on("websocket", (ws) =>
      ws.on("framereceived", ({ payload }) => {
        try {
          const m = JSON.parse(String(payload));
          if (m.type === "welcome") ids.push(m.id);
        } catch {}
      }),
    );
    const url = "/rooms/audio-resume-" + Date.now();
    await p.goto(url);
    await q.goto(url);
    for (const page of [p, q])
      await page.addStyleTag({
        content: ".world-canvas {width:64px!important;height:64px!important}",
      });
    const tracks = (page: typeof p) =>
      page.locator("audio").evaluateAll((els: HTMLAudioElement[]) =>
        els.flatMap(
          (el) =>
            (el.srcObject as MediaStream | null)
              ?.getAudioTracks()
              .filter((t) => t.readyState === "live")
              .map((t) => t.id) || [],
        ),
      );
    for (const page of [p, q]) {
      await expect(page.getByText("Connected", { exact: true })).toBeVisible();
      await page
        .getByRole("button", { name: "Unmute microphone", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Mute microphone", exact: true }),
      ).toBeVisible({ timeout: 15000 });
    }
    await expect.poll(() => tracks(p), { timeout: 15000 }).not.toEqual([]);
    const before = await tracks(p);
    await q.reload();
    await q.addStyleTag({
      content: ".world-canvas {width:64px!important;height:64px!important}",
    });
    await expect(q.getByText("Connected", { exact: true })).toBeVisible();
    await expect.poll(() => ids.length).toBe(2);
    expect(new Set(ids).size).toBe(1);
    expect(new URL(q.url()).pathname).toBe(url);
    await q
      .getByRole("button", { name: "Unmute microphone", exact: true })
      .click();
    await expect(
      q.getByRole("button", { name: "Mute microphone", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    console.log(
      "Reconnect media state",
      JSON.stringify({ ids, states: states.slice(-8) }),
    );
    await expect
      .poll(async () => (await tracks(p)).some((id) => !before.includes(id)), {
        timeout: 15000,
      })
      .toBe(true);
    await expect.poll(() => tracks(q), { timeout: 15000 }).not.toEqual([]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1);
  } finally {
    await a.close();
    await b.close();
  }
});
