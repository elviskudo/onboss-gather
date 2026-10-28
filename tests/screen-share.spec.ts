import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import WebSocket from "ws";

async function login(context: BrowserContext, name: string) {
  await context.route("**/api/media-config", (route) =>
    route.fulfill({ json: { iceServers: [] } }),
  );
  await context.addInitScript(() => {
    localStorage.setItem("hallstatt-quality", "low");
    const state = window as any;
    state.displayStreams = [];
    state.displayRequests = 0;
    state.displayOptions = [];
    navigator.mediaDevices.getDisplayMedia = async (options) => {
      state.displayRequests++;
      state.displayOptions.push(options);
      if (state.rejectDisplay)
        throw new DOMException("Cancelled", "NotAllowedError");
      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 540;
      const ctx = canvas.getContext("2d")!;
      const paint = () => {
        ctx.fillStyle = "#294d3e";
        ctx.fillRect(0, 0, 960, 540);
        ctx.fillStyle = "#ffffff";
        ctx.font = "48px sans-serif";
        ctx.fillText("Shared presentation", 60, 120);
      };
      paint();
      const stream = canvas.captureStream(10);
      const timer = setInterval(paint, 100);
      const track = stream.getVideoTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => {
        clearInterval(timer);
        stop();
      };
      track.addEventListener("ended", () => clearInterval(timer));
      state.displayStreams.push(stream);
      if (state.delayDisplay)
        await new Promise<void>((resolve) => {
          state.resolveDisplay = resolve;
        });
      return stream;
    };
  });
  const identity = {
    sub: crypto.randomUUID(),
    name,
    email: `${crypto.randomUUID()}@example.com`,
  };
  await expect(async () => {
    expect(
      (await context.request.post("/__test/login", { data: identity })).ok(),
    ).toBe(true);
  }).toPass({ timeout: 10000 });
}

async function connected(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByText("Connected", { exact: true })).toBeVisible({
    timeout: 25000,
  });
}

async function playing(page: Page, label: string) {
  await expect
    .poll(
      () =>
        page
          .getByLabel(label, { exact: true })
          .evaluate(
            (video: HTMLVideoElement) =>
              video.readyState >= 2 &&
              video.videoWidth > 0 &&
              (video.srcObject as MediaStream)?.getVideoTracks()[0]
                ?.readyState === "live",
          ),
      { timeout: 20000 },
    )
    .toBe(true);
}

