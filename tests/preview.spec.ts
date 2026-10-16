import { test, expect } from "@playwright/test";
test("static preview keeps media and networking disabled while allowing avatar customization", async ({
  page,
}) => {
  test.skip(
    process.env.STATIC_PREVIEW !== "1",
    "Only run against a preview-mode build.",
  );
  await page.addInitScript(() =>
    localStorage.setItem("hallstatt-quality", "low"),
  );
  const sockets: string[] = [];
  page.on("websocket", (s) => sockets.push(s.url()));
  await page.goto("/");
  await expect(
    page.getByText("Exploration preview", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Unmute microphone" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Turn camera on" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Customize avatar" }).click();
  await page.getByLabel("What should we call you?").fill("Tari");
  await page.getByRole("button", { name: "Cewek", exact: true }).click();
  await page.getByRole("button", { name: "Save and explore" }).click();
  await expect(page.locator(".profile")).toContainText("Tari");
  await expect(page.getByRole("status")).toContainText(
    "This preview lets you explore on your own.",
  );
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.reload();
  await expect(page.locator(".profile .avatar-portrait")).toHaveAttribute(
    "aria-label",
    "Cewek avatar",
  );
  await page.getByRole("button", { name: "Customize avatar" }).click();
  await expect(
    page.getByRole("button", { name: "Cewek", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({
    path: "docs/preview.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(sockets).toEqual([]);
});
