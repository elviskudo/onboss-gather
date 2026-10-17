import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Mountain,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
type Day = {
  day: string;
  visits: number;
  registrations: number;
  joins: number;
  meetings: number;
};
type Account = {
  id: string;
  name: string;
  email: string;
  created_at: number;
  last_login: number;
  logins: number;
  joins: number;
  last_join: number | null;
};
type Join = {
  id: string;
  name: string | null;
  email: string | null;
  room: string;
  joined_at: number;
};
type Summary = {
  since: number;
  generatedAt: number;
  totals: {
    visits: number;
    visitors: number;
    users: number;
    joinedUsers: number;
    joins: number;
    meetings: number;
  };
  today: Day;
  days: Day[];
  users: Account[];
  joins: Join[];
  usersPage: number;
  joinsPage: number;
  pageSize: number;
};
const time = (value: number | null) =>
  value
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(value)
    : "Belum bergabung";
const number = (n: number) => new Intl.NumberFormat("id-ID").format(n);
export default function Founder({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<Summary | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0),
    [usersPage, setUsersPage] = useState(0),
    [joinsPage, setJoinsPage] = useState(0),
    [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(
      `/api/founder/summary?usersPage=${usersPage}&joinsPage=${joinsPage}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (r.status === 401) {
          location.assign("/login");
          throw Error("Sesi berakhir. Silakan masuk kembali.");
        }
        if (r.status === 403)
          throw Error("Akses dashboard hanya tersedia untuk founder.");
        if (!r.ok)
          throw Error("Ringkasan belum dapat dimuat. Silakan coba lagi.");
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [usersPage, joinsPage, version]);
  async function logout() {
    setSigningOut(true);
    try {
      const r = await fetch("/api/auth/logout", { method: "POST" });
      if (!r.ok) throw Error();
      onLogout();
    } catch {
      setError("Sign out belum berhasil. Silakan coba lagi.");
      setSigningOut(false);
    }
  }
  return (
    <main className="founder-page">
      <header className="founder-header">
        <a className="login-brand" href="/">
          <Mountain size={25} />
          hallstatt<span>.</span>
        </a>
        <div>
          <a href="/" className="founder-back">
            <ArrowLeft size={16} /> Kembali ke desa
          </a>
          <button onClick={logout} disabled={signingOut}>
            <LogOut size={16} />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>
      <div className="founder-content">
        <div className="founder-title">
          <div>
            <div className="login-kicker">
              <ShieldCheck size={15} /> FOUNDER SPACE
            </div>
            <h1>Desamu, dalam angka.</h1>
            <p>Ringkasan kunjungan dan komunitas Hallstatt.</p>
          </div>
          <button
            className="founder-refresh"
            onClick={() => setVersion((v) => v + 1)}
            disabled={loading}
          >
            <RefreshCw size={16} />
            {loading ? "Memuat…" : "Perbarui"}
          </button>
        </div>
        <div className="founder-owner">
          <span>
            <ShieldCheck size={17} /> Elvis · Founder & owner
          </span>
          <small>elviskudo@gmail.com · Akses privat</small>
        </div>
        {error && (
          <p className="founder-error" role="alert">
            {error}
          </p>
        )}
        {loading && !data && <p role="status">Memuat ringkasan komunitas…</p>}
        {data && !error && (
          <>
            <section className="founder-stats" aria-label="Ringkasan komunitas">
              {[
                [
                  "Kunjungan",
                  data.totals.visits,
                  `${number(data.today.visits)} kunjungan hari ini`,
                ],
                [
                  "Pengunjung unik",
                  data.totals.visitors,
                  "Browser dengan cookie berbeda",
                ],
                [
                  "Akun terdaftar",
                  data.totals.users,
                  `${number(data.today.registrations)} akun baru hari ini`,
                ],
                [
                  "Pernah bergabung",
                  data.totals.joinedUsers,
                  "Akun unik yang masuk ruang",
                ],
                [
                  "Total masuk ruang",
                  data.totals.joins,
                  `${number(data.today.joins)} koneksi masuk hari ini`,
                ],
                [
                  "Bergabung meeting",
                  data.totals.meetings,
                  `${number(data.today.meetings)} partisipasi hari ini`,
                ],
              ].map(([label, value, detail]) => (
                <article key={label}>
                  <p>{label}</p>
                  <strong>
                    {typeof value === "number" ? number(value) : value}
                  </strong>
                  <small>{detail}</small>
                </article>
              ))}
            </section>
            <section className="founder-section">
              <div className="founder-section-title">
                <div>
                  <h2>
                    <BarChart3 size={19} /> Tujuh hari terakhir
                  </h2>
                  <p>Hari dan waktu mengikuti WIB.</p>
                </div>
              </div>
              <div className="founder-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Kunjungan</th>
                      <th>Akun baru</th>
                      <th>Masuk ruang</th>
                      <th>Partisipasi meeting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 7 }, (_, i) => {
                      const day = new Date(
                        data.generatedAt + 7 * 3600000 - (6 - i) * 86400000,
                      )
                        .toISOString()
                        .slice(0, 10);
                      const d = data.days.find((d) => d.day === day);
                      return (
                        <tr key={day}>
                          <td>{day}</td>
                          <td>{number(d?.visits || 0)}</td>
                          <td>{number(d?.registrations || 0)}</td>
                          <td>{number(d?.joins || 0)}</td>
                          <td>{number(d?.meetings || 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="founder-section">
              <div className="founder-section-title">
                <div>
                  <h2>
                    <Users size={19} /> Akun terdaftar{" "}
                    <span>{number(data.totals.users)}</span>
                  </h2>
                  <p>
                    Identitas Google dan aktivitas bergabung masing-masing akun.
                  </p>
                </div>
              </div>
              <div className="founder-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nama & email</th>
                      <th>Terdaftar</th>
                      <th>Login terakhir</th>
                      <th>Masuk ruang</th>
                      <th>Terakhir bergabung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name}</strong>
                          <small>{u.email}</small>
                        </td>
                        <td>{time(u.created_at)}</td>
                        <td>{time(u.last_login)}</td>
                        <td>{number(u.joins)}</td>
                        <td>{time(u.last_join)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.users.length && (
                  <p className="founder-empty">
                    Belum ada akun terdaftar pada periode pencatatan ini.
                  </p>
                )}
              </div>
              <Pager
                page={usersPage}
                total={data.totals.users}
                setPage={setUsersPage}
                disabled={loading}
              />
            </section>
            <section className="founder-section">
              <div className="founder-section-title">
                <div>
                  <h2>Riwayat masuk ruang</h2>
                  <p>
                    Koneksi multiplayer yang berhasil diterima. Reconnect
                    dihitung sebagai masuk baru.
                  </p>
                </div>
              </div>
              <div className="founder-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Peserta</th>
                      <th>Ruang</th>
                      <th>Waktu bergabung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.joins.map((j) => (
                      <tr key={j.id}>
                        <td>
                          <strong>{j.name || "Akun terdaftar"}</strong>
                          <small>{j.email}</small>
                        </td>
                        <td>{j.room}</td>
                        <td>{time(j.joined_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.joins.length && (
                  <p className="founder-empty">
                    Belum ada peserta yang bergabung.
                  </p>
                )}
              </div>
              <Pager
                page={joinsPage}
                total={data.totals.joins}
                setPage={setJoinsPage}
                disabled={loading}
              />
            </section>
            <footer className="founder-notes">
              <p>
                Data mulai dicatat {time(data.since)}. Diperbarui{" "}
                {time(data.generatedAt)}.
              </p>
              <p>
                Satu kunjungan adalah satu sesi browser dengan jeda aktivitas
                minimal 30 menit. Pengunjung unik bergantung pada cookie, bukan
                jumlah orang pasti. Identitas pengunjung anonim tidak dicatat.
                Partisipasi meeting menghitung setiap kali peserta bergabung,
                bukan jumlah meeting terpisah.
              </p>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
function Pager({
  page,
  total,
  setPage,
  disabled,
}: {
  page: number;
  total: number;
  setPage: (page: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="founder-pager">
      <span>
        Halaman {page + 1} dari {Math.max(1, Math.ceil(total / 25))}
      </span>
      <div>
        <button
          aria-label="Halaman sebelumnya"
          disabled={disabled || page === 0}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <button
          aria-label="Halaman berikutnya"
          disabled={disabled || (page + 1) * 25 >= total}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
