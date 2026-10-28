import type { FarmFeeds } from "../shared/animals";
import type { SpaceId } from "../shared/space";
import type { AreaId } from "../shared/spaces";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Board, ActivityInvite } from "../shared/social";
import type { Person, Message } from "./types";

type Status =
  "exploring" | "connecting" | "connected" | "reconnecting" | "offline";
type Spawn = { x: number; z: number; revision: number; area?: AreaId };
const CONNECT_TIMEOUT = 12_000;
const PING_INTERVAL = 12_000;
const PONG_TIMEOUT = 8_000;

export function useRoom(onNotice: (s: string) => void) {
  const [farmFeeds, setFarmFeeds] = useState<FarmFeeds>({});
  const [farmClockOffset, setFarmClockOffset] = useState(0);
  const [board, setBoard] = useState<Board | null>(null);
  const [boardShare, setBoardShare] = useState<{
    from: string;
    name: string;
    area: AreaId;
    expires: number;
  } | null>(null);
  const [invitation, setInvitation] = useState<ActivityInvite | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [id, setId] = useState("local");
  const [status, setStatus] = useState<Status>("exploring");
  const [locked, setLocked] = useState(false);
  const [spawn, setSpawn] = useState<Spawn | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intent = useRef(false);
  const attempts = useRef(0);
  const connectedBefore = useRef(false);
  const live = useRef(false);
  const lastPong = useRef(Date.now());
  const identity = useRef<{
    name: string;
    color: string;
    room: string;
    avatar: string;
    bio: string;
    space: SpaceId;
  } | null>(null);
  const onSignal = useRef<(from: string, payload: any) => void>(() => {});
  const queuedSignals = useRef<{ from: string; payload: any }[]>([]);
  const [signalRevision, setSignalRevision] = useState(0);
  const notice = useRef(onNotice);
  notice.current = onNotice;
  useEffect(() => {
    const pending = queuedSignals.current.splice(0);
    if (live.current)
      for (const event of pending) onSignal.current(event.from, event.payload);
  }, [signalRevision]);

  // Retire before closing: queued events from the previous connection cannot
  // change the new session, schedule another retry, or add a duplicate avatar.
  const retire = useCallback(() => {
    for (const timer of [retryTimer, connectionTimer, heartbeatTimer]) {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    }
    const ws = socket.current;
    socket.current = null;
    live.current = false;
    queuedSignals.current = [];
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* Already closed by the network. */
      }
    }
  }, []);

  const send = useCallback((data: unknown) => {
    if (!live.current || socket.current?.readyState !== WebSocket.OPEN)
      return false;
    try {
      socket.current.send(JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }, []);

  const connect = useCallback(
    function open() {
      const i = identity.current;
      if (!i || !intent.current) return;
      retire();
      if (!navigator.onLine) {
        setStatus("reconnecting");
        return;
      }
      setStatus(
        connectedBefore.current || attempts.current
          ? "reconnecting"
          : "connecting",
      );
      const url = new URL(
        `/api/rooms/${i.room}/socket`,
        window.location.origin,
      );
      url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("name", i.name);
      url.searchParams.set("color", i.color);
      url.searchParams.set("avatar", i.avatar);
      url.searchParams.set("bio", i.bio);
      if (i.space === "space-2") url.searchParams.set("space", i.space);
      const ws = new WebSocket(url);
      socket.current = ws;
      const isCurrent = () => socket.current === ws && intent.current;
      const disconnect = (code?: number) => {
        if (!isCurrent()) return;
        retire();
        setPeople([]);
        setId("local");
        setLocked(false);
        setBoardShare(null);
        if (code === 4004) {
          intent.current = false;
          setStatus("offline");
          notice.current(
            "Akun ini sedang aktif di tab/perangkat lain. Klik Retry untuk memindahkan koneksi ke sini.",
          );
          return;
        }
        if (code === 4001) {
          intent.current = false;
          setStatus("offline");
          notice.current(
            "Login Google kedaluwarsa. Muat ulang lalu login kembali.",
          );
          return;
        }
        if (code === 4003) {
          intent.current = false;
          setStatus("offline");
          notice.current("You were removed from this space by the host.");
          return;
        }
        if (!navigator.onLine) {
          setStatus("reconnecting");
          return;
        }
        if (attempts.current >= 6) {
          setStatus("offline");
          notice.current(
            "Could not connect to the room. You can keep exploring or retry.",
          );
          return;
        }
        setStatus("reconnecting");
        const delay =
          Math.min(1500 * 2 ** attempts.current++, 15000) + Math.random() * 400;
        retryTimer.current = setTimeout(open, delay);
      };
      const heartbeat = () => {
        if (heartbeatTimer.current) clearTimeout(heartbeatTimer.current);
        heartbeatTimer.current = setTimeout(() => {
          if (!isCurrent() || !live.current) return;
          try {
            ws.send("ping");
          } catch {
            disconnect();
            return;
          }
          heartbeatTimer.current = setTimeout(() => disconnect(), PONG_TIMEOUT);
        }, PING_INTERVAL);
      };
      connectionTimer.current = setTimeout(() => disconnect(), CONNECT_TIMEOUT);
      // A transport handshake alone does not mean admission to a room succeeded.
      ws.onmessage = (e) => {
        if (!isCurrent()) return;
        if (e.data === "pong") {
          lastPong.current = Date.now();
          if (live.current) {
            // Reset backoff only after a successful liveness check, not after
            // admission alone: a server that accepts then drops must still stop retrying.
            attempts.current = 0;
            heartbeat();
          }
          return;
        }
        let m: any;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        if (!m || typeof m !== "object") return;
        if (
          m.type === "welcome" &&
          typeof m.id === "string" &&
          Array.isArray(m.history)
        ) {
          if (live.current) return;
          if (connectionTimer.current) clearTimeout(connectionTimer.current);
          connectionTimer.current = null;
          const restored = connectedBefore.current;
          connectedBefore.current = true;
          live.current = true;
          setId(m.id);
          setFarmFeeds(m.farm?.feeds || {});
          setFarmClockOffset(m.farm ? m.farm.now - Date.now() : 0);
          setMessages(m.history);
          setSpawn((previous) => ({
            x: Number.isFinite(m.self?.x) ? m.self.x : 3.5,
            z: Number.isFinite(m.self?.z) ? m.self.z : 9,
            area: m.self?.area,
            revision: (previous?.revision ?? 0) + 1,
          }));
          setStatus("connected");
          heartbeat();
          if (restored)
            notice.current(
              "Connection restored. You are back in the village square with mic and camera off.",
            );
          return;
        }
        if (!live.current) return;
        if (
          m.type === "board-share" &&
          typeof m.from === "string" &&
          typeof m.name === "string" &&
          m.expires > Date.now()
        )
          setBoardShare(m);
        if (m.type === "farm" && m.feeds && Number.isFinite(m.now)) {
          setFarmFeeds(m.feeds);
          setFarmClockOffset(m.now - Date.now());
        }
        if (
          m.type === "board" &&
          m.board &&
          typeof m.board.revision === "number"
        )
          setBoard(m.board);
        if (
          m.type === "activity-invite" &&
          m.invite &&
          m.invite.expires > Date.now()
        )
          setInvitation(m.invite);
        if (
          m.type === "relocate" &&
          Number.isFinite(m.x) &&
          Number.isFinite(m.z)
        )
          setSpawn((previous) => ({
            x: m.x,
            z: m.z,
            area: m.area,
            revision: (previous?.revision ?? 0) + 1,
          }));
        if (m.type === "state" && Array.isArray(m.people)) {
          setPeople(m.people);
          setLocked(m.locked === true);
        }
        if (
          m.type === "move" &&
          typeof m.id === "string" &&
          Number.isFinite(m.x) &&
          Number.isFinite(m.z)
        )
          setPeople((p) =>
            p.map((v) => (v.id === m.id ? { ...v, x: m.x, z: m.z } : v)),
          );
        if (m.type === "chat" && m.message && typeof m.message.id === "string")
          setMessages((p) =>
            p.some((v) => v.id === m.message.id)
              ? p
              : [...p, m.message].slice(-60),
          );
        if (m.type === "error" && typeof m.message === "string")
          notice.current(m.message);
        if (m.type === "signal" && typeof m.from === "string") {
          // Render the latest presence epochs before media accepts this packet.
          queuedSignals.current.push({
            from: m.from,
            payload: { ...m.payload, connection: m.connection },
          });
          setSignalRevision((revision) => revision + 1);
        }
      };
      ws.onclose = (e) => disconnect(e.code);
      ws.onerror = () => disconnect();
    },
    [retire],
  );

  const join = useCallback(
    (
      name: string,
      color: string,
      room: string,
      avatar = "man",
      bio = "",
      space: SpaceId = "space-1",
    ) => {
      retire();
      setPeople([]);
      setId("local");
      setLocked(false);
      setBoard(null);
      setBoardShare(null);
      identity.current = { name, color, room, avatar, bio, space };
      intent.current = true;
      attempts.current = 0;
      connectedBefore.current = false;
      connect();
    },
    [connect, retire],
  );

  const leave = useCallback(() => {
    intent.current = false;
    retire();
    identity.current = null;
    connectedBefore.current = false;
    setPeople([]);
    setId("local");
    setMessages([]);
    setFarmFeeds({});
    setFarmClockOffset(0);
    setBoard(null);
    setBoardShare(null);
    setInvitation(null);
    setLocked(false);
    setSpawn(null);
    setStatus("exploring");
  }, [retire]);

  const retry = useCallback(() => {
    if (!identity.current || live.current) return;
    intent.current = true;
    attempts.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    const online = () => {
      if (intent.current && !live.current) {
        attempts.current = 0;
        connect();
      }
    };
    const offline = () => {
      if (!intent.current) return;
      retire();
      setPeople([]);
      setId("local");
      setLocked(false);
      setBoardShare(null);
      setStatus("reconnecting");
    };
    const resume = () => {
      if (document.hidden || !intent.current) return;
      const pending =
        socket.current &&
        !live.current &&
        (socket.current.readyState === WebSocket.CONNECTING ||
          socket.current.readyState === WebSocket.OPEN);
      if (pending) return;
      if (!live.current || Date.now() - lastPong.current > 45000) {
        attempts.current = 0;
        connect();
      } else if (socket.current?.readyState === WebSocket.OPEN)
        socket.current.send("ping");
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      intent.current = false;
      retire();
    };
  }, [connect, retire]);

  const updateProfile = (
    name: string,
    color: string,
    avatar: string,
    bio: string,
  ) => {
    if (identity.current)
      Object.assign(identity.current, { name, color, avatar, bio });
  };
  return {
    farmFeeds,
    farmClockOffset,
    board,
    boardShare,
    dismissBoardShare: () => setBoardShare(null),
    invitation,
    dismissInvitation: () => setInvitation(null),
    updateProfile,
    people,
    messages,
    id,
    status,
    locked,
    spawn,
    send,
    join,
    leave,
    onSignal,
    retry,
  };
}
