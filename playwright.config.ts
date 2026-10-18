import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testIgnore: [
    "**/founder.spec.ts",
    "**/room-invite.spec.ts",
    "**/social.spec.ts",
    "**/revision.spec.ts",
    "**/farm-npcs.spec.ts",
  ],
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8787",
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      args: [
        ...(process.platform === "darwin"
          ? ["--enable-gpu", "--use-angle=metal"]
          : [
              "--use-gl=angle",
              "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader",
            ]),
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: "npm run build && npx wrangler dev --port 8787",
    url: "http://127.0.0.1:8787/api/health",
    reuseExistingServer: true,
    timeout: 90000,
  },
});
