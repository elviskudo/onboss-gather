import { test, expect, type BrowserContext } from "@playwright/test";
const origin = "http://127.0.0.1:8789";
async function signIn(context: BrowserContext, name: string) {
  await context.addInitScript(() =>
    localStorage.setItem("hallstatt-quality", "low"),
  );
  const r = await context.request.post("/__test/login", {
    data: { name, email: `${name.toLowerCase()}-${Date.now()}@example.com` },
  });
  expect(r.ok()).toBe(true);
}
test("two authenticated accounts automatically meet through the same room invitation; another room stays isolated", async ({
  browser,
}) => {
  const room = "invitation-" + Date.now(),
    url = origin + "/rooms/" + room;
  const owner = await browser.newContext(),
    guest = await browser.newContext(),
    other = await browser.newContext();
  try {
    await signIn(owner, "Owner");
    const a = await owner.newPage();
    await a.goto(url);
    await expect(a.getByText("Connected", { exact: true })).toBeVisible();
    await a
      .getByRole("button", { name: "Invite friends", exact: true })
      .click();
    await expect(a.getByLabel("Your village link")).toHaveValue(url);
    const invitation = await a.getByLabel("Your village link").inputValue();
    await a.getByRole("button", { name: "Close dialog" }).click();
    const b = await guest.newPage();
    await b.goto(invitation);
    await expect(b).toHaveURL(new RegExp("/login\\?room=" + room));
    await expect(
      b.getByRole("link", { name: "Sign in with Google" }),
    ).toHaveAttribute("href", "/api/auth/google?room=" + room);
    // The test fixture substitutes only Google's identity step; routing and room sockets are real.
    await signIn(guest, "Guest");
    await b.reload();
    await expect(b).toHaveURL(url);
    await expect(b.getByText("Connected", { exact: true })).toBeVisible();
    for (const p of [a, b])
      await p
        .getByRole("button", { name: "People", exact: false })
        .first()
        .click();
    await expect(
      a.getByRole("button", { name: "View profile Guest", exact: true }),
    ).toBeVisible();
    await expect(
      b.getByRole("button", { name: "View profile Owner", exact: true }),
    ).toBeVisible();
    await b.getByRole("button", { name: "Village chat", exact: false }).click();
    await b
      .getByLabel("Message the village")
      .fill("Hello from the invited account");
    await b.getByRole("button", { name: "Send message" }).click();
    await a.getByRole("button", { name: "Village chat", exact: false }).click();
    await expect(
      a.getByText("Hello from the invited account", { exact: true }),
    ).toBeVisible();
    for (const page of [a, b])
      await page
        .getByRole("button", { name: "People", exact: false })
        .first()
        .click();
    await signIn(other, "Other");
    const c = await other.newPage();
    await c.goto(origin + "/rooms/separate-" + Date.now());
    await expect(c.getByText("Connected", { exact: true })).toBeVisible();
    await c
      .getByRole("button", { name: "People", exact: false })
      .first()
      .click();
    await expect(
      c.getByRole("button", { name: "View profile Owner", exact: true }),
    ).toHaveCount(0);
    await expect(
      a.getByRole("button", { name: "View profile Other", exact: true }),
    ).toHaveCount(0);
    await b.reload();
    await expect(b.getByText("Connected", { exact: true })).toBeVisible();
    await b
      .getByRole("button", { name: "People", exact: false })
      .first()
      .click();
    await expect(
      b.getByRole("button", { name: "View profile Owner", exact: true }),
    ).toBeVisible();
    await expect(
      a.getByRole("button", { name: "View profile Guest", exact: true }),
    ).toHaveCount(1);
    await a.screenshot({
      path: "docs/shared-room-owner.png",
      fullPage: true,
      animations: "disabled",
    });
    await b.screenshot({
      path: "docs/shared-room-guest.png",
      fullPage: true,
      animations: "disabled",
    });
  } finally {
    await owner.close();
    await guest.close();
    await other.close();
  }
});
test("legacy room query and explicit room URL resolve to the same shared room", async ({
  browser,
}) => {
  const room = "legacy-" + Date.now();
  const owner = await browser.newContext(),
    guest = await browser.newContext();
  try {
    await signIn(owner, "Legacy");
    await signIn(guest, "Canonical");
    const a = await owner.newPage(),
      b = await guest.newPage();
    await a.goto("/?room=" + room);
    await b.goto("/rooms/" + room);
    for (const p of [a, b]) {
      await expect(p.getByText("Connected", { exact: true })).toBeVisible();
      await p
        .getByRole("button", { name: "People", exact: false })
        .first()
        .click();
    }
    await expect(
      a.getByRole("button", { name: "View profile Canonical", exact: true }),
    ).toBeVisible();
    await expect(
      b.getByRole("button", { name: "View profile Legacy", exact: true }),
    ).toBeVisible();
  } finally {
    await owner.close();
    await guest.close();
  }
});
