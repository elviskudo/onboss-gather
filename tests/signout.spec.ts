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
    page.getByRole("heading", { name: "Selamat datang." }),
  ).toBeVisible();
  expect(revoked).toBe(true);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Sign in with Google" }),
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
test("preview starts at the separate login page and sends sign in to the live application", async ({
  page,
}) => {
  test.skip(!preview, "Login preview required");
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) requests.push(r.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Selamat datang." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in with Google" }),
  ).toHaveAttribute(
    "href",
    /https:\/\/hallstatt-social.elviskudo.workers.dev\/api\/auth\/google/,
  );
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(requests).toEqual([]);
});
