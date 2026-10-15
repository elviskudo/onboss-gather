import { useEffect, useRef, useState } from "react";
import type { Person } from "./types";
type Peer = {
  pc: RTCPeerConnection;
  stream: MediaStream;
  makingOffer: boolean;
  ignoreOffer: boolean;
  candidates: RTCIceCandidateInit[];
};
export function useMedia(
  id: string,
  people: Person[],
  self: Person,
  send: (d: unknown) => boolean,
  signal: React.RefObject<(f: string, p: any) => void>,
  notice: (s: string) => void,
) {
  const [stream, setStream] = useState<MediaStream | null>(null),
    [remote, setRemote] = useState<Record<string, MediaStream>>({}),
    [mic, setMic] = useState(false),
    [camera, setCamera] = useState(false);
  const local = useRef<MediaStream | null>(null),
    peers = useRef(new Map<string, Peer>()),
    ice = useRef<RTCIceServer[]>([{ urls: "stun:stun.cloudflare.com:3478" }]),
    current = useRef({ id, people, self, send, notice });
  current.current = { id, people, self, send, notice };
  useEffect(() => {
    if (!import.meta.env.VITE_STATIC_PREVIEW)
      fetch("/api/media-config")
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => {
          if (c?.iceServers) ice.current = c.iceServers;
        })
        .catch(() => {});
    return () => {
      for (const t of local.current?.getTracks() || []) t.stop();
      for (const p of peers.current.values()) p.pc.close();
      peers.current.clear();
    };
  }, []);
  function ensure(peerId: string) {
    let peer = peers.current.get(peerId);
    if (peer) return peer;
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    peer = {
      pc,
      stream: new MediaStream(),
      makingOffer: false,
      ignoreOffer: false,
      candidates: [],
    };
    peers.current.set(peerId, peer);
    const p = peer;
    pc.onicecandidate = (e) => {
      if (e.candidate)
        current.current.send({
          type: "signal",
          to: peerId,
          payload: { candidate: e.candidate.toJSON() },
        });
    };
    pc.ontrack = (e) => {
      for (const track of e.streams[0]?.getTracks() || [e.track])
        if (!p.stream.getTrackById(track.id)) p.stream.addTrack(track);
      setRemote((prev) => ({ ...prev, [peerId]: p.stream }));
    };
    pc.onnegotiationneeded = async () => {
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        current.current.send({
          type: "signal",
          to: peerId,
          payload: { description: pc.localDescription },
        });
      } catch {
        current.current.notice(
          "Media connection could not be negotiated. Try toggling your microphone.",
        );
      } finally {
        p.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        pc.restartIce();
        current.current.notice(
          "A media connection was interrupted. Reconnecting…",
        );
      }
    };
    for (const t of local.current?.getTracks() || [])
      pc.addTrack(t, local.current!);
    return p;
  }
  signal.current = async (from, payload) => {
    const sender = current.current.people.find((p) => p.id === from);
    const me = current.current.self;
    if (
      !sender ||
      from === current.current.id ||
      !(me.meeting
        ? sender.meeting
        : !sender.meeting && Math.hypot(sender.x - me.x, sender.z - me.z) < 12)
    )
      return;
    const p = ensure(from);
    try {
      if (payload.description) {
        const d = payload.description as RTCSessionDescriptionInit;
        const collision =
          d.type === "offer" &&
          (p.makingOffer || p.pc.signalingState !== "stable");
        p.ignoreOffer = current.current.id < from && collision;
        if (p.ignoreOffer) return;
        await p.pc.setRemoteDescription(d);
        for (const c of p.candidates) await p.pc.addIceCandidate(c);
        p.candidates = [];
        if (d.type === "offer") {
          await p.pc.setLocalDescription();
          current.current.send({
            type: "signal",
            to: from,
            payload: { description: p.pc.localDescription },
          });
        }
      } else if (payload.candidate) {
        if (p.pc.remoteDescription)
          await p.pc.addIceCandidate(payload.candidate);
        else p.candidates.push(payload.candidate);
      }
    } catch {
      if (!p.ignoreOffer)
        current.current.notice("Unable to connect media to a participant.");
    }
  };
  useEffect(() => {
    const ids = people
      .filter(
        (p) =>
          p.id !== id &&
          (self.meeting
            ? p.meeting
            : !p.meeting && Math.hypot(p.x - self.x, p.z - self.z) < 12),
      )
      .map((p) => p.id)
      .sort();
    for (const [pid, p] of peers.current)
      if (!ids.includes(pid)) {
        p.pc.close();
        peers.current.delete(pid);
        setRemote((r) => {
          const n = { ...r };
          delete n[pid];
          return n;
        });
      }
    if (id === "local") {
      for (const p of peers.current.values()) p.pc.close();
      peers.current.clear();
      setRemote({});
      for (const t of local.current?.getTracks() || []) t.stop();
      local.current = null;
      setStream(null);
      setMic(false);
      setCamera(false);
      return;
    }
    for (const pid of ids) if (id < pid) ensure(pid);
    // Presence changes only; position updates must not recreate peer connections.
  }, [
    id,
    people
      .filter(
        (p) =>
          p.id !== id &&
          (self.meeting
            ? p.meeting
            : !p.meeting && Math.hypot(p.x - self.x, p.z - self.z) < 12),
      )
      .map((p) => p.id)
      .sort()
      .join(","),
  ]);
  async function toggle(kind: "audio" | "video") {
    if (id === "local") {
      notice("Enter the village to use your microphone or camera.");
      return;
    }
    const existing = local.current?.getTracks().find((t) => t.kind === kind);
    if (existing) {
      existing.enabled = !existing.enabled;
      if (kind === "audio") setMic(existing.enabled);
      else setCamera(existing.enabled);
      return;
    }
    try {
      const added = await navigator.mediaDevices.getUserMedia(
        kind === "audio"
          ? {
              audio: { echoCancellation: true, noiseSuppression: true },
              video: false,
            }
          : {
              audio: false,
              video: {
                width: { ideal: 640 },
                height: { ideal: 360 },
                frameRate: { ideal: 15, max: 24 },
              },
            },
      );
      if (current.current.id === "local") {
        added.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!local.current) local.current = new MediaStream();
      for (const t of added.getTracks()) {
        local.current.addTrack(t);
        for (const p of peers.current.values()) p.pc.addTrack(t, local.current);
      }
      setStream(new MediaStream(local.current.getTracks()));
      if (kind === "audio") setMic(true);
      else setCamera(true);
    } catch (e) {
      notice(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Permission denied. Allow microphone/camera access in your browser settings."
          : "Your media device is unavailable. Check permissions and try again.",
      );
    }
  }
  useEffect(() => {
    send({ type: "status", mic, camera });
  }, [mic, camera, send, id]);
  return {
    mic,
    camera,
    stream,
    remote,
    toggle,
    stop: () => {
      local.current?.getTracks().forEach((t) => t.stop());
      local.current = null;
      setStream(null);
      setMic(false);
      setCamera(false);
    },
  };
}
