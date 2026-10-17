import config from "./playwright.config";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  ...config,
  testIgnore: [],
  testMatch: ["founder.spec.ts", "room-invite.spec.ts", "social.spec.ts"],
  use: { ...config.use, baseURL: "http://127.0.0.1:8789" },
  webServer: {
    command:
      "npx wrangler dev -c tests/fixtures/wrangler.jsonc --port 8789 --persist-to .wrangler/founder-test",
    url: "http://127.0.0.1:8789/api/health",
    reuseExistingServer: false,
    timeout: 90000,
  },
});
