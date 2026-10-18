import { FarmHud } from "./FarmHud";
import { canHear, videoSubscriptions } from "./mediaPolicy";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Compass,
  Copy,
  DoorOpen,
  Expand,
  Flag,
  Headphones,
  Home,
  House,
  Info,
  Leaf,
  LockKeyhole,
  LogOut,
  Map,
  MapPin,
  MessageCircle,
  Mic,
  MicOff,
  Minus,
  MoreHorizontal,
  Mountain,
  Navigation,
  Plus,
  RotateCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trees,
  Users,
  Video,
  VideoOff,
  Volume2,
  Waves,
  X,
} from "lucide-react";
import { World, type WorldHandle } from "./World";
import { WORLD_SPACES, type SpaceId } from "../shared/space";
import { Whiteboard } from "./Whiteboard";
import { AvatarPortrait } from "./AvatarPortrait";
import { GoogleSignIn } from "./GoogleSignIn";
import { roomFromUrl, spaceFromUrl, type SessionInfo } from "./session";
import { roomSpacePath } from "../shared/room";
import { LIVE_ORIGIN } from "./GoogleSignIn";
import {
  SPACES,
  AVATARS,
  validAvatar,
  type AreaId,
  type AvatarId,
} from "../shared/spaces";
import { COLORS, PLACES, type Person } from "./types";
import { useRoom } from "./useRoom";
import { useMedia } from "./useMedia";
const STATIC_PREVIEW = import.meta.env.VITE_STATIC_PREVIEW;
const stored = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
function Avatar({
  color,
  name,
  size = "",
}: {
  color: string;
  name: string;
  size?: string;
}) {
  return (
    <span
      className={"avatar " + size}
      style={{ background: color + "25", color }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
function MediaTile({
  stream,
  name,
  muted = false,
  local = false,
}: {
  stream: MediaStream | null;
  name: string;
  muted?: boolean;
  local?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  }, [stream]);
  return (
    <div className="media-tile">
      {stream ? (
        <video ref={ref} autoPlay playsInline muted={muted} />
      ) : (
        <span>{name[0].toUpperCase()}</span>
      )}
      <small>
        {name}
        {local ? " · you" : ""}
      </small>
    </div>
  );
}
function RemoteAudio({
  stream,
  volume,
}: {
  stream: MediaStream;
  volume: number;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  }, [stream]);
  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [volume]);
  return <audio ref={ref} autoPlay />;
}
export default function App({
  initialSession,
  onSignedOut,
}: {
  initialSession?: SessionInfo;
  onSignedOut?: () => void;
}) {
  const [signedOut, setSignedOut] = useState(false),
    [signingOut, setSigningOut] = useState(false),
    [toast, setToast] = useState(""),
    [selectedAnimal, setSelectedAnimal] = useState<string | null>(null),
    [socialOpen, setSocialOpen] = useState(false),
    [socialTarget, setSocialTarget] = useState<string | null>(null),
    [activityArea, setActivityArea] = useState<AreaId>("workspace"),
    [boardOpen, setBoardOpen] = useState(false),
    [name, setName] = useState(() => stored("hallstatt-name", "Explorer")),
    [color, setColor] = useState(() => stored("hallstatt-color", COLORS[0])),
    [avatar, setAvatar] = useState<AvatarId>(() => {
      const a = stored("hallstatt-avatar", "man");
      return validAvatar(a) ? a : "man";
    }),
    [bio, setBio] = useState(() => stored("hallstatt-bio", "")),
    [area, setArea] = useState<AreaId>("village"),
    [profileId, setProfileId] = useState<string | null>(null),
    [draftAvatar, setDraftAvatar] = useState<AvatarId>(avatar),
    [draftBio, setDraftBio] = useState(bio),
    [auth, setAuth] = useState<SessionInfo | null>(initialSession || null),
    [panel, setPanel] = useState<"places" | "people" | "chat">("places"),
    [modal, setModal] = useState<
      "join" | "invite" | "settings" | "help" | "meeting" | "profile" | null
    >(null),
    [place, setPlace] = useState(0),
    [quality, setQuality] = useState(() =>
      stored(
        "hallstatt-quality",
        matchMedia("(max-width: 768px)").matches ? "low" : "high",
      ),
    ),
    [ready, setReady] = useState(false),
    [worldError, setWorldError] = useState(false),
    [chat, setChat] = useState(""),
    [draftName, setDraftName] = useState(name),
    [draftColor, setDraftColor] = useState(color),
    [meeting, setMeeting] = useState(false),
    [welcome, setWelcome] = useState(true),
    [mobileMenu, setMobileMenu] = useState(false),
    [sound, setSound] = useState(true);
  const authRequest = useRef<AbortController | null>(null);
  const world = useRef<WorldHandle | null>(null),
    position = useRef({ x: 3.5, z: 9 }),
    [pos, setPos] = useState(position.current),
    chatEnd = useRef<HTMLDivElement>(null);
  const roomId = roomFromUrl();
  const space = spaceFromUrl();
  const places =
    space === "space-2"
      ? [
          { ...PLACES[0], name: "Farm square", x: 3.5, z: 9 },
          { ...PLACES[1], name: "Farm pond", x: 9, z: 15 },
          { ...PLACES[2], name: "Vegetable garden", x: -12, z: 6 },
          { ...PLACES[3], name: "Farm cottage", x: -11, z: -4 },
        ]
      : PLACES;
  const inviteUrl =
    (STATIC_PREVIEW ? LIVE_ORIGIN : location.origin) +
    roomSpacePath(roomId, space);
  const notify = (s: string) => setToast(s);
  const room = useRoom(notify);
  const own = room.people.find((p) => p.id === room.id);
  const self: Person = {
    id: room.id,
    name,
    color,
    avatar,
    bio,
    seat: own?.seat,
    area,
    x: pos.x,
    z: pos.z,
    mic: own?.mic || false,
    camera: own?.camera || false,
    meeting: own?.meeting || false,
    host: own?.host || false,
  };
  const media = useMedia(
    room.id,
    room.people,
    self,
    room.send,
    room.onSignal,
    notify,
  );
  const connected = room.status === "connected";
  const participants = connected ? room.people : [self];
  const inMeeting = own?.meeting === true;
  const meetingPeople = room.people.filter(
    (p) => p.meeting && (p.area || "village") === area,
  );
  const visibleVideoIds = videoSubscriptions(
    { ...self, camera: media.camera },
    room.people,
  );
  const meetingTiles = meetingPeople
    .filter((p) => p.id !== self.id)
    .sort(
      (a, b) =>
        Number(visibleVideoIds.includes(b.id)) -
          Number(visibleVideoIds.includes(a.id)) || a.id.localeCompare(b.id),
    )
    .slice(0, 3);
  const nearby = room.people.filter(
    (p) =>
      p.id !== room.id &&
      (p.area || "village") === area &&
      !p.meeting &&
      Math.hypot(p.x - pos.x, p.z - pos.z) < 12,
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [room.messages, panel]);
  useEffect(() => {
    if (inMeeting) setMeeting(true);
    else if (connected) setMeeting(false);
  }, [inMeeting, connected]);
  useEffect(() => {
    if (room.status === "offline" || room.status === "reconnecting") {
      media.stop();
      setMeeting(false);
    }
  }, [room.status]);
  useEffect(() => {
    if (!room.spawn) return;
    setPlace(0);
    setArea(room.spawn.area || "village");
    position.current = { x: room.spawn.x, z: room.spawn.z };
    setPos(position.current);
    world.current?.go(room.spawn.x, room.spawn.z);
  }, [room.spawn]);
  useEffect(() => {
    if (STATIC_PREVIEW || signedOut) return;
    const controller = new AbortController();
    authRequest.current = controller;
    fetch("/api/auth/session", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("session");
        return r.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setAuth(data);
        if (data?.user) {
          const p = data.user.profile;
          if (p) {
            setName(p.name);
            setDraftName(p.name);
            setColor(p.color);
            setDraftColor(p.color);
            setAvatar(p.avatar);
            setDraftAvatar(p.avatar);
            setBio(p.bio);
            setDraftBio(p.bio);
          } else {
            setName(data.user.name);
            setDraftName(data.user.name);
          }
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAuth({ required: true, configured: false, user: null });
        notify("Tidak dapat memeriksa login. Silakan muat ulang.");
      });
    return () => controller.abort();
  }, [signedOut]);
  useEffect(() => {
    if (STATIC_PREVIEW || !auth?.user) return;
    const profile = auth.user.profile;
    const userName = profile?.name || auth.user.name;
    setName(userName);
    setDraftName(userName);
    room.join(
      userName,
      profile?.color || color,
      roomId,
      profile?.avatar || avatar,
      profile?.bio || bio,
      space,
    );
    setWelcome(false);
    return () => room.leave();
    // Join once for this authenticated identity and room; edits use the live profile channel.
  }, [auth?.user?.name, roomId, room.join, room.leave]);
  const nearest = room.people
    .filter(
      (p) =>
        p.id !== room.id &&
        (p.area || "village") === area &&
        Math.hypot(p.x - pos.x, p.z - pos.z) < 12,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - pos.x, a.z - pos.z) -
        Math.hypot(b.x - pos.x, b.z - pos.z),
    )[0];
  const socialPerson = socialTarget
    ? room.people.find((p) => p.id === socialTarget)
    : nearest;
  const canTalk =
    socialPerson &&
    !socialPerson.meeting &&
    !inMeeting &&
    (socialPerson.area || "village") === area &&
    Math.hypot(socialPerson.x - pos.x, socialPerson.z - pos.z) < 12;
  function interact() {
    if (own?.seat) {
      room.send({ type: "stand" });
      return;
    }
    setSocialTarget(nearest?.id || null);
    setSocialOpen(true);
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "e" ||
        event.repeat ||
        modal ||
        socialOpen ||
        boardOpen ||
        !connected ||
        (event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,select,[contenteditable=true]"))
      )
        return;
      event.preventDefault();
      interact();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [nearest?.id, own?.seat, connected, modal, socialOpen, boardOpen]);
  useEffect(() => {
    if (connected && area !== "village") room.send({ type: "board-open" });
    else setBoardOpen(false);
  }, [connected, area, room.send]);
  useEffect(() => {
    if (!room.invitation) return;
    const timer = setTimeout(
      () => room.dismissInvitation(),
      Math.max(0, room.invitation.expires - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [room.invitation]);
  function inviteActivity(kind: "chat" | "meeting") {
    if (!socialPerson) return;
    if (
      room.send({
        type: "activity-invite",
        to: socialPerson.id,
        kind,
        area: kind === "chat" ? area : activityArea,
      })
    ) {
      if (kind === "chat" && !media.mic) void media.toggle("audio");
      notify("Ajakan dikirim ke " + socialPerson.name + ". Menunggu jawaban.");
      setSocialOpen(false);
    } else notify("Belum tersambung ke room.");
  }
  function openProfile(id: string) {
    setProfileId(id);
    setDraftName(name);
    setDraftColor(color);
    setDraftAvatar(avatar);
    setDraftBio(bio);
    setModal("profile");
  }
  function enterSpace(id: string) {
    const next = id as AreaId;
    setArea(next);
    setMeeting(false);
    if (connected) room.send({ type: "area", area: next });
    else {
      world.current?.go(
        next === "village" ? 3.5 : 0,
        next === "village" ? 9 : 6,
      );
    }
    setMobileMenu(false);
  }
  function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!draftName.trim()) return;
    setName(draftName.trim());
    setColor(draftColor);
    setAvatar(draftAvatar);
    setBio(draftBio);
    try {
      localStorage.setItem("hallstatt-name", draftName.trim());
      localStorage.setItem("hallstatt-color", draftColor);
      localStorage.setItem("hallstatt-avatar", draftAvatar);
      localStorage.setItem("hallstatt-bio", draftBio);
    } catch {}
    room.send({
      type: "profile",
      name: draftName.trim(),
      color: draftColor,
      avatar: draftAvatar,
      bio: draftBio,
    });
    room.updateProfile(draftName.trim(), draftColor, draftAvatar, draftBio);
    setModal(null);
    notify("Profil dan avatar tersimpan.");
  }
  const selectedProfile =
    profileId === self.id ? self : participants.find((p) => p.id === profileId);
  function move(x: number, z: number) {
    position.current = { x, z };
    setPos({ x, z });
    room.send({ type: "move", x, z });
  }
  function go(i: number) {
    setArea("village");
    setPlace(i);
    const p = places[i];
    room.send({ type: "navigate", place: i });
    world.current?.go(p.x, p.z);
    setMobileMenu(false);
  }
  function join(e: React.FormEvent) {
    e.preventDefault();
    const n = draftName.trim();
    if (!n) return;
    setName(n);
    setColor(draftColor);
    setAvatar(draftAvatar);
    setBio(draftBio);
    try {
      localStorage.setItem("hallstatt-name", n);
      localStorage.setItem("hallstatt-color", draftColor);
      localStorage.setItem("hallstatt-avatar", draftAvatar);
      localStorage.setItem("hallstatt-bio", draftBio);
    } catch {}
    if (!STATIC_PREVIEW) {
      media.stop();
      setPlace(0);
      world.current?.go(3.5, 9);
      setArea("village");
      room.join(n, draftColor, roomId, draftAvatar, draftBio, space);
    } else
      notify(
        "Your avatar is ready. This preview lets you explore on your own.",
      );
    setModal(null);
    setWelcome(false);
  }
  function toggleMeeting() {
    if (!connected) {
      setModal("join");
      return;
    }
    if (inMeeting) {
      room.send({ type: "meeting", join: false });
      setMeeting(false);
    } else {
      room.send({ type: "meeting", join: true });
      setMeeting(true);
    }
    setModal(null);
  }
  async function copy() {
    const url = new URL(inviteUrl);
    try {
      await navigator.clipboard.writeText(url.toString());
      notify("Invitation link copied. See you in the village.");
    } catch {
      notify("Copy the link from the invitation field.");
    }
  }
  function leave() {
    media.stop();
    room.leave();
    setMeeting(false);
    setWelcome(true);
    notify("You left the room. You can still explore the village.");
  }
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    authRequest.current?.abort();
    media.stop();
    room.leave();
    setMeeting(false);
    try {
      if (!STATIC_PREVIEW) {
        const res = await fetch("/api/auth/logout", { method: "POST" });
        if (!res.ok) throw new Error("logout");
      }
      setAuth((previous) => (previous ? { ...previous, user: null } : null));
      setModal(null);
      setProfileId(null);
      setMobileMenu(false);
      setPanel("places");
      setArea("village");
      setPlace(0);
      setToast("");
      position.current = { x: 3.5, z: 9 };
      setPos(position.current);
      if (onSignedOut) onSignedOut();
      else setSignedOut(true);
    } catch {
      notify("Gagal sign out. Sesi akun belum diakhiri. Silakan coba lagi.");
    } finally {
      setSigningOut(false);
    }
  }
  if (signedOut)
    return (
      <main className="signed-out-page">
        <section aria-labelledby="signed-out-title">
          <span className="modal-symbol">
            <LogOut size={28} />
          </span>
          <div className="eyebrow">HALLSTATT</div>
          <h1 id="signed-out-title">Kamu sudah keluar.</h1>
          <p>
            {STATIC_PREVIEW
              ? "Kunjungan preview sudah berakhir. Sampai jumpa kembali di desa."
              : "Sesi aplikasi sudah diakhiri. Mic dan kamera sudah dimatikan."}
          </p>
          <button
            className="primary-button"
            onClick={() => {
              setSignedOut(false);
              setWelcome(true);
              setReady(false);
              setWorldError(false);
              setModal("join");
            }}
          >
            Masuk kembali <ArrowRight size={17} />
          </button>
        </section>
      </main>
    );
  const placeIcons = [
    <MapPin size={19} />,
    <Waves size={19} />,
    <Trees size={19} />,
    <House size={19} />,
  ];
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobileMenu ? "mobile-open" : "")}>
        <a className="brand" href="/" aria-label="Hallstatt home">
          <span className="brand-icon">
            <Mountain size={26} strokeWidth={1.5} />
            <span />
          </span>
          <span>
            hallstatt<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Mountain size={19} />
          </span>
          <div>
            <strong>
              {space === "space-2"
                ? "Space 2 · Harvest Farm"
                : "Space 1 · Hallstatt"}
            </strong>
            <small>
              {space === "space-2"
                ? "Kebun & kehidupan desa"
                : "Hallstatt, Austria"}
            </small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="section-label">
          YOUR SPACE <span>01</span>
        </div>
        <nav className="main-nav" aria-label="Space navigation">
          <button
            className={panel === "places" ? "active" : ""}
            onClick={() => {
              setPanel("places");
              setMobileMenu(false);
            }}
          >
            <Compass size={19} />
            Explore the village <span className="nav-dot" />
          </button>
          <button
            className={panel === "people" ? "active" : ""}
            onClick={() => {
              setPanel("people");
              setMobileMenu(false);
            }}
          >
            <Users size={19} />
            People <span className="count">{participants.length}</span>
          </button>
          <button
            className={panel === "chat" ? "active" : ""}
            onClick={() => {
              setPanel("chat");
              setMobileMenu(false);
            }}
          >
            <MessageCircle size={19} />
            Village chat{" "}
            {room.messages.length > 0 && (
              <span className="count">{room.messages.length}</span>
            )}
          </button>
        </nav>
        <div className="sidebar-divider" />
        {panel === "places" && (
          <>
            <div className="section-label">A PLACE FOR EVERY MOMENT</div>
            <div className="place-list">
              {places.map((p, i) => (
                <button
                  key={p.name}
                  className={"place-item " + (place === i ? "selected" : "")}
                  onClick={() => go(i)}
                >
                  <span className={"place-icon place-" + i}>
                    {placeIcons[i]}
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.label}</small>
                  </span>
                  {place === i ? (
                    <span className="place-dot" />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
              ))}
            </div>
            <button
              className="meeting-card"
              onClick={() => setModal("meeting")}
            >
              <span className="meeting-card-icon">
                <Video size={20} />
              </span>
              <span>
                <strong>Make room for ideas.</strong>
                <small>Start a meeting, anywhere.</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          </>
        )}
        {panel === "people" && (
          <div className="people-panel">
            <div className="section-label">
              IN THE VILLAGE <span>{participants.length}/20</span>
            </div>
            {participants.map((p) => (
              <div className="person-row" key={p.id}>
                <button
                  className="portrait-button"
                  aria-label={"View profile " + p.name}
                  onClick={() => openProfile(p.id)}
                >
                  <AvatarPortrait avatar={p.avatar} color={p.color} />
                </button>
                <div>
                  <strong>
                    {p.name}
                    {p.id === room.id ? " (you)" : ""}
                  </strong>
                  <small>
                    {(SPACES.find((s) => s.id === p.area)?.name ||
                      "Village square") +
                      (p.seat ? " · duduk" : p.meeting ? " · meeting" : "")}
                  </small>
                </div>
                {p.mic ? <Mic size={14} /> : <MicOff size={14} />}{" "}
                {self.host && p.id !== self.id && (
                  <button
                    className="icon-button"
                    aria-label={"Remove " + p.name}
                    onClick={() => {
                      if (confirm(`Remove ${p.name} from this space?`))
                        room.send({ type: "kick", id: p.id });
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <button
              className="subtle-button"
              onClick={() => setModal("invite")}
            >
              <Plus size={15} /> Invite someone
            </button>
          </div>
        )}
        {panel === "chat" && (
          <div className="chat-panel">
            <div className="section-label">
              VILLAGE CHAT <MessageCircle size={14} />
            </div>
            <div className="chat-messages">
              {room.messages.length === 0 && (
                <div className="empty-state">
                  <MessageCircle size={26} />
                  <strong>A conversation starts with hello.</strong>
                  <p>
                    {connected
                      ? "Say something to everyone in the village."
                      : STATIC_PREVIEW
                        ? "Conversations are available in live rooms."
                        : "Enter the village to join the conversation."}
                  </p>
                </div>
              )}
              {room.messages.map((m) => (
                <div className="chat-message" key={m.id}>
                  <div>
                    <strong>{m.name}</strong>
                    <time>
                      {new Date(m.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p>{m.text}</p>
                </div>
              ))}
              <div ref={chatEnd} />
            </div>
            <form
              className="chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (chat.trim() && room.send({ type: "chat", text: chat })) {
                  setChat("");
                } else if (!connected) setModal("join");
              }}
            >
              <input
                disabled={STATIC_PREVIEW}
                aria-label="Message the village"
                placeholder="Say hello…"
                maxLength={500}
                value={chat}
                onChange={(e) => setChat(e.target.value)}
              />
              <button aria-label="Send message" disabled={STATIC_PREVIEW}>
                <Send size={17} />
              </button>
            </form>
          </div>
        )}
        <div className="sidebar-bottom">
          <div className="slow-note">
            <span className="leaf-icon">
              <Leaf size={18} />
            </span>
            <strong>
              A slower place.
              <br />A closer connection.
            </strong>
            <span className="note-line" />
            <p>
              Leave the tabs behind.
              <br />
              Be a little more here.
            </p>
          </div>
          <div className="bottom-nav">
            <button onClick={() => setModal("settings")}>
              <Settings2 size={17} />
              Space settings
            </button>
            <button
              onClick={() => setModal("help")}
              aria-label="Help and controls"
            >
              <CircleHelp size={18} />
            </button>
          </div>
          <button
            className="profile"
            onClick={() => {
              openProfile(self.id);
            }}
          >
            <AvatarPortrait avatar={avatar} color={color} />
            <span>
              <strong>{name}</strong>
              <small>
                <i />
                {connected ? "In the village" : "Just exploring"}
              </small>
            </span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <select
              className="space-selector"
              aria-label="Pilih space"
              value={space}
              onChange={(e) =>
                location.assign(
                  roomSpacePath(roomId, e.target.value as SpaceId),
                )
              }
            >
              {WORLD_SPACES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.description}
                </option>
              ))}
            </select>
            <button
              className="mobile-toggle icon-button"
              aria-label="Open navigation"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Map size={20} />
            </button>
            <span className="space-breadcrumb">
              Your spaces <ChevronRight size={13} />
            </span>
            <Mountain size={17} />
            <strong title={roomId}>
              {roomId === "hallstatt-village"
                ? space === "space-2"
                  ? "Space 2 · Harvest Farm"
                  : "Space 1 · Hallstatt"
                : roomId}
            </strong>
            <span className="private-tag">
              <Users size={11} />
              {STATIC_PREVIEW ? "Private preview" : "Shared space"}
            </span>
          </div>
          <div className="top-actions">
            <span className={"connection " + (connected ? "online" : "")}>
              <i />
              {connected
                ? "Connected"
                : room.status === "exploring"
                  ? STATIC_PREVIEW
                    ? "Exploration preview"
                    : "Local exploration"
                  : room.status === "offline"
                    ? "Offline"
                    : room.status === "connecting"
                      ? "Connecting…"
                      : "Reconnecting…"}
            </span>
            {["offline", "reconnecting"].includes(room.status) && (
              <button className="retry-button" onClick={room.retry}>
                <RotateCw size={14} />
                Retry
              </button>
            )}
            {auth?.user?.founder && (
              <a className="founder-entry" href="/founder">
                <ShieldCheck size={16} /> <span>Founder dashboard</span>
              </a>
            )}
            {(STATIC_PREVIEW || auth?.user) && (
              <button
                className="sign-out-button"
                aria-label="Sign out"
                title="Sign out"
                disabled={signingOut}
                onClick={signOut}
              >
                <LogOut size={17} />
                <span>{signingOut ? "Signing out…" : "Sign out"}</span>
              </button>
            )}
            <button
              className="invite-button"
              onClick={() => setModal("invite")}
            >
              <Plus size={15} />
              Invite friends
            </button>
          </div>
        </header>
        <main className="scene-shell" data-area={area} data-space={space}>
          <div className="space-switcher" aria-label="Enter buildings">
            <strong>
              {area === "village"
                ? "Masuk rumah"
                : SPACES.find((s) => s.id === area)?.name}
            </strong>
            {space === "space-2" && area === "village" && (
              <select
                className="farm-house-select"
                aria-label="Masuk rumah di kebun"
                value=""
                onChange={(e) => enterSpace(e.target.value)}
              >
                <option value="" disabled>
                  Pilih bangunan…
                </option>
                {SPACES.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}
                  </option>
                ))}
              </select>
            )}
            {area === "village" ? (
              SPACES.map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => enterSpace(sp.id)}
                  title={sp.description}
                >
                  <DoorOpen size={14} />
                  {sp.name}
                </button>
              ))
            ) : (
              <>
                <span>Meeting di ruangan ini terpisah dari ruangan lain.</span>
                <button
                  onClick={() => setModal(connected ? "meeting" : "join")}
                >
                  <Video size={14} />
                  Meeting di sini
                </button>
                <button onClick={() => enterSpace("village")}>
                  <DoorOpen size={14} />
                  Keluar ke desa
                </button>
              </>
            )}
          </div>
          <World
            space={space}
            farmFeeds={room.farmFeeds}
            farmClockOffset={room.farmClockOffset}
            onAnimal={setSelectedAnimal}
            board={room.board?.area === area ? room.board : null}
            onBoard={() => setBoardOpen(true)}
            people={room.people}
            self={self}
            quality={quality}
            onMove={move}
            onReady={() => setReady(true)}
            onPerson={openProfile}
            onEnter={enterSpace}
            onError={() => setWorldError(true)}
            handle={world}
          />
          {space === "space-2" && area === "village" && ready && (
            <FarmHud
              feeds={room.farmFeeds}
              offset={room.farmClockOffset}
              self={pos}
              selected={selectedAnimal}
              onSelect={setSelectedAnimal}
              onFeed={(id) => room.send({ type: "animal-feed", id })}
              onWalk={(x, z) => world.current?.walkTo(x, z)}
              enabled={connected && !modal && !boardOpen && !socialOpen}
            />
          )}
          {!ready && !worldError && (
            <div className="world-loading">
              <Mountain size={36} />
              <span>Finding your little escape…</span>
            </div>
          )}
          {worldError && (
            <div className="world-loading">
              <Mountain size={36} />
              <strong>Your browser could not start the 3D world.</strong>
              <span>
                Enable WebGL or try a browser with hardware acceleration.
              </span>
            </div>
          )}
          <div className="scene-vignette" />
          <div className="scene-heading">
            <div className="eyebrow">
              <span /> A LITTLE WORLD. REAL CONNECTIONS.
            </div>
            <h1>
              {area !== "village" ? (
                SPACES.find((s) => s.id === area)?.name
              ) : space === "space-2" ? (
                "Harvest Farm"
              ) : (
                <>
                  A little closer,
                  <br />
                  <em>wherever you are.</em>
                </>
              )}
            </h1>
            <p>
              {space === "space-2"
                ? "Klik bangunan untuk masuk · Bertemu dan berkarya di kebun."
                : "Klik orang untuk profil · Klik pintu hijau untuk masuk."}
            </p>
          </div>
          <div className="weather-pill">
            <Sun size={21} />
            <div>
              <strong>A beautiful day to be here</strong>
              <span>
                {space === "space-2"
                  ? "Space 2 · Harvest Farm"
                  : "Space 1 · Hallstatt"}
              </span>
            </div>
          </div>
          <div className="location-pill">
            <span>
              <MapPin size={15} />
            </span>
            <strong>
              {SPACES.find((s) => s.id === area)?.name || places[place].name}
            </strong>
            <i />
            Open to wander
          </div>
          <div className="map-label label-lake">
            <Waves size={13} /> HALLSTÄTTER SEE
          </div>
          <div className="map-label label-village">
            <MapPin size={12} /> VILLAGE SQUARE
          </div>
          <div className="world-tools">
            <button
              onClick={() => world.current?.zoom(-8)}
              aria-label="Zoom in"
            >
              <Plus size={18} />
            </button>
            <button
              onClick={() => world.current?.zoom(8)}
              aria-label="Zoom out"
            >
              <Minus size={18} />
            </button>
            <span />
            <button
              onClick={() => world.current?.rotate()}
              aria-label="Rotate view"
            >
              <RotateCw size={17} />
            </button>
            <button
              onClick={() => world.current?.home()}
              aria-label="Reset view"
            >
              <Expand size={17} />
            </button>
          </div>
          {welcome && (
            <div className="welcome-card">
              <button
                className="dismiss"
                aria-label="Dismiss welcome"
                onClick={() => setWelcome(false)}
              >
                <X size={14} />
              </button>
              <span className="welcome-symbol">
                <Sparkles size={19} />
              </span>
              <div>
                <strong>Welcome to your somewhere.</strong>
                <p>
                  A lakeside stroll. A spontaneous hello.
                  <br />
                  There’s a whole little world waiting.
                </p>
                <button className="text-link" onClick={() => setModal("join")}>
                  Make yourself at home <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}
          <div className="scene-footer">
            <span>
              <ShieldCheck size={14} />
              Made for presence.
            </span>
            <span>48°33′43.0″N &nbsp; 13°38′59.0″E</span>
          </div>
          {!inMeeting &&
            connected &&
            (media.camera || visibleVideoIds.length > 0) && (
              <div className="meeting-overlay proximity-overlay">
                <div className="meeting-top">
                  <span className="live-dot" />
                  <strong>A nearby hello</strong>
                  <small>Within earshot</small>
                </div>
                <div className="video-grid">
                  {media.camera && (
                    <MediaTile stream={media.stream} name={name} local muted />
                  )}
                  {visibleVideoIds.map((pid) => {
                    const p = room.people.find((p) => p.id === pid);
                    return p ? (
                      <MediaTile
                        key={pid}
                        stream={media.remote[pid] || null}
                        name={p.name}
                        muted
                      />
                    ) : null;
                  })}
                </div>
                <div className="meeting-footer">
                  <span>
                    <Headphones size={13} />
                    Audio fades as you walk away.
                  </span>
                </div>
              </div>
            )}
          {meeting && connected && (
            <div className="meeting-overlay">
              <div className="meeting-top">
                <span className="live-dot" />
                <strong>
                  {SPACES.find((s) => s.id === area)?.name ||
                    "The meeting house"}
                </strong>
                <small>{meetingPeople.length} here</small>
                <button
                  className="icon-button"
                  aria-label="Minimize meeting"
                  onClick={() => setMeeting(false)}
                >
                  <Minus size={18} />
                </button>
              </div>
              <div className="video-grid">
                <MediaTile
                  stream={media.camera ? media.stream : null}
                  name={name}
                  local
                  muted
                />
                {meetingTiles.map((p) => (
                  <MediaTile
                    key={p.id}
                    stream={
                      p.camera && visibleVideoIds.includes(p.id)
                        ? media.remote[p.id] || null
                        : null
                    }
                    name={p.name}
                    muted
                  />
                ))}
              </div>
              <div className="meeting-footer">
                <span>
                  <LockKeyhole size={13} />
                  {room.locked ? "Meeting locked" : "Open to the village"}
                </span>
                {self.host && (
                  <button
                    onClick={() =>
                      room.send({ type: "lock", locked: !room.locked })
                    }
                  >
                    {room.locked ? "Unlock" : "Lock meeting"}
                  </button>
                )}
                <button className="danger-text" onClick={toggleMeeting}>
                  Leave meeting
                </button>
              </div>
            </div>
          )}
        </main>
        <footer className="controlbar">
          <div className="presence">
            <span className="presence-orbit">
              <Headphones size={19} />
            </span>
            <div>
              <strong>{inMeeting ? "Meeting audio" : "Proximity audio"}</strong>
              <small>
                {inMeeting
                  ? `${meetingPeople.length} in the meeting`
                  : nearby.length
                    ? `${nearby.length} within earshot`
                    : "Get closer. Start a conversation."}
              </small>
            </div>
            <span className="audio-badge">
              {inMeeting ? "GROUP" : "SPATIAL"}
            </span>
          </div>
          <div className="call-controls">
            <button
              className={"control-button " + (media.mic ? "enabled" : "")}
              disabled={STATIC_PREVIEW}
              title={STATIC_PREVIEW ? "Available in live rooms" : undefined}
              aria-label={media.mic ? "Mute microphone" : "Unmute microphone"}
              onClick={() => media.toggle("audio")}
            >
              {media.mic ? <Mic size={20} /> : <MicOff size={20} />}
              <span>{media.mic ? "Mic on" : "Mic off"}</span>
            </button>
            <button
              className={"control-button " + (media.camera ? "enabled" : "")}
              disabled={STATIC_PREVIEW}
              title={STATIC_PREVIEW ? "Available in live rooms" : undefined}
              aria-label={media.camera ? "Turn camera off" : "Turn camera on"}
              onClick={() => media.toggle("video")}
            >
              {media.camera ? <Video size={20} /> : <VideoOff size={20} />}
              <span>{media.camera ? "Camera on" : "Camera off"}</span>
            </button>
            <span className="control-separator" />
            <button
              className={"control-button " + (inMeeting ? "enabled" : "")}
              onClick={() =>
                inMeeting ? setMeeting(!meeting) : setModal("meeting")
              }
            >
              <Users size={20} />
              <span>{inMeeting ? "Meeting" : "Meet"}</span>
            </button>
            <button
              className={
                "control-button " + (panel === "chat" ? "enabled" : "")
              }
              onClick={() => setPanel(panel === "chat" ? "places" : "chat")}
            >
              <MessageCircle size={20} />
              <span>Chat</span>
            </button>
            <button
              className="control-button settings-control"
              onClick={() => setModal("settings")}
            >
              <Settings2 size={20} />
              <span>Settings</span>
            </button>
            <span className="control-separator" />
            {connected ? (
              <button
                className="leave-button"
                onClick={leave}
                aria-label="Leave village"
              >
                <DoorOpen size={20} />
              </button>
            ) : (
              <button className="enter-button" onClick={() => setModal("join")}>
                {STATIC_PREVIEW ? "Customize avatar" : "Enter village"}{" "}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
          <div className="movement-hint">
            <div>
              <kbd>W</kbd>
              <span>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd>
              </span>
            </div>
            <span>
              to wander
              <br />
              <small>or click to move</small>
            </span>
          </div>
          <div className="touch-controls">
            <button
              aria-label="Walk north"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                window.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "w" }),
                );
              }}
              onPointerUp={() =>
                window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }))
              }
              onPointerCancel={() =>
                window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }))
              }
            >
              ↑
            </button>
            <div>
              {[
                ["a", "←"],
                ["s", "↓"],
                ["d", "→"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  aria-label={"Walk " + key}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    window.dispatchEvent(new KeyboardEvent("keydown", { key }));
                  }}
                  onPointerUp={() =>
                    window.dispatchEvent(new KeyboardEvent("keyup", { key }))
                  }
                  onPointerCancel={() =>
                    window.dispatchEvent(new KeyboardEvent("keyup", { key }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </footer>
      </div>
      {connected && (
        <div className="social-quickbar">
          <button onClick={interact}>
            <kbd>E</kbd>{" "}
            {own?.seat
              ? "Bangun dari kursi"
              : nearest
                ? "Sapa " + nearest.name
                : "Interaksi"}
          </button>
          {area !== "village" && (
            <>
              <button
                onClick={() => room.send({ type: own?.seat ? "stand" : "sit" })}
              >
                {own?.seat ? "Bangun" : "Duduk & meeting"}
              </button>
              <button onClick={() => setBoardOpen(true)}>Papan tulis</button>
            </>
          )}
        </div>
      )}
      {room.invitation && connected && (
        <aside
          className="activity-invitation"
          role="region"
          aria-label="Undangan aktivitas"
        >
          <strong>
            {room.invitation.name} mengajakmu{" "}
            {room.invitation.kind === "chat"
              ? "ngobrol dekat"
              : "meeting di " +
                SPACES.find((s) => s.id === room.invitation?.area)?.name}
          </strong>
          <p>
            {room.invitation.kind === "chat"
              ? "Jika diterima, mic kamu akan diaktifkan untuk percakapan dekat."
              : "Kalian akan masuk bersama dan memakai kursi yang tersedia. Mic mengikuti pilihanmu."}
          </p>
          <div>
            <button
              onClick={() => {
                const invite = room.invitation;
                if (
                  invite &&
                  room.send({
                    type: "activity-answer",
                    id: invite.id,
                    accept: true,
                  })
                ) {
                  if (invite.kind === "chat" && !media.mic)
                    void media.toggle("audio");
                  room.dismissInvitation();
                }
              }}
            >
              {room.invitation.kind === "chat"
                ? "Terima & nyalakan mic"
                : "Terima ajakan meeting"}
            </button>
            <button
              onClick={() => {
                room.send({
                  type: "activity-answer",
                  id: room.invitation?.id,
                  accept: false,
                });
                room.dismissInvitation();
              }}
            >
              Tolak
            </button>
          </div>
        </aside>
      )}
      {socialOpen && (
        <div className="modal-backdrop" onClick={() => setSocialOpen(false)}>
          <section
            className="modal social-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="social-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Tutup interaksi"
              onClick={() => setSocialOpen(false)}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">LET’S CONNECT</div>
            <h2 id="social-title">
              {socialPerson
                ? "Bersama " + socialPerson.name
                : "Ada yang ingin dilakukan?"}
            </h2>
            <p>
              {socialPerson
                ? "Ngobrol dekat atau ajak berkumpul di rumah."
                : "Dekati teman, atau buka People dan pilih Temui dari profilnya."}
            </p>
            {socialPerson && (
              <>
                <button
                  className="primary-button"
                  disabled={!canTalk}
                  onClick={() => inviteActivity("chat")}
                >
                  <Mic size={16} /> Ajak ngobrol & nyalakan mic
                </button>
                {!canTalk && (
                  <small>Dekati teman di area yang sama untuk ngobrol.</small>
                )}
                <label className="input-label" htmlFor="activity-house">
                  Ajak meeting ke rumah
                </label>
                <select
                  id="activity-house"
                  className="text-input"
                  value={activityArea}
                  onChange={(e) => setActivityArea(e.target.value as AreaId)}
                >
                  {SPACES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  className="primary-button"
                  onClick={() => inviteActivity("meeting")}
                >
                  <DoorOpen size={16} /> Kirim ajakan meeting
                </button>
              </>
            )}
            {area !== "village" && (
              <div className="house-actions">
                <button
                  className="subtle-button"
                  onClick={() => {
                    room.send({ type: "sit" });
                    setSocialOpen(false);
                  }}
                >
                  Duduk & meeting di sini
                </button>
                <button
                  className="subtle-button"
                  onClick={() => {
                    setBoardOpen(true);
                    setSocialOpen(false);
                  }}
                >
                  Buka papan tulis
                </button>
              </div>
            )}
          </section>
        </div>
      )}
      {boardOpen && connected && area !== "village" && (
        <Whiteboard
          board={room.board}
          area={area}
          host={self.host || auth?.user?.founder === true}
          send={room.send}
          onClose={() => setBoardOpen(false)}
        />
      )}
      {Object.entries(media.remote).map(([pid, stream]) => {
        const p = room.people.find((v) => v.id === pid);
        let v = 0;
        if (p && sound && p.mic) {
          if (inMeeting && canHear(self, p)) v = 1;
          else if (!inMeeting && canHear(self, p))
            v = Math.max(0, 1 - Math.hypot(p.x - pos.x, p.z - pos.z) / 12);
        }
        return <RemoteAudio key={pid} stream={stream} volume={v} />;
      })}
      {toast && (
        <div role="status" className="toast">
          <Info size={18} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className={"modal modal-" + modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setModal(null);
              if (e.key === "Tab") {
                const nodes = e.currentTarget.querySelectorAll<HTMLElement>(
                  "button,input,select,a[href]",
                );
                const first = nodes[0],
                  last = nodes[nodes.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <button
              className="modal-close"
              aria-label="Close dialog"
              autoFocus
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "profile" && selectedProfile && (
              <>
                <div className="profile-hero">
                  <AvatarPortrait
                    avatar={selectedProfile.avatar}
                    color={selectedProfile.color}
                  />
                </div>
                <div className="eyebrow">VILLAGER PROFILE</div>
                <h2 id="modal-title">{selectedProfile.name}</h2>
                {selectedProfile.id !== self.id && (
                  <div className="profile-social">
                    <button
                      className="primary-button"
                      onClick={() => {
                        room.send({ type: "follow", to: selectedProfile.id });
                        setModal(null);
                      }}
                    >
                      Temui {selectedProfile.name} <Navigation size={16} />
                    </button>
                    <button
                      className="subtle-button"
                      onClick={() => {
                        setSocialTarget(selectedProfile.id);
                        setSocialOpen(true);
                        setModal(null);
                      }}
                    >
                      Ajak ngobrol / meeting
                    </button>
                  </div>
                )}
                {profileId === self.id && (
                  <button
                    className="profile-sign-out"
                    disabled={signingOut}
                    onClick={signOut}
                  >
                    <LogOut size={17} />
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                )}
                {profileId !== self.id ? (
                  <>
                    <p>
                      {selectedProfile.bio || "Senang bertemu di Hallstatt."}
                    </p>
                    <p>
                      {SPACES.find((s) => s.id === selectedProfile.area)
                        ?.name || "Menjelajah desa"}{" "}
                      ·{" "}
                      {AVATARS.find((a) => a.id === selectedProfile.avatar)
                        ?.label || "Cowok"}
                    </p>
                  </>
                ) : (
                  <form onSubmit={saveProfile}>
                    <label className="input-label" htmlFor="profile-name">
                      Nama tampilan
                    </label>
                    <input
                      id="profile-name"
                      className="text-input"
                      value={draftName}
                      maxLength={28}
                      required
                      onChange={(e) => setDraftName(e.target.value)}
                    />
                    <label className="input-label" htmlFor="profile-bio">
                      Tentang kamu
                    </label>
                    <input
                      id="profile-bio"
                      className="text-input"
                      value={draftBio}
                      maxLength={160}
                      placeholder="Sapa teman-temanmu…"
                      onChange={(e) => setDraftBio(e.target.value)}
                    />
                    <label className="input-label">Avatar default</label>
                    <div className="avatar-presets">
                      {AVATARS.map((a) => (
                        <button
                          type="button"
                          key={a.id}
                          aria-label={a.label}
                          aria-pressed={draftAvatar === a.id}
                          onClick={() => setDraftAvatar(a.id)}
                        >
                          <AvatarPortrait avatar={a.id} color={draftColor} />
                          <span>{a.label}</span>
                        </button>
                      ))}
                    </div>
                    <label className="input-label">Warna baju</label>
                    <div className="color-picker">
                      {COLORS.map((c) => (
                        <button
                          type="button"
                          key={c}
                          aria-label={"Shirt " + c}
                          aria-pressed={draftColor === c}
                          style={{ background: c }}
                          onClick={() => setDraftColor(c)}
                        >
                          {draftColor === c && <Check size={18} />}
                        </button>
                      ))}
                    </div>
                    <div className="profile-draft">
                      <AvatarPortrait avatar={draftAvatar} color={draftColor} />
                      <span>{draftName}</span>
                    </div>
                    <button className="primary-button" type="submit">
                      Simpan profil <Check size={17} />
                    </button>
                  </form>
                )}
              </>
            )}
            {modal === "join" && (
              <>
                <span className="modal-symbol">
                  <Mountain size={29} />
                </span>
                <div className="eyebrow">THERE’S A PLACE FOR YOU HERE</div>
                <h2 id="modal-title">Come as you are.</h2>
                <p>
                  {STATIC_PREVIEW
                    ? "Explore with your own name and color. This preview is a quiet, solo visit."
                    : "A name, a little color, and you’re on your way."}
                </p>
                {STATIC_PREVIEW && (
                  <div className="google-login">
                    <GoogleSignIn room={roomId} preview />
                    <p>
                      Masuk ke aplikasi Cloudflare untuk multiplayer dan
                      meeting.
                    </p>
                  </div>
                )}
                {!STATIC_PREVIEW && !auth ? (
                  <p>Memeriksa login…</p>
                ) : !STATIC_PREVIEW && auth?.required && !auth.user ? (
                  <div className="google-login">
                    {auth.configured && <GoogleSignIn room={roomId} />}
                    {!auth.configured && (
                      <p>Login Google menunggu konfigurasi pemilik aplikasi.</p>
                    )}
                  </div>
                ) : (
                  <form onSubmit={join}>
                    <label className="input-label" htmlFor="display-name">
                      What should we call you?
                    </label>
                    <input
                      id="display-name"
                      className="text-input"
                      required
                      maxLength={28}
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Your display name"
                    />
                    <label className="input-label">Pilih avatar</label>
                    <div className="avatar-presets">
                      {AVATARS.map((a) => (
                        <button
                          type="button"
                          key={a.id}
                          aria-label={a.label}
                          aria-pressed={draftAvatar === a.id}
                          onClick={() => setDraftAvatar(a.id)}
                        >
                          <AvatarPortrait avatar={a.id} color={draftColor} />
                          <span>{a.label}</span>
                        </button>
                      ))}
                    </div>
                    <label className="input-label">Pick your color</label>
                    <div className="color-picker">
                      {COLORS.map((c) => (
                        <button
                          type="button"
                          aria-label={"Choose " + c}
                          aria-pressed={draftColor === c}
                          key={c}
                          style={{ background: c }}
                          onClick={() => setDraftColor(c)}
                        >
                          {draftColor === c && <Check size={20} />}
                        </button>
                      ))}
                    </div>
                    <div className="avatar-preview">
                      <Avatar
                        name={draftName || "?"}
                        color={draftColor}
                        size="large"
                      />
                      <span>
                        <strong>{draftName || "Your name"}</strong>
                        <small>Ready for a little adventure.</small>
                      </span>
                      <Leaf size={20} />
                    </div>
                    <button className="primary-button" type="submit">
                      {STATIC_PREVIEW
                        ? "Save and explore"
                        : connected
                          ? "Re-enter village"
                          : "Enter the village"}
                      <ArrowRight size={17} />
                    </button>
                    <small className="form-note">
                      <ShieldCheck size={13} />
                      Mic and camera start off. You’re in control.
                    </small>
                  </form>
                )}
              </>
            )}
            {modal === "invite" && (
              <>
                <span className="modal-symbol">
                  <Users size={28} />
                </span>
                <div className="eyebrow">GOOD PLACES ARE BETTER SHARED</div>
                <h2 id="modal-title">Save them a spot.</h2>
                <p>
                  {STATIC_PREVIEW
                    ? "This private preview is yours to explore. Live room invitations are available in the full version."
                    : "Bagikan link room ini. Setelah login, temanmu otomatis bergabung di tempat yang sama."}
                </p>
                <label className="input-label" htmlFor="invite-link">
                  Your village link
                </label>
                <div className="copy-field">
                  <input
                    id="invite-link"
                    readOnly
                    value={inviteUrl}
                    onFocus={(e) => e.target.select()}
                  />
                  <button aria-label="Copy invitation link" onClick={copy}>
                    <Copy size={17} />
                  </button>
                </div>
                <button className="primary-button" onClick={copy}>
                  Copy invitation
                  <Copy size={17} />
                </button>
                <div className="modal-note">
                  <Info size={16} />
                  <span>
                    {STATIC_PREVIEW
                      ? "This preview follows the site’s private sharing settings. Live room invitations are not enabled here."
                      : "Setiap peserta perlu login Google. Link ini menuju room yang sama, bukan sesi akunmu. Maksimal 20 peserta per room."}
                  </span>
                </div>
              </>
            )}
            {modal === "settings" && (
              <>
                <span className="modal-symbol">
                  <Settings2 size={27} />
                </span>
                <h2 id="modal-title">Make it feel like you.</h2>
                <p>A few little adjustments to your space.</p>
                <label className="setting-row">
                  <span>
                    <strong>Graphics quality</strong>
                    <small>Low uses less battery and disables shadows.</small>
                  </span>
                  <select
                    aria-label="Graphics quality"
                    value={quality}
                    onChange={(e) => {
                      setQuality(e.target.value);
                      try {
                        localStorage.setItem(
                          "hallstatt-quality",
                          e.target.value,
                        );
                      } catch {}
                    }}
                  >
                    <option value="high">Beautiful</option>
                    <option value="low">Lightweight</option>
                  </select>
                </label>
                <label className="setting-row">
                  <span>
                    <strong>Hear the village</strong>
                    <small>Play audio from nearby people and meetings.</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={sound}
                    onChange={(e) => setSound(e.target.checked)}
                    aria-label="Hear the village"
                  />
                </label>
                <div className="setting-row">
                  <span>
                    <strong>Your identity</strong>
                    <small>
                      {name} · {connected ? "Connected" : "Exploring locally"}
                    </small>
                  </span>
                  <button
                    className="subtle-button"
                    onClick={() => setModal("join")}
                  >
                    Edit <ArrowUpRight size={14} />
                  </button>
                </div>
                <div className="modal-note">
                  <Leaf size={18} />
                  <span>
                    This world is handmade from original geometry. A small,
                    thoughtful tribute to Hallstatt, Austria.
                  </span>
                </div>
                <button
                  className="profile-sign-out"
                  disabled={signingOut}
                  onClick={signOut}
                >
                  <LogOut size={17} />
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </>
            )}
            {modal === "help" && (
              <>
                <span className="modal-symbol">
                  <Compass size={28} />
                </span>
                <h2 id="modal-title">A little wayfinding.</h2>
                <p>There’s no wrong way to wander.</p>
                <div className="help-rows">
                  <div>
                    <Navigation />
                    <span>
                      <strong>Find your feet</strong>
                      <p>
                        Use WASD or arrow keys, tap the ground, or use the touch
                        arrows.
                      </p>
                    </span>
                  </div>
                  <div>
                    <RotateCw />
                    <span>
                      <strong>Change your perspective</strong>
                      <p>
                        Drag to orbit. Scroll or use + and − to zoom. Reset the
                        view at any time.
                      </p>
                    </span>
                  </div>
                  <div>
                    <Headphones />
                    <span>
                      <strong>Say a nearby hello</strong>
                      <p>
                        Enter the village, enable your mic, and walk closer.
                        Audio fades over 12 metres.
                      </p>
                    </span>
                  </div>
                  <div>
                    <Users />
                    <span>
                      <strong>Gather, wherever you are</strong>
                      <p>
                        Join the meeting house for group audio regardless of
                        your position. Four video tiles maximum.
                      </p>
                    </span>
                  </div>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setModal(null)}
                >
                  Let’s wander <ArrowRight size={17} />
                </button>
              </>
            )}
            {modal === "meeting" && (
              <>
                <span className="modal-symbol">
                  <Video size={28} />
                </span>
                <div className="eyebrow">A GOOD IDEA STARTS WITH HELLO</div>
                <h2 id="modal-title">Room for a conversation.</h2>
                <p>Meet together, wherever you are in the village.</p>
                <div className="meeting-info">
                  <span>
                    <Users size={18} /> {meetingPeople.length}{" "}
                    {meetingPeople.length === 1 ? "person" : "people"} inside
                  </span>
                  <span>
                    <LockKeyhole size={15} />
                    {room.locked ? "Locked by host" : "Open meeting"}
                  </span>
                </div>
                <ul className="meeting-benefits">
                  <li>
                    <Check size={15} />
                    Group audio, independent of distance
                  </li>
                  <li>
                    <Check size={15} />
                    Your mic and camera stay in your control
                  </li>
                  <li>
                    <Check size={15} />
                    Up to four visible video tiles
                  </li>
                </ul>
                <button
                  className="primary-button"
                  disabled={
                    STATIC_PREVIEW || (room.locked && !self.host && !inMeeting)
                  }
                  onClick={toggleMeeting}
                >
                  {STATIC_PREVIEW
                    ? "Meetings are unavailable in this preview"
                    : !connected
                      ? "Enter the village first"
                      : inMeeting
                        ? "Leave meeting"
                        : room.locked && !self.host
                          ? "Meeting is locked"
                          : "Join the conversation"}
                  <ArrowRight size={17} />
                </button>
                <small className="form-note">
                  A quiet moment is welcome, too.
                </small>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
