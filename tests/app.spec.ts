import { test, expect, type Page } from "@playwright/test";
const RUN = Date.now().toString(36);
async function join(page: Page, name: string) {
  await page.addInitScript(() =>
    localStorage.setItem("hallstatt-quality", "low"),
  );
  await page.goto(
    "/?room=qa-" +
      test
        .info()
        .testId.replace(/[^a-z0-9]/g, "")
        .slice(-20) +
      "-" +
      RUN,
  );
  await page
    .getByRole("button", { name: "Enter village", exact: true })
    .click();
  await page.getByLabel("What should we call you?").fill(name);
  await page
    .getByRole("button", { name: "Enter the village", exact: true })
    .click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible({
    timeout: 15000,
  });
}
test("3D world, navigation, settings, invitations and responsive layout", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("hallstatt-quality", "low"),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little closer, wherever you are." }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page
    .getByRole("button", { name: "Lakeside lounge A moment by the water" })
    .click();
  await expect(page.locator(".location-pill")).toContainText("Lakeside lounge");
  await page
    .getByRole("button", { name: "Space settings", exact: true })
    .click();
  await page.getByLabel("Graphics quality").selectOption("low");
  await expect(page.getByLabel("Graphics quality")).toHaveValue("low");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Invite friends" }).click();
  await expect(page.getByLabel("Your village link")).toHaveValue(
    /\/rooms\/hallstatt-village$/,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({ path: "docs/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("button", { name: "Explore the village" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore the village" }).click();
  await page.screenshot({ path: "docs/mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("two participants synchronize chat, meeting lock, host controls and removal", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const p1 = await a.newPage(),
    p2 = await b.newPage();
  await join(p1, "Ayu");
  await join(p2, "Bima");
  await p1
    .getByRole("button", { name: "People", exact: false })
    .first()
    .click();
  await expect(p1.locator(".person-row")).toHaveCount(2);
  await p2.getByRole("button", { name: "Village chat", exact: false }).click();
  await p2.getByLabel("Message the village").fill("Hello from the lake!");
  await p2.getByRole("button", { name: "Send message" }).click();
  await p1.getByRole("button", { name: "Village chat", exact: false }).click();
  await expect(
    p1.getByText("Hello from the lake!", { exact: true }),
  ).toBeVisible();
  await p1.getByRole("button", { name: "Meet", exact: true }).click();
  await p1.getByRole("button", { name: "Join the conversation" }).click();
  await expect(
    p1.getByText("The meeting house", { exact: true }).last(),
  ).toBeVisible();
  await p1.getByRole("button", { name: "Lock meeting", exact: true }).click();
  await p2.getByRole("button", { name: "Meet", exact: true }).click();
  await expect(
    p2.getByRole("button", { name: "Meeting is locked" }),
  ).toBeDisabled();
  await p2.getByRole("button", { name: "Close dialog" }).click();
  await p1
    .getByRole("button", { name: "People", exact: false })
    .first()
    .click();
  p1.on("dialog", (d) => d.accept());
  await p1.getByRole("button", { name: "Remove Bima" }).click();
  await expect(
    p2.getByText("You were removed from this space by the host."),
  ).toBeVisible();
  await expect(p1.locator(".person-row")).toHaveCount(1);
  await a.close();
  await b.close();
});
test("API rejects invalid origins and unknown routes", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect((await health.json()).ok).toBe(true);
  const unknown = await request.get("/api/unknown");
  expect(unknown.status()).toBe(404);
  const upgrade = await request.get("/api/rooms/test/socket");
  expect(upgrade.status()).toBe(426);
  const config = await request.get("/api/media-config");
  expect((await config.json()).iceServers.length).toBeGreaterThan(0);
});
for (const meetingArea of ["village", "workspace"])
  test(`real WebRTC audio and video negotiate using synthetic devices in ${meetingArea}`, async ({
    browser,
  }) => {
    const a = await browser.newContext({
        permissions: ["microphone", "camera"],
      }),
      b = await browser.newContext({ permissions: ["microphone", "camera"] });
    try {
      const p1 = await a.newPage(),
        p2 = await b.newPage();
      await join(p1, "MediaHost");
      // Keep this transport check independent of full-resolution scene GPU load.
      await p1.addStyleTag({
        content: ".world-canvas {width:64px!important;height:64px!important}",
      });
      await join(p2, "MediaGuest");
      await p2.addStyleTag({
        content: ".world-canvas {width:64px!important;height:64px!important}",
      });
      if (meetingArea === "workspace")
        await p1
          .getByRole("button", { name: "Working space", exact: true })
          .click();
      await p1
        .getByRole("button", {
          name: meetingArea === "workspace" ? "Meeting di sini" : "Meet",
          exact: true,
        })
        .click();
      await p1.getByRole("button", { name: "Join the conversation" }).click();
      if (meetingArea === "workspace")
        await p2
          .getByRole("button", { name: "Working space", exact: true })
          .click();
      await p2
        .getByRole("button", {
          name: meetingArea === "workspace" ? "Meeting di sini" : "Meet",
          exact: true,
        })
        .click();
      await p2.getByRole("button", { name: "Join the conversation" }).click();
      await p1.getByRole("button", { name: "Unmute microphone" }).click();
      await expect(
        p1.getByRole("button", { name: "Mute microphone", exact: true }),
      ).toBeVisible({ timeout: 15000 });
      await p1.getByRole("button", { name: "Turn camera on" }).click();
      await expect(
        p1.getByRole("button", { name: "Turn camera off", exact: true }),
      ).toBeVisible({ timeout: 15000 });
      await p2.getByRole("button", { name: "Unmute microphone" }).click();
      await expect(
        p2.getByRole("button", { name: "Mute microphone", exact: true }),
      ).toBeVisible({ timeout: 15000 });
      await p2.getByRole("button", { name: "Turn camera on" }).click();
      await expect(
        p2.getByRole("button", { name: "Turn camera off", exact: true }),
      ).toBeVisible({ timeout: 15000 });
      await expect(p1.locator(".media-tile video")).toHaveCount(2, {
        timeout: 15000,
      });
      await expect
        .poll(
          () =>
            p1
              .locator(".media-tile video")
              .nth(1)
              .evaluate((v: HTMLVideoElement) => v.videoWidth),
          { timeout: 15000 },
        )
        .toBeGreaterThan(0);
      await expect
        .poll(
          () =>
            p2
              .locator("audio")
              .evaluateAll((items: HTMLAudioElement[]) =>
                items.some((a) =>
                  (a.srcObject as MediaStream | null)
                    ?.getAudioTracks()
                    .some((t) => t.readyState === "live"),
                ),
              ),
          { timeout: 15000 },
        )
        .toBe(true);
      await p1
        .getByRole("button", { name: "Mute microphone", exact: true })
        .click();
      await expect
        .poll(() =>
          p2
            .locator("audio")
            .evaluateAll((items: HTMLAudioElement[]) =>
              items.every((a) => a.volume === 0),
            ),
        )
        .toBe(true);
    } finally {
      await a.close();
      await b.close();
    }
  });
