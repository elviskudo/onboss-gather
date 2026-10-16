import {
  handleAuth,
  getSession,
  authRequired,
  sessionKey,
  type AuthEnv,
} from "./auth";
export { AuthStore } from "./auth";
import { WORLD_BOUNDS } from "../shared/world";
import {
  walkable,
  spawnPoint,
  validArea,
  validAvatar,
  sameAudioSpace,
} from "../shared/spaces";
import type { Person } from "../src/types";
import { DurableObject } from "cloudflare:workers";
interface Env extends AuthEnv {
  ROOMS: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
  TURN_URL?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
}
type Attachment = {
  person: Person;
  last: number;
  count: number;
  joined: number;
  userId?: string;
  expires?: number;
  sessionKey?: string;
  lastAuthCheck?: number;
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const authResponse = await handleAuth(request, env);
    if (authResponse) return authResponse;
    if (url.pathname === "/api/health")
      return json({ ok: true, service: "hallstatt", version: "1.0.0" });
    if (url.pathname === "/api/media-config") {
      if (authRequired(request, env) && !(await getSession(request, env)))
        return json({ error: "Google login required" }, 401);
      const iceServers: {
        urls: string;
        username?: string;
        credential?: string;
      }[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
      if (env.TURN_URL && env.TURN_USERNAME && env.TURN_CREDENTIAL)
        iceServers.push({
          urls: env.TURN_URL,
          username: env.TURN_USERNAME,
          credential: env.TURN_CREDENTIAL,
        });
      return json({ iceServers, relayConfigured: iceServers.length > 1 });
    }
    const match = url.pathname.match(
      /^\/api\/rooms\/([a-z0-9-]{1,48})\/socket$/,
    );
    if (match) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
        return json({ error: "WebSocket required" }, 426);
      if (request.headers.get("Origin") !== url.origin)
        return json({ error: "Origin rejected" }, 403);
      const session = await getSession(request, env);
      if (authRequired(request, env) && !session)
        return json({ error: "Google login required" }, 401);
      const headers = new Headers(request.headers);
      headers.delete("X-User-Id");
      headers.delete("X-Session-Expires");
      headers.delete("X-Session-Key");
      if (session) {
        headers.set("X-Session-Key", await sessionKey(request));
        headers.set("X-User-Id", session.user.id);
        headers.set("X-Session-Expires", String(session.expires));
      }
      return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(
        new Request(request, { headers }),
      );
    }
    if (url.pathname.startsWith("/api/"))
      return json({ error: "Not found" }, 404);
    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set(
      "Permissions-Policy",
      "camera=(self), microphone=(self), geolocation=()",
    );
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; media-src 'self' blob:; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    return new Response(res.body, { status: res.status, headers });
  },
};
export class Room extends DurableObject<Env> {
  locked = false;
  locks: Record<string, boolean> = {};
  history: { id: string; name: string; text: string; at: number }[] = [];
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Native ping/pong keeps idle rooms hibernating while clients detect a dead transport.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
    ctx.blockConcurrencyWhile(async () => {
      this.locked = (await ctx.storage.get<boolean>("locked")) ?? false;
      this.locks = (await ctx.storage.get<Record<string, boolean>>(
        "locks",
      )) ?? { village: this.locked };
      this.history = (await ctx.storage.get<typeof this.history>("chat")) ?? [];
    });
  }
  sockets() {
    return this.ctx
      .getWebSockets()
      .filter((s) => s.readyState === WebSocket.OPEN);
  }
  people() {
    return this.sockets().map(
      (s) => (s.deserializeAttachment() as Attachment).person,
    );
  }
  broadcast(data: unknown, exclude?: WebSocket) {
    const text = JSON.stringify(data);
    for (const s of this.sockets())
      if (s !== exclude)
        try {
          s.send(text);
        } catch {}
  }
  sync() {
    const people = this.people();
    for (const socket of this.sockets()) {
      const area =
        (socket.deserializeAttachment() as Attachment).person.area || "village";
      try {
        socket.send(
          JSON.stringify({
            type: "state",
            people,
            locked: this.locks[area] === true,
          }),
        );
      } catch {}
    }
  }
  async fetch(request: Request) {
    if (this.sockets().length >= 20)
      return json({ error: "This village is full. Try again shortly." }, 503);
    const u = new URL(request.url);
    const name =
      (u.searchParams.get("name") || "Guest").trim().slice(0, 28) || "Guest";
    const color = u.searchParams.get("color") || "#c87855";
    const allowed = [
      "#c87855",
      "#628c7a",
      "#798ab6",
      "#bd8bba",
      "#d6ac5b",
      "#6aabb2",
    ];
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const spawn = spawnPoint("village", this.people());
    const person: Person = {
      id: crypto.randomUUID(),
      name,
      color: allowed.includes(color) ? color : allowed[0],
      avatar: validAvatar(u.searchParams.get("avatar"))
        ? (u.searchParams.get("avatar") as Person["avatar"])
        : "man",
      bio: (u.searchParams.get("bio") || "").slice(0, 160),
      area: "village",
      x: spawn.x,
      z: spawn.z,
      mic: false,
      camera: false,
      meeting: false,
      host: this.sockets().length === 0,
    };
    if (person.host) {
      this.locked = false;
      this.locks = {};
      await this.ctx.storage.put("locks", {});
      await this.ctx.storage.put("locked", false);
    }
    server.serializeAttachment({
      person,
      last: Date.now(),
      count: 0,
      joined: Date.now(),
      userId: request.headers.get("X-User-Id") || undefined,
      expires: Number(request.headers.get("X-Session-Expires")) || undefined,
      sessionKey: request.headers.get("X-Session-Key") || undefined,
    } satisfies Attachment);
    this.ctx.acceptWebSocket(server);
    server.send(
      JSON.stringify({
        type: "welcome",
        id: person.id,
        self: person,
        history: this.history,
      }),
    );
    this.sync();
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 16384) {
      ws.close(1009, "Message too large");
      return;
    }
    const a = ws.deserializeAttachment() as Attachment;
    const now = Date.now();
    if (a.expires && a.expires <= now) {
      ws.close(4001, "Login expired");
      return;
    }
    if (a.sessionKey && now - (a.lastAuthCheck || 0) > 5000) {
      if (
        !(await this.env.AUTH.get(this.env.AUTH.idFromName("identity")).session(
          a.sessionKey,
        ))
      ) {
        ws.close(4001, "Login expired");
        return;
      }
      a.lastAuthCheck = now;
    }
    if (now - a.last > 1000) {
      a.last = now;
      a.count = 0;
    }
    if (++a.count > 35) {
      ws.serializeAttachment(a);
      return;
    }
    // Persist rate accounting for malformed and unsupported messages as well.
    ws.serializeAttachment(a);
    let m: any;
    try {
      m = JSON.parse(message);
    } catch {
      return;
    }
    if (!m || typeof m !== "object") return;
    switch (m.type) {
      case "move":
        if (Number.isFinite(m.x) && Number.isFinite(m.z)) {
          const x = Math.max(
              WORLD_BOUNDS.minX,
              Math.min(WORLD_BOUNDS.maxX, m.x),
            ),
            z = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, m.z));
          if (
            Math.hypot(x - a.person.x, z - a.person.z) <= 3 &&
            walkable(x, z, a.person.area)
          ) {
            a.person.x = x;
            a.person.z = z;
            this.broadcast({ type: "move", id: a.person.id, x, z }, ws);
          }
        }
        break;
      case "profile":
        if (typeof m.name === "string" && m.name.trim())
          a.person.name = m.name.trim().slice(0, 28);
        if (/^#[0-9a-f]{6}$/i.test(m.color || "")) a.person.color = m.color;
        if (validAvatar(m.avatar)) a.person.avatar = m.avatar;
        if (typeof m.bio === "string") a.person.bio = m.bio.slice(0, 160);
        if (a.userId)
          await this.env.AUTH.get(this.env.AUTH.idFromName("identity")).profile(
            a.userId,
            {
              name: a.person.name,
              color: a.person.color,
              avatar: a.person.avatar || "man",
              bio: a.person.bio || "",
            },
          );
        break;
      case "area":
        if (!validArea(m.area)) return;
        a.person.area = m.area;
        a.person.meeting = false;
        Object.assign(
          a.person,
          spawnPoint(
            m.area,
            this.people().filter((p) => p.id !== a.person.id),
          ),
        );
        ws.send(
          JSON.stringify({
            type: "relocate",
            x: a.person.x,
            z: a.person.z,
            area: m.area,
          }),
        );
        break;
      case "navigate":
        a.person.area = "village";
        a.person.meeting = false;
        if (Number.isInteger(m.place) && m.place >= 0 && m.place < 4) {
          const points = [
            [3.5, 9],
            [21, 8],
            [-15, 14],
            [-13, -10],
          ];
          [a.person.x, a.person.z] = points[m.place];
          this.broadcast(
            { type: "move", id: a.person.id, x: a.person.x, z: a.person.z },
            ws,
          );
        }
        break;
      case "status":
        a.person.mic = m.mic === true;
        a.person.camera = m.camera === true;
        break;
      case "chat":
        if (typeof m.text === "string" && m.text.trim()) {
          const item = {
            id: crypto.randomUUID(),
            name: a.person.name,
            text: m.text.trim().slice(0, 500),
            at: now,
          };
          this.history = [...this.history, item].slice(-60);
          await this.ctx.storage.put("chat", this.history);
          this.broadcast({ type: "chat", message: item });
        }
        break;
      case "meeting":
        if (
          m.join === true &&
          this.locks[a.person.area || "village"] &&
          !a.person.host
        ) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "The host has locked this meeting.",
            }),
          );
          return;
        }
        a.person.meeting = m.join === true;
        break;
      case "lock":
        if (a.person.host) {
          this.locks[a.person.area || "village"] = m.locked === true;
          await this.ctx.storage.put("locks", this.locks);
        }
        break;
      case "kick":
        if (a.person.host && typeof m.id === "string") {
          const target = this.sockets().find(
            (s) => (s.deserializeAttachment() as Attachment).person.id === m.id,
          );
          if (target && target !== ws)
            target.close(4003, "Removed by the host");
        }
        break;
      case "signal":
        if (typeof m.to === "string" && m.payload) {
          const target = this.sockets().find(
            (s) => (s.deserializeAttachment() as Attachment).person.id === m.to,
          );
          if (target) {
            const recipient = (target.deserializeAttachment() as Attachment)
              .person;
            const sender = a.person;
            const eligible =
              sameAudioSpace(sender, recipient) &&
              (sender.meeting
                ? recipient.meeting
                : !recipient.meeting &&
                  Math.hypot(sender.x - recipient.x, sender.z - recipient.z) <
                    12);
            if (eligible)
              target.send(
                JSON.stringify({
                  type: "signal",
                  from: sender.id,
                  payload: m.payload,
                }),
              );
          }
        }
        break;
      default:
        return;
    }
    ws.serializeAttachment(a);
    if (
      ["status", "meeting", "lock", "profile", "area", "navigate"].includes(
        m.type,
      )
    )
      this.sync();
  }
  async webSocketClose(ws: WebSocket) {
    try {
      ws.close();
    } catch {}
    const remaining = this.sockets()
      .filter((s) => s !== ws)
      .sort(
        (l, r) =>
          (l.deserializeAttachment() as Attachment).joined -
          (r.deserializeAttachment() as Attachment).joined,
      );
    if (
      remaining.length &&
      !remaining.some(
        (s) => (s.deserializeAttachment() as Attachment).person.host,
      )
    ) {
      const a = remaining[0].deserializeAttachment() as Attachment;
      a.person.host = true;
      remaining[0].serializeAttachment(a);
    }
    this.broadcast(
      {
        type: "state",
        people: remaining.map(
          (s) => (s.deserializeAttachment() as Attachment).person,
        ),
        locked: this.locked,
      },
      ws,
    );
  }
  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }
}
