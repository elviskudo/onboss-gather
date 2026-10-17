import { useEffect, useRef, useState } from "react";
import type { Person } from "./types";
import { canHear, videoSubscriptions } from "./mediaPolicy";
type Peer = {
  pc: RTCPeerConnection;
  stream: MediaStream;
  connection?: string;
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
  const captureQueue = useRef<Promise<void>>(Promise.resolve());
  const captureEpoch = useRef(0);
  function invalidateCapture() {
    captureEpoch.current++;
    captureQueue.current = Promise.resolve();
  }
  const local = useRef<MediaStream | null>(null),
    peers = useRef(new Map<string, Peer>()),
    ice = useRef<RTCIceServer[]>([{ urls: "stun:stun.cloudflare.com:3478" }]),
    current = useRef({ id, people, self, send, notice });
  const actualSelf = { ...self, mic, camera };
  const present = [...people.filter((p) => p.id !== id), actualSelf];
  const eligible = people
    .filter((p) => canHear(actualSelf, p))
    .map((p) => p.id)
    .sort();
  const videoRecipients = people
    .filter((p) => videoSubscriptions(p, present).includes(id))
    .map((p) => p.id)
    .sort()
    .join(",");
  current.current = { id, people, self: actualSelf, send, notice };
  useEffect(() => {
    if (!import.meta.env.VITE_STATIC_PREVIEW)
      fetch("/api/media-config")
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => {
          if (c?.iceServers) ice.current = c.iceServers;
        })
        .catch(() => {});
    return () => {
      invalidateCapture();
      for (const t of local.current?.getTracks() || []) t.stop();
      for (const p of peers.current.values()) p.pc.close();
      peers.current.clear();
    };
  }, []);
  function syncTracks(peerId: string, peer: Peer) {
    const state = current.current;
    const receiver = state.people.find((p) => p.id === peerId);
    const everyone = [
      ...state.people.filter((p) => p.id !== state.id),
      state.self,
    ];
    const videoAllowed =
      !!receiver && videoSubscriptions(receiver, everyone).includes(state.id);
    const wanted = (local.current?.getTracks() || []).filter(
      (t) => t.kind === "audio" || videoAllowed,
    );
    for (const sender of peer.pc.getSenders())
      if (sender.track && !wanted.includes(sender.track))
        peer.pc.removeTrack(sender);
    for (const track of wanted)
      if (!peer.pc.getSenders().some((s) => s.track === track))
        peer.pc.addTrack(track, local.current!);
  }
  function ensure(peerId: string) {
    let peer = peers.current.get(peerId);
    const connection = current.current.people.find(
      (p) => p.id === peerId,
    )?.connection;
    if (peer && peer.connection !== connection) {
      peer.pc.close();
      peers.current.delete(peerId);
      setRemote((r) => {
        const next = { ...r };
        delete next[peerId];
        return next;
      });
      peer = undefined;
    }
    if (peer) return peer;
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    peer = {
      pc,
      connection,
      stream: new MediaStream(),
      makingOffer: false,
      ignoreOffer: false,
      candidates: [],
    };
    peers.current.set(peerId, peer);
    const p = peer;
    const isCurrent = () =>
      peers.current.get(peerId) === p &&
      current.current.people.find((person) => person.id === peerId)
        ?.connection === p.connection;
    pc.onicecandidate = (e) => {
      if (e.candidate && isCurrent())
        current.current.send({
          type: "signal",
          to: peerId,
          toConnection: p.connection,
          payload: { candidate: e.candidate.toJSON() },
        });
    };
    pc.ontrack = (e) => {
      if (!isCurrent()) return;
      for (const track of e.streams[0]?.getTracks() || [e.track]) {
        for (const old of p.stream.getTracks())
          if (old.kind === track.kind && old.id !== track.id)
            p.stream.removeTrack(old);
        if (!p.stream.getTrackById(track.id)) p.stream.addTrack(track);
      }
      setRemote((prev) => ({ ...prev, [peerId]: p.stream }));
    };
    pc.onnegotiationneeded = async () => {
      if (!isCurrent()) return;
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        if (!isCurrent()) return;
        current.current.send({
          type: "signal",
          to: peerId,
          toConnection: p.connection,
          payload: { description: pc.localDescription },
        });
      } catch {
        if (!isCurrent()) return;
        current.current.notice(
          "Media connection could not be negotiated. Try toggling your microphone.",
        );
      } finally {
        p.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      if (isCurrent() && pc.connectionState === "failed") {
        pc.restartIce();
        current.current.notice(
          "A media connection was interrupted. Reconnecting…",
        );
      }
    };
    syncTracks(peerId, p);
    return p;
  }
  signal.current = async (from, payload) => {
    const sender = current.current.people.find((p) => p.id === from);
    const me = current.current.self;
    if (
      !sender ||
      from === current.current.id ||
      !canHear(me, sender) ||
      (payload.connection &&
        sender.connection &&
        payload.connection !== sender.connection)
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
        if (peers.current.get(from) !== p) return;
        for (const c of p.candidates) await p.pc.addIceCandidate(c);
        p.candidates = [];
        if (d.type === "offer") {
          await p.pc.setLocalDescription();
          if (peers.current.get(from) !== p) return;
          current.current.send({
            type: "signal",
            to: from,
            toConnection: p.connection,
            payload: { description: p.pc.localDescription },
          });
        }
      } else if (payload.candidate) {
        if (p.pc.remoteDescription)
          await p.pc.addIceCandidate(payload.candidate);
        else p.candidates.push(payload.candidate);
      }
    } catch {
      if (!p.ignoreOffer && peers.current.get(from) === p)
        current.current.notice("Unable to connect media to a participant.");
    }
  };
  useEffect(() => {
    const ids = people
      .filter((p) => canHear(self, p))
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
      invalidateCapture();
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
    for (const pid of ids) syncTracks(pid, ensure(pid));
    // Reconcile only when eligible peers or bounded camera subscriptions change.
  }, [
    id,
    eligible
      .map(
        (pid) =>
          pid + ":" + (people.find((p) => p.id === pid)?.connection || ""),
      )
      .join(","),
    videoRecipients,
  ]);
  function toggle(kind: "audio" | "video") {
    const epoch = captureEpoch.current;
    const owner = id;
    const operation = captureQueue.current.then(() =>
      capture(kind, epoch, owner),
    );
    captureQueue.current = operation.catch(() => {});
    return operation;
  }
  async function capture(
    kind: "audio" | "video",
    epoch: number,
    owner: string,
  ) {
    if (epoch !== captureEpoch.current || current.current.id !== owner) return;
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
      if (current.current.id !== owner || epoch !== captureEpoch.current) {
        added.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!local.current) local.current = new MediaStream();
      for (const t of added.getTracks()) {
        local.current.addTrack(t);
        if (t.kind === "audio")
          for (const p of peers.current.values())
            p.pc.addTrack(t, local.current);
      }
      setStream(new MediaStream(local.current.getTracks()));
      if (kind === "audio") setMic(true);
      else setCamera(true);
    } catch (e) {
      if (current.current.id !== owner || epoch !== captureEpoch.current)
        return;
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
      invalidateCapture();
      local.current?.getTracks().forEach((t) => t.stop());
      local.current = null;
      setStream(null);
      setMic(false);
      setCamera(false);
    },
  };
}
