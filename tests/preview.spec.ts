import { test, expect } from "@playwright/test";
test("static preview has a login gateway without starting multiplayer or downloading the 3D scene", async ({
  page,
}) => {
  test.skip(process.env.STATIC_PREVIEW !== "1", "Preview build required");
  const sockets: string[] = [];
  const requests: string[] = [];
  page.on("websocket", (s) => sockets.push(s.url()));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/rooms/team-preview");
  await expect(
    page.getByRole("heading", { name: "Selamat datang." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in with Google" }),
  ).toHaveAttribute(
    "href",
    "https://hallstatt-social.elviskudo.workers.dev/api/auth/google?room=team-preview",
  );
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(sockets).toEqual([]);
  expect(requests.some((r) => r.includes("/api/") || /\/three-/.test(r))).toBe(
    false,
  );
});
