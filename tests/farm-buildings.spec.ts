import { test, expect } from "@playwright/test";
test("3D farm architecture renders from both sides and all four meeting interiors remain accessible", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("hallstatt-quality", "high"),
  );
  expect(
    (
      await page.request.post("/__test/login", {
        data: {
          name: "Architect",
          email: `architect-${Date.now()}@example.com`,
        },
      })
    ).ok(),
  ).toBe(true);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`/rooms/architecture-${Date.now()}?space=space-2`);
  await expect(page.locator(".connection")).toHaveText("Connected");
  await expect(page.locator("canvas[data-assets-loaded=true]")).toBeVisible();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.screenshot({ path: "docs/farm-buildings-3d.png" });
  await page.getByRole("button", { name: "Rotate view", exact: true }).click();
  await page.getByRole("button", { name: "Rotate view", exact: true }).click();
  await page.screenshot({ path: "docs/farm-buildings-side.png" });
  for (const name of [
    "Working space",
    "Community hall",
    "Lakeside house",
    "Creative studio",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".farm-hud")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Meeting di sini", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Papan tulis", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Tutup papan tulis", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Tutup papan tulis", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Keluar ke desa", exact: true })
      .click();
    await expect(page.locator(".farm-hud")).toBeVisible();
  }
  expect(errors).toEqual([]);
});
