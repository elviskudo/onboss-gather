import { useEffect, useRef, useState } from "react";
import type { Person } from "./types";
import { canHear, videoSubscriptions } from "./mediaPolicy";
type MediaMids = {
  audio: string | null;
  camera: string | null;
  screen: string | null;
};
type MediaRole = keyof MediaMids;
type Peer = {
  pc: RTCPeerConnection;
  stream: MediaStream;
  screen: MediaStream;
  screenStreamId: string | null;
  mediaMids?: MediaMids;
  outgoing: Partial<Record<MediaRole, RTCRtpTransceiver>>;
  connection?: string;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingRemoteAnswer: boolean;
  incoming: Promise<void>;
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
    [screen, setScreen] = useState<MediaStream | null>(null),
    [remoteScreens, setRemoteScreens] = useState<Record<string, MediaStream>>(
      {},
    ),
    [screenPending, setScreenPending] = useState(false),
    [mic, setMic] = useState(false),
    [camera, setCamera] = useState(false);
  const captureQueue = useRef<Promise<void>>(Promise.resolve());
  const captureEpoch = useRef(0);
  const display = useRef<MediaStream | null>(null);
  const displayEpoch = useRef(0);
  const displayPending = useRef(false);
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
      displayEpoch.current++;
      for (const t of display.current?.getTracks() || []) t.stop();
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
    const wanted: [MediaRole, MediaStream | null, MediaStreamTrack | null][] = [
      ["audio", local.current, local.current?.getAudioTracks()[0] || null],
      [
        "camera",
        local.current,
        videoAllowed ? local.current?.getVideoTracks()[0] || null : null,
      ],
      ["screen", display.current, display.current?.getVideoTracks()[0] || null],
    ];
    for (const [role, stream, track] of wanted) {
      let transceiver = peer.outgoing[role];
      if (!transceiver && track && stream) {
        transceiver =
          peer.pc
            .getTransceivers()
            .find(
              (t) =>
                t.receiver.track.kind === track.kind &&
                !t.sender.track &&
                !Object.values(peer.outgoing).includes(t) &&
                t.direction !== "stopped",
            ) ||
          peer.pc.addTransceiver(track, {
            direction: "sendrecv",
            streams: [stream],
          });
        peer.outgoing[role] = transceiver;
      }
      if (!transceiver) continue;
      if (transceiver.sender.track !== track)
        void transceiver.sender.replaceTrack(track).catch(() => {
          if (peers.current.get(peerId) === peer)
            current.current.notice(
              "Media belum bisa diperbarui. Hentikan lalu coba bagikan kembali.",
            );
        });
      if (stream && track) transceiver.sender.setStreams(stream);
      // Retain one sender per role so repeated shares do not grow SDP forever.
      transceiver.direction = track ? "sendrecv" : "recvonly";
    }
  }
  function descriptionPayload(peer: Peer) {
    const mid = (track: MediaStreamTrack | undefined) =>
      track
        ? (peer.pc.getTransceivers().find((t) => t.sender.track === track)
            ?.mid ?? null)
        : null;
    return {
      description: peer.pc.localDescription,
      screenStreamId: display.current?.id || null,
      mediaMids: {
        audio: mid(local.current?.getAudioTracks()[0]),
        camera: mid(local.current?.getVideoTracks()[0]),
        screen: mid(display.current?.getVideoTracks()[0]),
      },
    };
  }
  function refreshIncoming(peerId: string, peer: Peer) {
    if (!peer.mediaMids) return;
    const track = (mid: string | null) =>
      mid === null
        ? undefined
        : peer.pc.getTransceivers().find((t) => t.mid === mid)?.receiver.track;
    const incoming = (mids: (string | null)[]) =>
      new MediaStream(
        mids
          .map(track)
          .filter((t): t is MediaStreamTrack => !!t && t.readyState === "live"),
      );
    // A reused transceiver can change roles without firing another track event.
    peer.stream = incoming([peer.mediaMids.audio, peer.mediaMids.camera]);
    peer.screen = incoming([peer.mediaMids.screen]);
    setRemote((r) => ({ ...r, [peerId]: peer.stream }));
    setRemoteScreens((r) => {
      const next = { ...r };
      if (peer.screen.getVideoTracks().length) next[peerId] = peer.screen;
      else delete next[peerId];
      return next;
    });
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
      setRemoteScreens((r) => {
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
      screen: new MediaStream(),
      screenStreamId: null,
      outgoing: {},
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswer: false,
      incoming: Promise.resolve(),
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
      if (p.mediaMids) {
        refreshIncoming(peerId, p);
        return;
      }
      const isScreen = e.streams.some((s) => s.id === p.screenStreamId);
      const target = isScreen ? p.screen : p.stream;
      for (const old of target.getTracks())
        if (old.kind === e.track.kind && old.id !== e.track.id)
          target.removeTrack(old);
      if (!target.getTrackById(e.track.id)) target.addTrack(e.track);
      // New wrappers also refresh video elements after a track is replaced.
      if (isScreen)
        setRemoteScreens((prev) => ({
          ...prev,
          [peerId]: new MediaStream(target.getTracks()),
        }));
      else
        setRemote((prev) => ({
          ...prev,
          [peerId]: new MediaStream(target.getTracks()),
        }));
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
          payload: descriptionPayload(p),
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
  signal.current = (from, payload) => {
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
    p.incoming = p.incoming.then(async () => {
      if (peers.current.get(from) !== p) return;
      try {
        if (payload.description) {
          const d = payload.description as RTCSessionDescriptionInit;
          const collision =
            d.type === "offer" &&
            (p.makingOffer ||
              (p.pc.signalingState !== "stable" && !p.settingRemoteAnswer));
          p.ignoreOffer = current.current.id < from && collision;
          if (p.ignoreOffer) return;
          p.screenStreamId =
            typeof payload.screenStreamId === "string"
              ? payload.screenStreamId
              : null;
          p.mediaMids =
            payload.mediaMids &&
            ["audio", "camera", "screen"].every(
              (key) =>
                payload.mediaMids[key] === null ||
                typeof payload.mediaMids[key] === "string",
            )
              ? payload.mediaMids
              : undefined;
          p.settingRemoteAnswer = d.type === "answer";
          await p.pc.setRemoteDescription(d);
          p.settingRemoteAnswer = false;
          if (peers.current.get(from) !== p) return;
          refreshIncoming(from, p);
          for (const c of p.candidates) await p.pc.addIceCandidate(c);
          p.candidates = [];
          if (d.type === "offer") {
            await p.pc.setLocalDescription();
            if (peers.current.get(from) !== p) return;
            current.current.send({
              type: "signal",
              to: from,
              toConnection: p.connection,
              payload: descriptionPayload(p),
            });
          }
        } else if (payload.candidate) {
          if (p.pc.remoteDescription)
            await p.pc.addIceCandidate(payload.candidate);
          else p.candidates.push(payload.candidate);
        }
      } catch {
        p.settingRemoteAnswer = false;
        if (!p.ignoreOffer && peers.current.get(from) === p)
          current.current.notice("Unable to connect media to a participant.");
      }
    });
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
        setRemoteScreens((r) => {
          const next = { ...r };
          delete next[pid];
          return next;
        });
      }
    if (id === "local") {
      invalidateCapture();
      for (const p of peers.current.values()) p.pc.close();
      peers.current.clear();
      setRemote({});
      setRemoteScreens({});
      stopScreen();
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
  function stopScreen() {
    displayEpoch.current++;
    displayPending.current = false;
    setScreenPending(false);
    const previous = display.current;
    display.current = null;
    previous?.getTracks().forEach((track) => track.stop());
    setScreen(null);
    for (const [pid, peer] of peers.current) syncTracks(pid, peer);
  }
  const screenScope = `${id}:${self.area || "village"}:${self.meeting}`;
  useEffect(() => {
    stopScreen();
  }, [screenScope]);
  useEffect(() => {
    if (!eligible.length) stopScreen();
  }, [eligible.join(",")]);
  async function toggleScreen() {
    if (display.current || displayPending.current) {
      stopScreen();
      return;
    }
    if (
      current.current.id === "local" ||
      !current.current.people.some((p) => canHear(current.current.self, p))
    ) {
      notice("Dekati teman atau bergabung dalam meeting untuk berbagi layar.");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      notice(
        "Browser ini belum mendukung berbagi layar. Gunakan browser desktop yang mendukung.",
      );
      return;
    }
    const epoch = ++displayEpoch.current;
    displayPending.current = true;
    setScreenPending(true);
    try {
      // Keep this call in the click handler so the browser retains user activation.
      const options = {
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
        monitorTypeSurfaces: "include",
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
      } as const;
      const captured = await navigator.mediaDevices.getDisplayMedia(options);
      if (epoch !== displayEpoch.current) {
        captured.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = captured.getVideoTracks()[0];
      if (!track || track.readyState !== "live") {
        captured.getTracks().forEach((t) => t.stop());
        return;
      }
      display.current = captured;
      track.contentHint = "detail";
      track.onended = () => {
        if (display.current === captured) stopScreen();
      };
      setScreen(captured);
      for (const [pid, peer] of peers.current) syncTracks(pid, peer);
    } catch (error) {
      if (epoch !== displayEpoch.current) return;
      notice(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Berbagi layar dibatalkan atau izin belum diberikan."
          : "Layar belum bisa dibagikan. Periksa izin perekaman layar lalu coba lagi.",
      );
    } finally {
      if (epoch === displayEpoch.current) {
        displayPending.current = false;
        setScreenPending(false);
      }
    }
  }
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
      }
      for (const [pid, peer] of peers.current) syncTracks(pid, peer);
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
    send({ type: "status", mic, camera, screenSharing: !!screen });
  }, [mic, camera, screen, send, id]);
  return {
    mic,
    camera,
    stream,
    remote,
    screen,
    remoteScreens,
    screenPending,
    toggleScreen,
    stopScreen,
    toggle,
    stop: () => {
      invalidateCapture();
      stopScreen();
      local.current?.getTracks().forEach((t) => t.stop());
      local.current = null;
      setStream(null);
      setMic(false);
      setCamera(false);
    },
  };
}
