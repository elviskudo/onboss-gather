import { test, expect } from "@playwright/test";
const preview = process.env.STATIC_PREVIEW === "1";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("hallstatt-quality", "low"),
  );
});
test("Google sign in preserves the invited room and is visible on mobile", async ({
  page,
}) => {
  if (!preview)
    await page.route("**/api/auth/session", (r) =>
      r.fulfill({ json: { required: true, configured: true, user: null } }),
    );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?room=team-meeting");
  const link = page
    .locator(".top-actions")
    .getByRole("link", { name: "Sign in with Google" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute(
    "href",
    `${preview ? "https://hallstatt-social.elviskudo.workers.dev" : ""}/api/auth/google?room=team-meeting`,
  );
  await expect(link).toHaveAttribute("target", "_top");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", {
      name: preview ? "Customize avatar" : "Enter village",
    })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "Sign in with Google" }),
  ).toBeVisible();
  await page.screenshot({
    path: `docs/google-signin-${preview ? "preview" : "full"}-mobile.png`,
    animations: "disabled",
  });
});
test("missing OAuth configuration shows a useful message without a broken Google link", async ({
  page,
}) => {
  test.skip(preview, "Full app required");
  await page.route("**/api/auth/session", (r) =>
    r.fulfill({ json: { required: true, configured: false, user: null } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", {
      name: preview ? "Customize avatar" : "Enter village",
    })
    .click();
  await expect(
    page.getByText("Login Google menunggu konfigurasi pemilik aplikasi."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in with Google" }),
  ).toHaveCount(0);
});
test("real OAuth endpoint issues PKCE, secure state and rejects forged callbacks", async ({
  request,
}) => {
  test.skip(preview, "Full app required");
  const response = await request.get("/api/auth/google?room=team-meeting", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(302);
  const destination = new URL(response.headers().location);
  expect(destination.origin).toBe("https://accounts.google.com");
  expect(destination.searchParams.get("redirect_uri")).toBe(
    "http://127.0.0.1:8787/api/auth/callback",
  );
  expect(destination.searchParams.get("code_challenge_method")).toBe("S256");
  expect(destination.searchParams.get("state")).toHaveLength(64);
  expect(response.headers()["set-cookie"]).toContain("HttpOnly; SameSite=Lax");
  const invalid = await request.get(
    "/api/auth/callback?state=forged&code=forged",
  );
  expect(invalid.status()).toBe(400);
});
