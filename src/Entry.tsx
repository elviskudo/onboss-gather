import { lazy, Suspense, useEffect, useState } from "react";
import {
  Mountain,
  ArrowUpRight,
  ShieldCheck,
  Users,
  Waves,
  Sparkles,
  RotateCw,
} from "lucide-react";
import { GoogleSignIn } from "./GoogleSignIn";
import { roomFromUrl, type SessionInfo } from "./session";
const Village = lazy(() => import("./App"));
const Founder = lazy(() => import("./Founder"));
const preview = import.meta.env.VITE_STATIC_PREVIEW;
let visitStarted = false;
export default function Entry() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (preview) return;
    const abort = new AbortController();
    setError(false);
    fetch("/api/auth/session", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setSession)
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => abort.abort();
  }, [attempt]);
  useEffect(() => {
    if (preview) return;
    // Count a browser visit once, including in Strict Mode. The server deduplicates refreshes.
    if (!visitStarted) {
      visitStarted = true;
      fetch("/api/visits", { method: "POST" })
        .then((r) => {
          if (!r.ok) visitStarted = false;
        })
        .catch(() => (visitStarted = false));
    }
  }, []);
  const mustLogin =
    preview ||
    !session ||
    (!session.user && (session.required || location.pathname === "/login"));
  useEffect(() => {
    if (
      !preview &&
      session?.required &&
      !session.user &&
      location.pathname !== "/login"
    )
      history.replaceState(
        null,
        "",
        `/login?room=${encodeURIComponent(roomFromUrl())}`,
      );
    else if (session?.user && location.pathname === "/login")
      history.replaceState(
        null,
        "",
        `/?room=${encodeURIComponent(roomFromUrl())}`,
      );
  }, [session]);
  if (!mustLogin) {
    if (location.pathname === "/founder")
      return session.user?.founder ? (
        <Suspense fallback={<Loading />}>
          <Founder
            onLogout={() =>
              location.assign(
                `/login?room=${encodeURIComponent(roomFromUrl())}`,
              )
            }
          />
        </Suspense>
      ) : (
        <main className="entry-state">
          <h1>Akses khusus founder</h1>
          <p>Akun ini tidak memiliki izin dashboard.</p>
          <a href="/">Kembali ke desa</a>
        </main>
      );
    return (
      <Suspense fallback={<Loading />}>
        <Village
          initialSession={session}
          onSignedOut={() => {
            setSession({ ...session, user: null, required: true });
            history.replaceState(
              null,
              "",
              `/login?room=${encodeURIComponent(roomFromUrl())}`,
            );
          }}
        />
      </Suspense>
    );
  }
  return (
    <main className="login-page">
      <section className="login-story" aria-label="Selamat datang di Hallstatt">
        <a href="/login" className="login-brand">
          <Mountain size={30} /> hallstatt<span>.</span>
        </a>
        <div className="login-story-copy">
          <div className="login-kicker">
            <span /> A LITTLE CLOSER, TOGETHER
          </div>
          <h1>
            Tempat kecil.
            <br />
            Cerita yang
            <br />
            <em>lebih dekat.</em>
          </h1>
          <p>
            Temui orang-orangmu di desa yang tenang. Jelajahi, berbincang, dan
            ciptakan ide bersama.
          </p>
          <div className="login-features">
            <span>
              <Users size={16} /> Bertemu
            </span>
            <span>
              <Waves size={16} /> Menjelajah
            </span>
            <span>
              <Sparkles size={16} /> Berkarya
            </span>
          </div>
        </div>
        <div className="login-story-footer">
          YOUR LITTLE ESCAPE <span>Hallstatt Social · 3D</span>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-card">
          <span className="login-mark">
            <Mountain size={30} />
          </span>
          <p className="login-kicker">WELCOME TO YOUR VILLAGE</p>
          <h2>Selamat datang.</h2>
          <p className="login-description">
            Masuk untuk memulai kunjunganmu.
            <br />
            Satu akun, banyak cerita baru.
          </p>
          {!preview && !session && !error ? (
            <p role="status" className="login-status">
              Memeriksa sesi…
            </p>
          ) : error ? (
            <div role="alert">
              <p>Koneksi login belum tersedia. Coba lagi sebentar.</p>
              <button
                className="login-retry"
                onClick={() => setAttempt((v) => v + 1)}
              >
                <RotateCw size={16} /> Coba lagi
              </button>
            </div>
          ) : preview || session?.configured ? (
            <GoogleSignIn room={roomFromUrl()} preview={preview} />
          ) : (
            <p role="alert">
              Login Google sedang disiapkan. Silakan kembali sebentar lagi.
            </p>
          )}
          <p className="login-register">
            Baru pertama kali? Akunmu otomatis terdaftar saat masuk dengan
            Google.
          </p>
          <div className="login-trust">
            <ShieldCheck size={18} />
            <span>Identitas dari Google. Profil dan avatar tetap milikmu.</span>
          </div>
          <p className="login-privacy">
            Kunjungan dicatat secara agregat. Nama dan email akun serta
            aktivitas bergabung hanya dapat dilihat founder.
          </p>
        </div>
        <div className="login-bottom">
          A calmer place to connect. <ArrowUpRight size={15} />
        </div>
      </section>
    </main>
  );
}
function Loading() {
  return (
    <main className="entry-state" role="status">
      <Mountain size={32} />
      <p>Menyiapkan tempatmu…</p>
    </main>
  );
}
