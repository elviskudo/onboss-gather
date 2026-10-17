import { test, expect, type Page } from "@playwright/test";
const room = "spaces-" + Date.now();
async function join(page: Page, name: string) {
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
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
}
test("profiles synchronize, eight presets save, and meetings stay inside their building", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const p1 = await a.newPage(),
    p2 = await b.newPage();
  const errors: string[] = [];
  p1.on("pageerror", (e) => errors.push(e.message));
  try {
    await join(p1, "Nadia");
    await join(p2, "Rafi");
    await p1
      .getByRole("button", { name: "Buka profil Nadia", exact: true })
      .click();
    const dialog = p1.getByRole("dialog");
    await expect(dialog.locator(".avatar-presets button")).toHaveCount(8);
    await dialog.getByRole("button", { name: "Cewek", exact: true }).click();
    await p1.getByLabel("Tentang kamu").fill("Product designer");
    await p1
      .getByRole("button", { name: "Shirt #798ab6", exact: true })
      .click();
    await p1.getByRole("button", { name: "Simpan profil" }).click();
    await p2
      .getByRole("button", { name: "People", exact: false })
      .first()
      .click();
    await p2
      .getByRole("button", { name: "View profile Nadia", exact: true })
      .click();
    await expect(p2.getByRole("dialog")).toContainText("Product designer");
    await expect(p2.getByRole("dialog")).toContainText("Cewek");
    await p2.getByRole("button", { name: "Close dialog" }).click();
    await p1
      .getByRole("button", { name: "Working space", exact: true })
      .click();
    await expect(p1.locator(".space-switcher strong")).toHaveText(
      "Working space",
    );
    await p2
      .getByRole("button", { name: "Community hall", exact: true })
      .click();
    for (const p of [p1, p2]) {
      await p.getByRole("button", { name: "Meeting di sini" }).click();
      await p.getByRole("button", { name: "Join the conversation" }).click();
      await expect(p.locator(".meeting-top small")).toHaveText("1 here");
    }
    await p1.screenshot({
      path: "docs/interior.png",
      fullPage: true,
      animations: "disabled",
    });
    await p2.getByRole("button", { name: "Keluar ke desa" }).click();
    await expect(p2.locator(".meeting-overlay")).toHaveCount(0);
    await p2
      .getByRole("button", { name: "Working space", exact: true })
      .click();
    await p2.getByRole("button", { name: "Meeting di sini" }).click();
    await p2.getByRole("button", { name: "Join the conversation" }).click();
    await expect(p1.locator(".meeting-top small")).toHaveText("2 here");
    await p2.getByRole("button", { name: "Keluar ke desa" }).click();
    await p1.getByRole("button", { name: "Keluar ke desa" }).click();
    await p1.locator("button.profile").click();
    await p1.screenshot({
      path: "docs/profile.png",
      fullPage: true,
      animations: "disabled",
    });
    await p1.getByRole("button", { name: "Close dialog" }).click();
    await p1.screenshot({
      path: "docs/avatar-world.png",
      fullPage: true,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});
test("Google routes respect OAuth configuration and reject invalid callbacks", async ({
  request,
}) => {
  const session = await request.get("/api/auth/session");
  const info = await session.json();
  expect(info).toMatchObject({ required: false, user: null });
  const login = await request.get("/api/auth/google", { maxRedirects: 0 });
  expect(login.status()).toBe(info.configured ? 302 : 503);
  if (info.configured)
    expect(new URL(login.headers().location).origin).toBe(
      "https://accounts.google.com",
    );
  expect(
    (await request.get("/api/auth/callback?state=forged&code=forged")).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/auth/logout", {
        headers: { Origin: "https://attacker.invalid" },
      })
    ).status(),
  ).toBe(403);
});
