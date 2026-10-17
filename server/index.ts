import {
  handleAuth,
  getSession,
  authRequired,
  sessionKey,
  isFounder,
  type AuthEnv,
} from "./auth";
export { AuthStore } from "./auth";
import { resolveRoom } from "../shared/room";
import {
  personClear,
  freePoint,
  SEATS,
  emptyBoard,
  AVATAR_GAP,
  type Board,
  type ActivityInvite,
} from "../shared/social";
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
    if (
      ["/", "/index.html", "/login", "/founder"].includes(url.pathname) ||
      url.pathname.startsWith("/rooms/")
    ) {
      const session = await getSession(request, env);
      if (authRequired(request, env) && !session && url.pathname !== "/login") {
        const target = new URL("/login", url.origin);
        target.searchParams.set("room", resolveRoom(url));
        if (url.pathname === "/founder")
          target.searchParams.set("next", "founder");
        return new Response(null, {
          status: 302,
          headers: { Location: target.href, "Cache-Control": "no-store" },
        });
      }
      if (url.pathname === "/founder" && session && !isFounder(session.user))
        return new Response("Halaman ini khusus founder.", {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        });
    }
    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    if (
      ["/", "/index.html", "/login", "/founder"].includes(url.pathname) ||
      url.pathname.startsWith("/rooms/")
    )
      headers.set("Cache-Control", "no-store");
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
  async fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(() => this.admit(request));
  }
  async admit(request: Request) {
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
    const userId = request.headers.get("X-User-Id");
    if (userId)
      await this.env.AUTH.get(this.env.AUTH.idFromName("identity")).joined(
        userId,
        u.pathname.split("/")[3],
        person.id,
      );
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
  relocate(
    socket: WebSocket,
    area: Person["area"],
    sitting = false,
    meeting = false,
    near?: Person,
  ) {
    const a = socket.deserializeAttachment() as Attachment;
    const others = this.people().filter((p) => p.id !== a.person.id);
    const seat =
      sitting && area !== "village"
        ? SEATS.find(
            (s) =>
              !others.some(
                (p) =>
                  p.area === area &&
                  (p.seat === s.id ||
                    Math.hypot(p.x - s.x, p.z - s.z) < AVATAR_GAP),
              ),
          )
        : undefined;
    const point =
      seat ||
      (near && freePoint(area || "village", others, near, a.person.id)) ||
      spawnPoint(area || "village", others);
    Object.assign(a.person, {
      area,
      meeting,
      seat: seat?.id,
      x: point.x,
      z: point.z,
    });
    socket.serializeAttachment(a);
    socket.send(
      JSON.stringify({ type: "relocate", x: point.x, z: point.z, area }),
    );
  }
  async updateBoard(ws: WebSocket, a: Attachment, m: any) {
    const area = a.person.area || "village";
    if (area === "village") return;
    if (m.type === "board-open") {
      ws.send(
        JSON.stringify({
          type: "board",
          board:
            (await this.ctx.storage.get<Board>("board:" + area)) ||
            emptyBoard(area),
        }),
      );
      return;
    }
    const note = typeof m.text === "string" ? m.text.trim().slice(0, 1000) : "";
    const stroke = m.stroke;
    if (
      m.type === "board-stroke" &&
      (!stroke ||
        !/^[a-z0-9-]{1,64}$/i.test(stroke.id || "") ||
        !["#294d3e", "#c87855", "#4285f4", "#222222"].includes(stroke.color) ||
        ![2, 4, 7].includes(stroke.width) ||
        !Array.isArray(stroke.points) ||
        stroke.points.length < 2 ||
        stroke.points.length > 128 ||
        !stroke.points.every(
          (p: any) =>
            Array.isArray(p) &&
            p.length === 2 &&
            p.every(
              (v: any) =>
                typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1,
            ),
        ))
    )
      return;
    if (m.type === "board-note" && !note) return;
    if (m.type === "board-clear" && !a.person.host) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Hanya host yang dapat membersihkan papan.",
        }),
      );
      return;
    }
    const board = await this.ctx.storage
      .transaction(async (tx) => {
        const b = (await tx.get<Board>("board:" + area)) || emptyBoard(area);
        if (m.type === "board-stroke") {
          if (b.strokes.some((s) => s.id === stroke.id)) return b;
          if (b.strokes.length >= 300)
            throw Error("Papan penuh. Minta host membersihkan papan.");
          b.strokes.push({
            id: stroke.id,
            author: a.person.name,
            color: stroke.color,
            width: stroke.width,
            points: stroke.points,
          });
        } else if (m.type === "board-note") {
          if (b.notes.length >= 40)
            throw Error("Catatan penuh. Minta host membersihkan papan.");
          b.notes.push({
            id: crypto.randomUUID(),
            author: a.person.name,
            text: note,
          });
        } else if (m.type === "board-clear") {
          if (m.revision !== b.revision)
            throw Error(
              "Papan baru diperbarui teman. Periksa lagi sebelum membersihkan.",
            );
          b.strokes = [];
          b.notes = [];
        } else return b;
        b.revision++;
        if (new TextEncoder().encode(JSON.stringify(b)).byteLength > 100000)
          throw Error("Papan penuh. Minta host membersihkan papan.");
        await tx.put("board:" + area, b);
        return b;
      })
      .catch((e: Error) => {
        ws.send(JSON.stringify({ type: "error", message: e.message }));
        return null;
      });
    if (board)
      for (const peer of this.sockets())
        if (
          ((peer.deserializeAttachment() as Attachment).person.area ||
            "village") === area
        )
          peer.send(JSON.stringify({ type: "board", board }));
  }
  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    return this.ctx.blockConcurrencyWhile(() => this.receive(ws, message));
  }
  async receive(ws: WebSocket, message: string | ArrayBuffer) {
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
    if (typeof m.type === "string" && m.type.startsWith("board-")) {
      await this.updateBoard(ws, a, m);
      return;
    }
    switch (m.type) {
      case "follow": {
        const target = this.people().find(
          (p) => p.id === m.to && p.id !== a.person.id,
        );
        if (target)
          this.relocate(ws, target.area || "village", false, false, target);
        this.sync();
        return;
      }
      case "sit":
        if (a.person.area && a.person.area !== "village") {
          if (this.locks[a.person.area] && !a.person.host) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Meeting sedang dikunci host.",
              }),
            );
            return;
          }
          const free = SEATS.find(
            (s) =>
              !this.people().some(
                (p) =>
                  p.id !== a.person.id &&
                  p.area === a.person.area &&
                  (p.seat === s.id ||
                    Math.hypot(p.x - s.x, p.z - s.z) < AVATAR_GAP),
              ),
          );
          if (!free) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Semua kursi sedang terisi.",
              }),
            );
            return;
          }
          this.relocate(ws, a.person.area, true, true);
          if (a.userId && !a.person.meeting)
            await this.env.AUTH.get(
              this.env.AUTH.idFromName("identity"),
            ).meeting();
          this.sync();
        }
        return;
      case "stand":
        if (a.person.seat) {
          this.relocate(
            ws,
            a.person.area || "village",
            false,
            a.person.meeting,
            a.person,
          );
          this.sync();
        }
        return;
      case "activity-invite": {
        const peer = this.sockets().find(
          (s) =>
            (s.deserializeAttachment() as Attachment).person.id === m.to &&
            s !== ws,
        );
        if (
          !peer ||
          !["chat", "meeting"].includes(m.kind) ||
          !validArea(m.area)
        )
          return;
        const target = (peer.deserializeAttachment() as Attachment).person;
        if (
          m.kind === "chat" &&
          ((target.area || "village") !== (a.person.area || "village") ||
            Math.hypot(target.x - a.person.x, target.z - a.person.z) > 12)
        )
          return;
        if (
          m.kind === "meeting" &&
          (m.area === "village" || this.locks[m.area])
        ) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Pilih rumah dengan meeting yang terbuka.",
            }),
          );
          return;
        }
        const invite: ActivityInvite = {
          id: crypto.randomUUID(),
          from: a.person.id,
          name: a.person.name,
          to: target.id,
          area: m.kind === "chat" ? a.person.area || "village" : m.area,
          kind: m.kind,
          expires: Date.now() + 120000,
        };
        await this.ctx.storage.put("invite:" + target.id, invite);
        peer.send(JSON.stringify({ type: "activity-invite", invite }));
        return;
      }
      case "activity-answer": {
        const invite = await this.ctx.storage.get<ActivityInvite>(
          "invite:" + a.person.id,
        );
        if (!invite || invite.id !== m.id || invite.expires < Date.now()) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Undangan sudah berakhir.",
            }),
          );
          return;
        }
        await this.ctx.storage.delete("invite:" + a.person.id);
        const from = this.sockets().find(
          (s) =>
            (s.deserializeAttachment() as Attachment).person.id === invite.from,
        );
        if (m.accept !== true) {
          from?.send(
            JSON.stringify({
              type: "error",
              message: a.person.name + " belum menerima ajakan.",
            }),
          );
          return;
        }
        if (!from) return;
        const inviter = (from.deserializeAttachment() as Attachment).person;
        if (invite.kind === "meeting") {
          if (this.locks[invite.area]) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Meeting ini sedang dikunci.",
              }),
            );
            return;
          }
          this.relocate(from, invite.area, true, true);
          this.relocate(ws, invite.area, true, true);
          this.sync();
          for (const peer of [from, ws]) {
            const member = peer.deserializeAttachment() as Attachment;
            if (member.userId)
              await this.env.AUTH.get(
                this.env.AUTH.idFromName("identity"),
              ).meeting();
          }
        } else if (
          (inviter.area || "village") === (a.person.area || "village") &&
          Math.hypot(inviter.x - a.person.x, inviter.z - a.person.z) <= 12
        ) {
          from.send(
            JSON.stringify({
              type: "error",
              message:
                a.person.name +
                " menerima ajakan ngobrol. Aktifkan mic untuk berbicara.",
            }),
          );
        } else
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Teman sudah berpindah. Dekati lalu ajak kembali.",
            }),
          );
        return;
      }
      case "move":
        if (Number.isFinite(m.x) && Number.isFinite(m.z)) {
          const x = Math.max(
              WORLD_BOUNDS.minX,
              Math.min(WORLD_BOUNDS.maxX, m.x),
            ),
            z = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, m.z));
          if (
            Math.hypot(x - a.person.x, z - a.person.z) <= 3 &&
            !a.person.seat &&
            walkable(x, z, a.person.area) &&
            personClear(a.person, x, z, this.people())
          ) {
            a.person.x = x;
            a.person.z = z;
            this.broadcast({ type: "move", id: a.person.id, x, z }, ws);
          } else if (Math.hypot(x - a.person.x, z - a.person.z) > 0.02)
            ws.send(
              JSON.stringify({
                type: "relocate",
                x: a.person.x,
                z: a.person.z,
                area: a.person.area || "village",
              }),
            );
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
        a.person.seat = undefined;
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
        a.person.seat = undefined;
        if (Number.isInteger(m.place) && m.place >= 0 && m.place < 4) {
          const points = [
            [3.5, 9],
            [21, 8],
            [-15, 14],
            [-13, -10],
          ];
          const near = {
            ...a.person,
            x: points[m.place][0],
            z: points[m.place][1],
          };
          const clear =
            walkable(near.x, near.z, "village") &&
            !this.people().some(
              (p) =>
                p.id !== a.person.id &&
                (p.area || "village") === "village" &&
                Math.hypot(p.x - near.x, p.z - near.z) < AVATAR_GAP,
            );
          const point =
            (clear
              ? near
              : freePoint("village", this.people(), near, a.person.id)) ||
            spawnPoint(
              "village",
              this.people().filter((p) => p.id !== a.person.id),
            );
          a.person.x = point.x;
          a.person.z = point.z;
          ws.send(
            JSON.stringify({
              type: "relocate",
              x: point.x,
              z: point.z,
              area: "village",
            }),
          );
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
        if (a.userId && m.join === true && !a.person.meeting)
          await this.env.AUTH.get(
            this.env.AUTH.idFromName("identity"),
          ).meeting();
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
  async webSocketClose(ws: WebSocket): Promise<void> {
    return this.ctx.blockConcurrencyWhile(() => this.closeSocket(ws));
  }
  async closeSocket(ws: WebSocket) {
    const departed = ws.deserializeAttachment() as Attachment | null;
    if (departed) await this.ctx.storage.delete("invite:" + departed.person.id);
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
