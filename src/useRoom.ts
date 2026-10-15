import { useCallback, useEffect, useRef, useState } from "react";
import type { Person, Message } from "./types";
export function useRoom(onNotice: (s: string) => void) {
  const [people, setPeople] = useState<Person[]>([]),
    [messages, setMessages] = useState<Message[]>([]),
    [id, setId] = useState("local"),
    [status, setStatus] = useState<
      "exploring" | "connecting" | "connected" | "reconnecting" | "offline"
    >("exploring"),
    [locked, setLocked] = useState(false);
  const socket = useRef<WebSocket | null>(null),
    retry = useRef<ReturnType<typeof setTimeout> | null>(null),
    intent = useRef(false),
    attempts = useRef(0),
    identity = useRef<{ name: string; color: string; room: string } | null>(
      null,
    ),
    onSignal = useRef<(from: string, payload: any) => void>(() => {});
  const notice = useRef(onNotice);
  notice.current = onNotice;
  const send = useCallback((data: unknown) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);
  const connect = useCallback(function open() {
    const i = identity.current;
    if (!i || !intent.current) return;
    setStatus(attempts.current ? "reconnecting" : "connecting");
    const url = new URL(`/api/rooms/${i.room}/socket`, window.location.origin);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("name", i.name);
    url.searchParams.set("color", i.color);
    const ws = new WebSocket(url);
    socket.current = ws;
    ws.onopen = () => {
      attempts.current = 0;
      setStatus("connected");
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.type === "welcome") {
        setId(m.id);
        setMessages(m.history);
      }
      if (m.type === "state") {
        setPeople(m.people);
        setLocked(m.locked);
      }
      if (m.type === "move")
        setPeople((p) =>
          p.map((v) => (v.id === m.id ? { ...v, x: m.x, z: m.z } : v)),
        );
      if (m.type === "chat") setMessages((p) => [...p, m.message].slice(-60));
      if (m.type === "error") notice.current(m.message);
      if (m.type === "signal") onSignal.current(m.from, m.payload);
    };
    ws.onclose = (e) => {
      if (socket.current !== ws) return;
      setPeople([]);
      if (e.code === 4003) {
        intent.current = false;
        setStatus("offline");
        notice.current("You were removed from this space by the host.");
        return;
      }
      if (intent.current && attempts.current < 6) {
        setStatus("reconnecting");
        retry.current = setTimeout(
          open,
          Math.min(1500 * 2 ** attempts.current++, 15000),
        );
      } else {
        setStatus("offline");
        if (intent.current)
          notice.current(
            "Could not connect to the room. You can keep exploring or retry.",
          );
      }
    };
    ws.onerror = () => ws.close();
  }, []);
  const join = useCallback(
    (name: string, color: string, room: string) => {
      intent.current = false;
      if (retry.current) clearTimeout(retry.current);
      socket.current?.close();
      identity.current = { name, color, room };
      intent.current = true;
      attempts.current = 0;
      connect();
    },
    [connect],
  );
  const leave = useCallback(() => {
    intent.current = false;
    if (retry.current) clearTimeout(retry.current);
    socket.current?.close();
    socket.current = null;
    setPeople([]);
    setId("local");
    setMessages([]);
    setStatus("exploring");
  }, []);
  useEffect(
    () => () => {
      intent.current = false;
      if (retry.current) clearTimeout(retry.current);
      socket.current?.close();
    },
    [],
  );
  return {
    people,
    messages,
    id,
    status,
    locked,
    send,
    join,
    leave,
    onSignal,
    retry: () => {
      if (identity.current) {
        attempts.current = 0;
        intent.current = true;
        connect();
      }
    },
  };
}
