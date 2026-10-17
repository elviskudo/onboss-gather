import { test, expect } from "@playwright/test";
test.use({
  actionTimeout: 15000,
  ...(process.platform === "darwin"
    ? {
        launchOptions: {
          executablePath:
            process.env.CHROME_PATH ||
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          args: ["--enable-gpu", "--use-angle=metal"],
        },
      }
    : {}),
});
test("smooth farming village renders, profiles work, and interiors stay navigable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.addInitScript(() =>
    localStorage.setItem("hallstatt-quality", "low"),
  );
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await page.screenshot({
    path: "docs/cozy-overview.png",
    animations: "disabled",
    timeout: 10000,
  });
  console.log("3D overview captured");
  const person = page.getByRole("button", {
    name: "Buka profil Explorer",
    exact: true,
  });
  await expect(person).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await person.click();
  await expect(
    page.getByRole("dialog").locator(".avatar-presets button"),
  ).toHaveCount(8);
  await page.getByRole("button", { name: "Cewek", exact: true }).click();
  await page.getByRole("button", { name: "Simpan profil" }).click();
  await page.screenshot({
    path: "docs/cozy-character.png",
    fullPage: true,
    animations: "disabled",
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Reset view" }).click();
  await page
    .getByRole("button", { name: "Alpine garden A little room to think" })
    .click();
  await expect(page.locator(".location-pill")).toContainText("Alpine garden");
  await page.screenshot({
    path: "docs/cozy-village.png",
    fullPage: true,
    animations: "disabled",
    timeout: 10000,
  });
  await page
    .getByRole("button", { name: "Working space", exact: true })
    .click();
  await expect(page.locator(".space-switcher strong")).toHaveText(
    "Working space",
  );
  await page.screenshot({
    path: "docs/cozy-interior.png",
    fullPage: true,
    animations: "disabled",
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Keluar ke desa" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/cozy-mobile.png",
    fullPage: true,
    animations: "disabled",
    timeout: 10000,
  });
  expect(errors).toEqual([]);
});
