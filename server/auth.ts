import { DurableObject } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";
export interface AuthEnv {
  AUTH: DurableObjectNamespace<AuthStore>;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_REQUIRED?: string;
}
type User = {
  id: string;
  name: string;
  profile?: { name: string; color: string; avatar: string; bio: string };
};
type Session = { user: User; expires: number };
type Flow = { nonce: string; verifier: string; room: string; expires: number };
const random = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
const hash = async (v: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
const cookie = (r: Request, k: string) =>
  r.headers
    .get("Cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(k + "="))
    ?.slice(k.length + 1) || "";
const cookieHeader = (
  key: string,
  value: string,
  age: number,
  secure: boolean,
) =>
  `${key}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure ? "; Secure" : ""}`;
const noStore = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
const store = (env: AuthEnv) => env.AUTH.get(env.AUTH.idFromName("identity"));
export const authRequired = (r: Request, env: AuthEnv) =>
  env.AUTH_REQUIRED === "true" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(r.url).hostname);
export const sessionKey = (r: Request) => hash(cookie(r, "hallstatt_session"));
export async function getSession(r: Request, env: AuthEnv) {
  const token = cookie(r, "hallstatt_session");
  return token ? store(env).session(await hash(token)) : null;
}
const jwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
export async function handleAuth(
  request: Request,
  env: AuthEnv,
): Promise<Response | null> {
  const url = new URL(request.url),
    secure = url.protocol === "https:",
    configured = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  if (url.pathname === "/api/auth/session") {
    const s = await getSession(request, env);
    return Response.json(
      {
        required: authRequired(request, env),
        configured,
        user: s ? { name: s.user.name, profile: s.user.profile } : null,
      },
      { headers: noStore },
    );
  }
  if (url.pathname === "/api/auth/logout") {
    if (
      request.method !== "POST" ||
      request.headers.get("Origin") !== url.origin
    )
      return Response.json(
        { error: "Origin rejected" },
        { status: 403, headers: noStore },
      );
    const token = cookie(request, "hallstatt_session");
    if (token) await store(env).revoke(await hash(token));
    return Response.json(
      { ok: true },
      {
        headers: {
          ...noStore,
          "Set-Cookie": cookieHeader("hallstatt_session", "", 0, secure),
        },
      },
    );
  }
  if (url.pathname === "/api/auth/google") {
    if (!configured)
      return new Response(
        "Login Google belum dikonfigurasi oleh pemilik aplikasi.",
        { status: 503, headers: noStore },
      );
    const state = random(),
      nonce = random(),
      verifier = random();
    const room =
      url.searchParams.get("room")?.match(/^[a-z0-9-]{1,48}$/)?.[0] ||
      "hallstatt-village";
    await store(env).begin(await hash(state), {
      nonce,
      verifier,
      room,
      expires: Date.now() + 600000,
    });
    const challenge = btoa(
      String.fromCharCode(
        ...new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          ),
        ),
      ),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const dest = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    dest.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: url.origin + "/api/auth/callback",
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return new Response(null, {
      status: 302,
      headers: {
        ...noStore,
        Location: dest.href,
        "Set-Cookie": cookieHeader("hallstatt_oauth", state, 600, secure),
      },
    });
  }
  if (url.pathname === "/api/auth/callback") {
    const state = url.searchParams.get("state") || "",
      code = url.searchParams.get("code");
    if (
      !configured ||
      !state ||
      state !== cookie(request, "hallstatt_oauth") ||
      !code
    )
      return new Response(
        "Login tidak valid atau dibatalkan. Silakan coba lagi.",
        { status: 400, headers: noStore },
      );
    const flow = await store(env).consume(await hash(state));
    if (!flow)
      return new Response("Login kedaluwarsa. Silakan coba lagi.", {
        status: 400,
        headers: noStore,
      });
    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID!,
          client_secret: env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: url.origin + "/api/auth/callback",
          grant_type: "authorization_code",
          code_verifier: flow.verifier,
        }),
      });
      if (!res.ok) throw new Error("exchange");
      const token = (await res.json()) as { id_token?: string };
      if (!token.id_token) throw new Error("missing token");
      const { payload } = await jwtVerify(token.id_token, jwks, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: env.GOOGLE_CLIENT_ID,
        algorithms: ["RS256"],
        maxTokenAge: "10m",
      });
      if (
        payload.nonce !== flow.nonce ||
        !payload.sub ||
        payload.email_verified !== true
      )
        throw new Error("invalid identity");
      const user = await store(env).user(
        payload.sub,
        typeof payload.name === "string"
          ? payload.name.slice(0, 28)
          : "Villager",
      );
      const session = random();
      await store(env).createSession(await hash(session), {
        user,
        expires: Date.now() + 8 * 3600000,
      });
      const headers = new Headers({
        ...noStore,
        Location: "/?room=" + encodeURIComponent(flow.room),
      });
      headers.append(
        "Set-Cookie",
        cookieHeader("hallstatt_session", session, 8 * 3600, secure),
      );
      headers.append(
        "Set-Cookie",
        cookieHeader("hallstatt_oauth", "", 0, secure),
      );
      return new Response(null, { status: 302, headers });
    } catch {
      return new Response(
        "Login Google gagal diverifikasi. Silakan ulangi login.",
        { status: 401, headers: noStore },
      );
    }
  }
  return null;
}
/** Identity is persistent; only random token hashes and basic profiles are stored. */
export class AuthStore extends DurableObject {
  async begin(key: string, flow: Flow) {
    await this.ctx.storage.put("flow:" + key, flow);
    await this.schedule();
  }
  async consume(key: string) {
    return this.ctx.storage.transaction(async (tx) => {
      const v = await tx.get<Flow>("flow:" + key);
      await tx.delete("flow:" + key);
      return v && v.expires > Date.now() ? v : null;
    });
  }
  async user(sub: string, name: string) {
    const id = "google:" + sub;
    const existing = await this.ctx.storage.get<User>("user:" + id);
    if (existing) return existing;
    const u = { id, name };
    await this.ctx.storage.put("user:" + id, u);
    return u;
  }
  async createSession(key: string, s: Session) {
    await this.ctx.storage.put("session:" + key, s);
    await this.schedule();
  }
  async session(key: string) {
    const s = await this.ctx.storage.get<Session>("session:" + key);
    if (!s || s.expires <= Date.now()) return null;
    const u = await this.ctx.storage.get<User>("user:" + s.user.id);
    return { ...s, user: u || s.user };
  }
  async revoke(key: string) {
    await this.ctx.storage.delete("session:" + key);
  }
  async profile(userId: string, profile: NonNullable<User["profile"]>) {
    const u = await this.ctx.storage.get<User>("user:" + userId);
    if (u)
      await this.ctx.storage.put("user:" + userId, {
        ...u,
        name: profile.name,
        profile,
      });
  }
  async schedule() {
    if (!(await this.ctx.storage.getAlarm()))
      await this.ctx.storage.setAlarm(Date.now() + 3600000);
  }
  async alarm() {
    for (const prefix of ["flow:", "session:"]) {
      const values = await this.ctx.storage.list<Flow | Session>({ prefix });
      const expired = [...values]
        .filter(([, v]) => v.expires <= Date.now())
        .map(([k]) => k);
      if (expired.length) await this.ctx.storage.delete(expired);
    }
    await this.ctx.storage.setAlarm(Date.now() + 3600000);
  }
}
