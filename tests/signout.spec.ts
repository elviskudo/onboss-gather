import { test, expect } from "@playwright/test";
const preview = process.env.STATIC_PREVIEW === "1";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("hallstatt-quality", "low"),
  );
});
test("account sign out revokes the session, removes the world and offers sign in again", async ({
  page,
}) => {
  test.skip(preview, "Full application mode required");
  let revoked = false;
  await page.route("**/api/auth/session", (r) =>
    r.fulfill({
      json: {
        required: true,
        configured: true,
        user: revoked ? null : { name: "Maya" },
      },
    }),
  );
  await page.route("**/api/auth/logout", async (r) => {
    expect(r.request().method()).toBe("POST");
    revoked = true;
    await r.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Kamu sudah keluar." }),
  ).toBeVisible();
  expect(revoked).toBe(true);
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Masuk kembali" }).click();
  await expect(
    page.getByRole("link", { name: "Lanjutkan dengan Google" }),
  ).toBeVisible();
});
test("failed logout does not claim that the account session ended", async ({
  page,
}) => {
  test.skip(preview, "Full application mode required");
  await page.route("**/api/auth/session", (r) =>
    r.fulfill({
      json: { required: true, configured: true, user: { name: "Maya" } },
    }),
  );
  await page.route("**/api/auth/logout", (r) =>
    r.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Sesi akun belum diakhiri",
  );
  await expect(
    page.getByRole("heading", { name: "Kamu sudah keluar." }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeEnabled();
});
test("preview exposes sign out on mobile and profile, with a real end-of-visit screen", async ({
  page,
}) => {
  test.skip(!preview, "Exploration preview required");
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/auth/")) requests.push(r.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Kamu sudah keluar." }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.screenshot({
    path: "docs/signout-mobile.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Masuk kembali" }).click();
  await page.getByRole("button", { name: "Save and explore" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("button.profile").click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kamu sudah keluar." }),
  ).toBeVisible();
  expect(requests).toEqual([]);
});
