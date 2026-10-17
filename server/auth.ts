import { DurableObject } from "cloudflare:workers";
import { resolveRoom, roomPath } from "../shared/room";
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
  email?: string;
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
export const isFounder = (user: User) =>
  user.email?.toLowerCase() === "elviskudo@gmail.com";
export const authRequired = (r: Request, env: AuthEnv) =>
  env.AUTH_REQUIRED === "true" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(r.url).hostname);
export const sessionKey = (r: Request) => hash(cookie(r, "hallstatt_session"));
export async function getSession(r: Request, env: AuthEnv) {
  const token = cookie(r, "hallstatt_session");
  const session = token ? await store(env).session(await hash(token)) : null;
  // Older sessions predate verified email storage; require Google again to establish ownership.
  return session?.user.email ? session : null;
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
  if (url.pathname === "/api/visits") {
    if (
      request.method !== "POST" ||
      request.headers.get("Origin") !== url.origin
    )
      return Response.json(
        { error: "Origin rejected" },
        { status: 403, headers: noStore },
      );
    const previous = cookie(request, "hallstatt_visitor");
    const visitor = /^[a-f0-9]{64}$/.test(previous) ? previous : random();
    await store(env).visit(await hash(visitor));
    return Response.json(
      { ok: true },
      {
        headers: {
          ...noStore,
          "Set-Cookie": cookieHeader(
            "hallstatt_visitor",
            visitor,
            31536000,
            secure,
          ),
        },
      },
    );
  }
  if (url.pathname === "/api/founder/summary") {
    const session = await getSession(request, env);
    if (!session)
      return Response.json(
        { error: "Login required" },
        { status: 401, headers: noStore },
      );
    if (!isFounder(session.user))
      return Response.json(
        { error: "Founder access required" },
        { status: 403, headers: noStore },
      );
    if (request.method !== "GET")
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers: noStore },
      );
    const page = (key: string) =>
      Math.min(
        1000000,
        Math.max(0, Number.parseInt(url.searchParams.get(key) || "0", 10) || 0),
      );
    return Response.json(
      await store(env).summary(page("usersPage"), page("joinsPage")),
      { headers: noStore },
    );
  }
  if (url.pathname === "/api/auth/session") {
    const s = await getSession(request, env);
    return Response.json(
      {
        required: authRequired(request, env),
        configured,
        user: s
          ? {
              name: s.user.name,
              profile: s.user.profile,
              founder: isFounder(s.user),
            }
          : null,
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
    const room = resolveRoom(url);
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
        payload.email_verified !== true ||
        typeof payload.email !== "string"
      )
        throw new Error("invalid identity");
      const user = await store(env).user(
        payload.sub,
        typeof payload.name === "string"
          ? payload.name.slice(0, 28)
          : "Villager",
        payload.email as string,
      );
      const session = random();
      await store(env).createSession(await hash(session), {
        user,
        expires: Date.now() + 8 * 3600000,
      });
      const headers = new Headers({
        ...noStore,
        Location: roomPath(flow.room),
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
  constructor(ctx: DurableObjectState, env: AuthEnv) {
    super(ctx, env);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS analytics_visitors (id TEXT PRIMARY KEY, last_visit INTEGER NOT NULL)`,
    );
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS analytics_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, created_at INTEGER NOT NULL, last_login INTEGER NOT NULL, logins INTEGER NOT NULL DEFAULT 1)`,
    );
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS analytics_joins (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, room TEXT NOT NULL, joined_at INTEGER NOT NULL)`,
    );
    ctx.storage.sql.exec(
      `CREATE INDEX IF NOT EXISTS analytics_joins_user ON analytics_joins(user_id, joined_at)`,
    );
    ctx.storage.sql.exec(
      `CREATE INDEX IF NOT EXISTS analytics_joins_time ON analytics_joins(joined_at)`,
    );
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS analytics_days (day TEXT PRIMARY KEY, visits INTEGER NOT NULL DEFAULT 0, registrations INTEGER NOT NULL DEFAULT 0, joins INTEGER NOT NULL DEFAULT 0, meetings INTEGER NOT NULL DEFAULT 0)`,
    );
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS analytics_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL)`,
    );
    ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO analytics_meta VALUES ('since', ?)`,
      Date.now(),
    );
  }
  day() {
    return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  }
  increment(metric: "visits" | "registrations" | "joins" | "meetings") {
    this.ctx.storage.sql.exec(
      `INSERT INTO analytics_days (day, ${metric}) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET ${metric} = ${metric} + 1`,
      this.day(),
    );
  }
  async visit(id: string) {
    this.ctx.storage.transactionSync(() => {
      const previous = this.ctx.storage.sql
        .exec<{ last_visit: number }>(
          "SELECT last_visit FROM analytics_visitors WHERE id = ?",
          id,
        )
        .toArray()[0];
      if (!previous || Date.now() - previous.last_visit >= 1800000)
        this.increment("visits");
      this.ctx.storage.sql.exec(
        "INSERT INTO analytics_visitors VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET last_visit = excluded.last_visit",
        id,
        Date.now(),
      );
    });
  }
  async joined(userId: string, room: string, id: string) {
    this.ctx.storage.transactionSync(() => {
      const inserted = this.ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO analytics_joins VALUES (?, ?, ?, ?)",
        id,
        userId,
        room,
        Date.now(),
      );
      if (inserted.rowsWritten) this.increment("joins");
    });
  }
  async meeting() {
    this.increment("meetings");
  }
  async summary(usersPage = 0, joinsPage = 0) {
    const sql = this.ctx.storage.sql;
    const count = (query: string) => sql.exec<{ n: number }>(query).one().n;
    const totals = sql
      .exec<{ visits: number; meetings: number }>(
        "SELECT COALESCE(SUM(visits),0) visits, COALESCE(SUM(meetings),0) meetings FROM analytics_days",
      )
      .one();
    const since = sql
      .exec<{ value: number }>(
        "SELECT value FROM analytics_meta WHERE key='since'",
      )
      .one().value;
    const users = sql
      .exec(
        "SELECT u.*, (SELECT COUNT(*) FROM analytics_joins j WHERE j.user_id=u.id) joins, (SELECT MAX(joined_at) FROM analytics_joins j WHERE j.user_id=u.id) last_join FROM analytics_users u ORDER BY created_at DESC, id LIMIT 25 OFFSET ?",
        usersPage * 25,
      )
      .toArray();
    const joins = sql
      .exec(
        "SELECT j.*, u.name, u.email FROM analytics_joins j LEFT JOIN analytics_users u ON u.id=j.user_id ORDER BY joined_at DESC, j.id LIMIT 25 OFFSET ?",
        joinsPage * 25,
      )
      .toArray();
    return {
      since,
      generatedAt: Date.now(),
      totals: {
        ...totals,
        visitors: count("SELECT COUNT(*) n FROM analytics_visitors"),
        users: count("SELECT COUNT(*) n FROM analytics_users"),
        joins: count("SELECT COUNT(*) n FROM analytics_joins"),
        joinedUsers: count(
          "SELECT COUNT(DISTINCT user_id) n FROM analytics_joins",
        ),
      },
      today: sql
        .exec("SELECT * FROM analytics_days WHERE day=?", this.day())
        .toArray()[0] || {
        day: this.day(),
        visits: 0,
        registrations: 0,
        joins: 0,
        meetings: 0,
      },
      days: sql
        .exec(
          "SELECT * FROM analytics_days WHERE day>=? ORDER BY day",
          new Date(Date.now() + 7 * 3600000 - 6 * 86400000)
            .toISOString()
            .slice(0, 10),
        )
        .toArray(),
      users,
      joins,
      usersPage,
      joinsPage,
      pageSize: 25,
    };
  }
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
  async user(sub: string, name: string, email: string) {
    const id = "google:" + sub;
    const existing = await this.ctx.storage.get<User>("user:" + id);
    const u = { ...(existing || { id, name }), email: email.toLowerCase() };
    await this.ctx.storage.put("user:" + id, u);
    this.ctx.storage.transactionSync(() => {
      const exists = this.ctx.storage.sql
        .exec("SELECT id FROM analytics_users WHERE id=?", id)
        .toArray().length;
      this.ctx.storage.sql.exec(
        "INSERT INTO analytics_users (id, name, email, created_at, last_login) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name, last_login=excluded.last_login, logins=logins+1",
        id,
        u.name,
        u.email,
        Date.now(),
        Date.now(),
      );
      if (!exists) this.increment("registrations");
    });
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
    this.ctx.storage.sql.exec(
      "UPDATE analytics_users SET name=? WHERE id=?",
      profile.name,
      userId,
    );
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