test("nearby users share camera and screen independently, stop from browser, and stop on area changes", async ({
  browser,
}) => {
  const owner = await browser.newContext({
    permissions: ["microphone", "camera"],
  });
  const guest = await browser.newContext({
    permissions: ["microphone", "camera"],
  });
  try {
    await login(owner, "ScreenOwner");
    await login(guest, "ScreenGuest");
    const a = await owner.newPage(),
      b = await guest.newPage();
    const url = "/rooms/screen-" + Date.now();
    await connected(a, url);
    await expect(
      a.getByRole("button", { name: "Bagikan layar", exact: true }),
    ).toBeDisabled();
    await connected(b, url);
    await a
      .getByRole("button", { name: "Turn camera on", exact: true })
      .click();
    await expect(
      a.getByRole("button", { name: "Turn camera off", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(b.locator(".proximity-overlay video")).toHaveCount(1, {
      timeout: 15000,
    });
    await a.getByRole("button", { name: "Bagikan layar", exact: true }).click();
    await playing(b, "Layar dibagikan ScreenOwner");
    await expect(b.locator(".proximity-overlay video")).toHaveCount(1);
    expect(
      await b.evaluate(() => {
        const screen = document.querySelector<HTMLVideoElement>(
          ".screen-share-panel video",
        )!;
        const camera = document.querySelector<HTMLVideoElement>(
          ".proximity-overlay video",
        )!;
        return (
          (screen.srcObject as MediaStream).getVideoTracks()[0].id !==
          (camera.srcObject as MediaStream).getVideoTracks()[0].id
        );
      }),
    ).toBe(true);
    await a
      .getByRole("button", { name: "Turn camera off", exact: true })
      .click();
    await playing(b, "Layar dibagikan ScreenOwner");
    // Browser chrome's Stop sharing ends the track; stopping a track in JS alone
    // does not dispatch ended, so simulate that browser event explicitly.
    await a.evaluate(() => {
      const track = (window as any).displayStreams.at(-1).getVideoTracks()[0];
      track.stop();
      track.dispatchEvent(new Event("ended"));
    });
    await expect(
      b.getByRole("region", { name: "Layar bersama", exact: true }),
    ).toHaveCount(0);
    await expect(
      a.getByRole("button", { name: "Bagikan layar", exact: true }),
    ).toBeVisible();
    await a.getByRole("button", { name: "Bagikan layar", exact: true }).click();
    await playing(b, "Layar dibagikan ScreenOwner");
    await b.setViewportSize({ width: 390, height: 844 });
    expect(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await b.locator(".call-controls button").evaluateAll((buttons) =>
        buttons
          .filter((button) => button.getClientRects().length)
          .every((button) => {
            const rect = button.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth;
          }),
      ),
    ).toBe(true);
    await b.screenshot({ path: "test-results/shared-screen-mobile.png" });
    await a.getByRole("button", { name: "Working space", exact: true }).click();
    await expect(
      a.getByRole("region", { name: "Layar bersama", exact: true }),
    ).toHaveCount(0);
    await expect(
      b.getByRole("region", { name: "Layar bersama", exact: true }),
    ).toHaveCount(0);
    expect(
      await a.evaluate(() =>
        (window as any).displayStreams.every((s: MediaStream) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
    ).toBe(true);
    await a
      .getByRole("button", { name: "Keluar ke desa", exact: true })
      .click();
    await expect(
      a.getByRole("button", { name: "Bagikan layar", exact: true }),
    ).toBeEnabled();
    await expect(
      a.getByRole("region", { name: "Layar bersama", exact: true }),
    ).toHaveCount(0);
    // A departing last participant also releases the presenter's capture.
    await a.getByRole("button", { name: "Bagikan layar", exact: true }).click();
    await playing(b, "Layar dibagikan ScreenOwner");
    await b.getByRole("button", { name: "Leave village", exact: true }).click();
    await expect(
      a.getByRole("region", { name: "Layar bersama", exact: true }),
    ).toHaveCount(0);
    expect(
      await a.evaluate(
        () =>
          (window as any).displayStreams.at(-1).getVideoTracks()[0].readyState,
      ),
    ).toBe("ended");
    await a.getByRole("button", { name: "Leave village", exact: true }).click();
  } finally {
    await Promise.all([owner.close(), guest.close()]);
  }
});

test("cancelled or delayed screen picker cannot resume capture after leaving", async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    guest = await browser.newContext();
  try {
    await login(owner, "PickerOwner");
    await login(guest, "PickerGuest");
    const a = await owner.newPage(),
      b = await guest.newPage();
    const url = "/rooms/picker-" + Date.now();
    await connected(a, url);
    await connected(b, url);
    await a.evaluate(() => {
      (window as any).rejectDisplay = true;
    });
    await a.getByRole("button", { name: "Bagikan layar", exact: true }).click();
    await expect(a.getByRole("status")).toContainText("dibatalkan");
    await expect(
      a.getByRole("button", { name: "Bagikan layar", exact: true }),
    ).toBeEnabled();
    await a.evaluate(() => {
      (window as any).rejectDisplay = false;
      (window as any).delayDisplay = true;
    });
    await a.getByRole("button", { name: "Bagikan layar", exact: true }).click();
    await expect(
      a.getByRole("button", { name: "Hentikan berbagi layar", exact: true }),
    ).toBeVisible();
    await a.getByRole("button", { name: "Leave village", exact: true }).click();
    await a.evaluate(() => (window as any).resolveDisplay());
    await expect
      .poll(() =>
        a.evaluate(
          () =>
            (window as any).displayStreams.at(-1).getVideoTracks()[0]
              .readyState,
        ),
      )
      .toBe("ended");
    await expect(
      b.getByRole("region", { name: "Layar bersama", exact: true }),
    ).toHaveCount(0);
  } finally {
    await Promise.all([owner.close(), guest.close()]);
  }
});

test("nearby users can invite each other to the village whiteboard and edit together", async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    guest = await browser.newContext();
  try {
    await login(owner, "VillageOwner");
    await login(guest, "VillageGuest");
    const a = await owner.newPage(),
      b = await guest.newPage();
    const url = "/rooms/village-board-" + Date.now();
    await connected(a, url);
    await connected(b, url);
    await a
      .getByRole("button", { name: "Bagikan papan tulis", exact: true })
      .click();
    await expect(
      b.getByRole("region", { name: "Undangan papan tulis" }),
    ).toContainText("VillageOwner");
    await b
      .getByRole("button", { name: "Buka papan bersama", exact: true })
      .click();
    await a.getByLabel("Tambahkan catatan").fill("Ide saat bertemu di desa");
    await a.getByRole("button", { name: "Kirim catatan", exact: true }).click();
    await expect(
      b.getByText("Ide saat bertemu di desa", { exact: true }),
    ).toBeVisible();
    const canvas = await b
      .getByLabel("Kanvas papan tulis bersama")
      .boundingBox();
    await b.mouse.move(canvas!.x + 50, canvas!.y + 50);
    await b.mouse.down();
    await b.mouse.move(canvas!.x + 120, canvas!.y + 90, { steps: 4 });
    await b.mouse.up();
    await expect(
      a.getByText("1 coretan · 1 catatan", { exact: true }),
    ).toBeVisible();
    for (const page of [a, b])
      await page
        .getByRole("button", { name: "Tutup papan tulis", exact: true })
        .click();
    await b.getByRole("button", { name: "Working space", exact: true }).click();
    await a
      .getByRole("button", { name: "Bagikan papan tulis", exact: true })
      .click();
    await a.getByLabel("Tambahkan catatan").fill("Hanya papan desa");
    await a.getByRole("button", { name: "Kirim catatan", exact: true }).click();
    await b.getByRole("button", { name: "Papan tulis", exact: true }).click();
    await expect(
      b.getByText("0 coretan · 0 catatan", { exact: true }),
    ).toBeVisible();
    await expect(
      b.getByRole("region", { name: "Undangan papan tulis" }),
    ).toHaveCount(0);
  } finally {
    await Promise.all([owner.close(), guest.close()]);
  }
});

test("meeting participants share both screens while microphone audio continues, then stop when leaving the meeting", async ({
  browser,
}) => {
  const owner = await browser.newContext({
    permissions: ["microphone", "camera"],
  });
  const guest = await browser.newContext({
    permissions: ["microphone", "camera"],
  });
  try {
    await login(owner, "MeetingOwner");
    await login(guest, "MeetingGuest");
    const a = await owner.newPage(),
      b = await guest.newPage();
    const url = "/rooms/meeting-screen-" + Date.now();
    await connected(a, url);
    await connected(b, url);
    for (const page of [a, b]) {
      await page
        .getByRole("button", { name: "Working space", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Duduk & meeting", exact: true })
        .click();
      await expect(page.locator(".presence strong")).toHaveText(
        "Meeting audio",
      );
    }
    for (const page of [a, b]) {
      const quickbar = page.locator(".social-quickbar");
      await expect(quickbar.getByRole("button")).toHaveText([
        /Bangun dari kursi/,
        "Bangun",
        "Share screen",
        "Papan tulis",
      ]);
      await expect(
        quickbar.getByRole("button", { name: "Share screen", exact: true }),
      ).toBeEnabled();
    }
    await b.setViewportSize({ width: 390, height: 844 });
    expect(
      await b.locator(".social-quickbar button").evaluateAll((buttons) =>
        buttons.every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth;
        }),
      ),
    ).toBe(true);
    await b.screenshot({
      path: "test-results/seated-screen-share-quickbar.png",
      animations: "disabled",
    });
    await a
      .getByRole("button", { name: "Unmute microphone", exact: true })
      .click();
    await a
      .locator(".social-quickbar")
      .getByRole("button", { name: "Share screen", exact: true })
      .click();
    expect(
      await a.evaluate(() => (window as any).displayOptions.at(-1)),
    ).toMatchObject({
      monitorTypeSurfaces: "include",
      selfBrowserSurface: "include",
      surfaceSwitching: "include",
    });
    expect(
      await a.evaluate(
        () => (window as any).displayOptions.at(-1).video.displaySurface,
      ),
    ).toBeUndefined();
    await expect(
      a
        .locator(".social-quickbar")
        .getByRole("button", { name: "Hentikan share screen", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await playing(b, "Layar dibagikan MeetingOwner");
    await b
      .locator(".social-quickbar")
      .getByRole("button", { name: "Share screen", exact: true })
      .click();
    await playing(a, "Layar dibagikan MeetingGuest");
    for (const page of [a, b])
      await expect(
        page
          .getByRole("navigation", { name: "Pilih layar" })
          .getByRole("button"),
      ).toHaveCount(2);
    await expect
      .poll(() =>
        b
          .locator("audio")
          .evaluateAll((elements: HTMLAudioElement[]) =>
            elements.some((e) =>
              (e.srcObject as MediaStream)
                ?.getAudioTracks()
                .some((t) => t.readyState === "live"),
            ),
          ),
      )
      .toBe(true);
    await a
      .locator(".social-quickbar")
      .getByRole("button", { name: "Hentikan share screen", exact: true })
      .click();
    await expect(
      b.getByLabel("Pratinjau layar kamu", { exact: true }),
    ).toBeVisible();
    await expect(
      b.getByRole("navigation", { name: "Pilih layar" }),
    ).toHaveCount(0);
    await b.getByRole("button", { name: "Leave meeting", exact: true }).click();
    await expect(
      b.getByRole("region", { name: "Layar bersama", exact: true }),
    ).toHaveCount(0);
    await expect(
      a.getByRole("region", { name: "Layar bersama", exact: true }),
    ).toHaveCount(0);
    expect(
      await b.evaluate(
        () =>
          (window as any).displayStreams.at(-1).getVideoTracks()[0].readyState,
      ),
    ).toBe("ended");
  } finally {
    await Promise.all([owner.close(), guest.close()]);
  }
});

test("larger camera/screen signaling is relayed while oversized chat and signaling are rejected", async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    guest = await browser.newContext();
  const sockets: WebSocket[] = [];
  const room = "signal-size-" + Date.now();
  async function connect(context: BrowserContext) {
    const cookie = (await context.cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const ws = new WebSocket(`ws://127.0.0.1:8789/api/rooms/${room}/socket`, {
      headers: { Origin: "http://127.0.0.1:8789", Cookie: cookie },
    });
    sockets.push(ws);
    const messages: any[] = [];
    let closed = 0;
    ws.on("message", (data) => {
      try {
        messages.push(JSON.parse(String(data)));
      } catch {}
    });
    ws.on("close", (code) => {
      closed = code;
    });
    await expect
      .poll(() => messages.find((m) => m.type === "welcome")?.id)
      .toBeTruthy();
    return {
      ws,
      messages,
      id: messages.find((m) => m.type === "welcome").id,
      closed: () => closed,
    };
  }
  try {
    await login(owner, "SignalOwner");
    await login(guest, "SignalGuest");
    const a = await connect(owner),
      b = await connect(guest);
    const description = { type: "offer", sdp: "v=0\r\n" + "a".repeat(24000) };
    a.ws.send(
      JSON.stringify({ type: "signal", to: b.id, payload: { description } }),
    );
    await expect
      .poll(
        () =>
          b.messages.find((m) => m.type === "signal")?.payload.description.sdp,
      )
      .toBe(description.sdp);
    a.ws.send(JSON.stringify({ type: "chat", text: "x".repeat(17000) }));
    await expect.poll(a.closed).toBe(1009);
    const c = await connect(owner);
    c.ws.send("x".repeat(17000));
    await expect.poll(c.closed).toBe(1009);
    const d = await connect(owner);
    d.ws.send(
      JSON.stringify({
        type: "signal",
        to: b.id,
        payload: { description: { type: "offer", sdp: "x".repeat(66000) } },
      }),
    );
    await expect.poll(d.closed).toBe(1009);
  } finally {
    for (const ws of sockets) ws.close();
    await Promise.all([owner.close(), guest.close()]);
  }
});
