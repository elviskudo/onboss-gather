import { test, expect } from "@playwright/test";
const origin = "http://127.0.0.1:8789";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("hallstatt-quality", "low"),
  );
});
test("anonymous visitors see a separate login page without loading the 3D village", async ({
  page,
  request,
}) => {
  const assets: string[] = [];
  page.on("request", (r) => assets.push(r.url()));
  await page.goto("/?room=design-team");
  await expect(page).toHaveURL(/\/login\?room=design-team/);
  await expect(
    page.getByRole("heading", { name: "Selamat datang." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in with Google" }),
  ).toHaveAttribute("href", "/api/auth/google?room=design-team");
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(assets.some((a) => /\/three-|\/World-/.test(a))).toBe(false);
  expect((await request.get("/api/founder/summary")).status()).toBe(401);
  expect(
    (
      await request.get("/api/founder/summary", {
        headers: {
          "X-User-Email": "elviskudo@gmail.com",
          "X-Founder": "true",
          Cookie: "hallstatt_session=forged",
        },
      })
    ).status(),
  ).toBe(401);
  for (const path of ["/", "/index.html", "/founder"])
    expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(302);
  await page.screenshot({ path: "docs/login-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("link", { name: "Sign in with Google" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/login-mobile.png", fullPage: true });
});
test("ordinary accounts enter the village but cannot read founder analytics or impersonate the founder", async ({
  page,
  context,
}) => {
  const login = await context.request.post("/__test/login", {
    data: { email: "member@example.com", name: "Maya" },
  });
  expect(login.ok()).toBe(true);
  const session = await context.request
    .get("/api/auth/session")
    .then((r) => r.json());
  expect(session.user.founder).toBe(false);
  expect(
    (
      await context.request.get("/api/founder/summary", {
        headers: { "X-User-Email": "elviskudo@gmail.com", "X-Founder": "true" },
      })
    ).status(),
  ).toBe(403);
  expect((await context.request.get("/founder")).status()).toBe(403);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Enter village", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".founder-entry")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Sign in with Google" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Selamat datang." }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect((await context.request.get("/api/founder/summary")).status()).toBe(
    401,
  );
});
test("founder sees durable real visits, registrations, joins and meeting participation", async ({
  page,
  context,
  browser,
}) => {
  await context.request.post("/__test/login", {
    data: { email: "elviskudo@gmail.com", name: "Elvis" },
  });
  const before = await context.request
    .get("/api/founder/summary")
    .then((r) => r.json());
  expect(before.totals.users).toBeGreaterThan(0);
  const visitor = await browser.newContext();
  const headers = { Origin: origin };
  try {
    expect((await visitor.request.post("/api/visits", { headers })).ok()).toBe(
      true,
    );
    expect((await visitor.request.post("/api/visits", { headers })).ok()).toBe(
      true,
    );
    const after = await context.request
      .get("/api/founder/summary")
      .then((r) => r.json());
    expect(after.totals.visits).toBe(before.totals.visits + 1);
    expect(after.totals.visitors).toBe(before.totals.visitors + 1);
    const member = await browser.newContext();
    try {
      const email = `ari-${Date.now()}@example.com`;
      await member.request.post("/__test/login", {
        data: { email, name: "Ari", sub: email },
      });
      const memberPage = await member.newPage();
      await memberPage.goto("/");
      await memberPage
        .getByRole("button", { name: "Enter village", exact: true })
        .click();
      await memberPage
        .getByRole("dialog")
        .getByRole("button", { name: "Enter the village", exact: true })
        .click();
      await expect(memberPage.locator(".connection")).toContainText(
        "Connected",
      );
      // Send via a second authenticated WebSocket, exercising real Worker admission and meeting events.
      const result = await memberPage.evaluate(
        async () =>
          await new Promise<boolean>((resolve, reject) => {
            const ws = new WebSocket(
              `ws://${location.host}/api/rooms/founder-test/socket?name=Ari`,
            );
            ws.onmessage = (e) => {
              const message = JSON.parse(e.data);
              if (message.type === "welcome")
                ws.send(JSON.stringify({ type: "meeting", join: true }));
              if (
                message.type === "state" &&
                message.people.some(
                  (p: { name: string; meeting: boolean }) =>
                    p.name === "Ari" && p.meeting,
                )
              ) {
                ws.close();
                resolve(true);
              }
            };
            ws.onerror = () => reject(Error("socket failed"));
            setTimeout(() => {
              ws.close();
              reject(Error("socket timeout"));
            }, 10000);
          }),
      );
      expect(result).toBe(true);
      const summary = await context.request
        .get("/api/founder/summary")
        .then((r) => r.json());
      expect(summary.totals.users).toBe(before.totals.users + 1);
      expect(summary.totals.joins).toBeGreaterThanOrEqual(
        before.totals.joins + 2,
      );
      expect(summary.totals.joinedUsers).toBeGreaterThanOrEqual(
        before.totals.joinedUsers + 1,
      );
      expect(summary.totals.meetings).toBe(before.totals.meetings + 1);
      expect(
        summary.users.some((u: { email: string }) => u.email === email),
      ).toBe(true);
      await page.goto("/founder");
      await expect(
        page.getByRole("heading", { name: "Desamu, dalam angka." }),
      ).toBeVisible();
      await expect(
        page.getByRole("cell", { name: email, exact: false }).first(),
      ).toBeVisible();
      await page.screenshot({
        path: "docs/founder-desktop.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: "docs/founder-mobile.png",
        fullPage: true,
      });
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Desamu, dalam angka." }),
      ).toBeVisible();
      expect(
        (
          await context.request.get(
            "/api/founder/summary?usersPage=1&joinsPage=1",
          )
        ).ok(),
      ).toBe(true);
    } finally {
      await member.close();
    }
  } finally {
    await visitor.close();
  }
});

test("founder account pages are bounded and revoked founder sessions lose access", async ({
  context,
}) => {
  await context.request.post("/__test/login", {
    data: {
      email: "elviskudo@gmail.com",
      name: "Elvis",
      sub: "founder-pagination",
    },
  });
  const ownerCookies = await context.cookies();
  for (let i = 0; i < 26; i++)
    await context.request.post("/__test/login", {
      data: {
        email: `page-${i}@example.com`,
        name: `Page ${i}`,
        sub: `pagination-${i}`,
      },
    });
  await context.addCookies(ownerCookies);
  const first = await context.request
    .get("/api/founder/summary")
    .then((r) => r.json());
  const second = await context.request
    .get("/api/founder/summary?usersPage=1")
    .then((r) => r.json());
  expect(first.users.length).toBe(25);
  expect(second.users.length).toBeGreaterThan(0);
  expect(
    first.users.some((a: { id: string }) =>
      second.users.some((b: { id: string }) => a.id === b.id),
    ),
  ).toBe(false);
  expect(
    (
      await context.request.post("/api/visits", {
        headers: { Origin: "https://attacker.invalid" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post("/api/auth/logout", {
        headers: { Origin: origin },
      })
    ).ok(),
  ).toBe(true);
  expect((await context.request.get("/api/founder/summary")).status()).toBe(
    401,
  );
});
