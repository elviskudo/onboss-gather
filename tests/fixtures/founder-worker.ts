// Isolated local test entrypoint. Production uses server/index.ts, never this file.
import worker, { Room, AuthStore } from "../../server/index";
export { Room, AuthStore };
export default {
  async fetch(request: Request, env: any) {
    const url = new URL(request.url);
    if (
      url.pathname === "/__test/login" &&
      request.method === "POST" &&
      ["127.0.0.1", "localhost"].includes(url.hostname)
    ) {
      const input = (await request.json()) as {
        email: string;
        name: string;
        sub?: string;
      };
      const auth = env.AUTH.get(env.AUTH.idFromName("identity"));
      const user = await auth.user(
        input.sub || crypto.randomUUID(),
        input.name,
        input.email,
      );
      const token = crypto.randomUUID();
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(token),
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      await auth.createSession(hash, { user, expires: Date.now() + 3600000 });
      return Response.json(
        { ok: true },
        {
          headers: {
            "Set-Cookie": `hallstatt_session=${token}; HttpOnly; SameSite=Lax; Path=/`,
          },
        },
      );
    }
    return worker.fetch(request, env);
  },
};
