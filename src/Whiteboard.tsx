import { useEffect, useRef, useState } from "react";
import { Send, Trash2, X, Eraser, PenLine } from "lucide-react";
import type { Board, BoardStroke } from "../shared/social";
import type { AreaId } from "../shared/spaces";
import { paintBoard } from "./boardPaint";
export function Whiteboard({
  board,
  area,
  host,
  send,
  onClose,
  onShare,
}: {
  board: Board | null;
  area: AreaId;
  host: boolean;
  send: (v: unknown) => boolean;
  onClose: () => void;
  onShare: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    draft = useRef<BoardStroke | null>(null);
  const [color, setColor] = useState("#294d3e"),
    [text, setText] = useState(""),
    [clear, setClear] = useState(false),
    [erase, setErase] = useState(false),
    [error, setError] = useState("");
  const current = board?.area === area ? board : null;
  useEffect(() => {
    send({ type: "board-open" });
  }, [area, send]);
  function draw() {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d")!;
    paintBoard(ctx, current, 900, 450);
    if (draft.current) paintDraft(ctx, draft.current);
  }
  useEffect(draw, [board]);
  function point(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.round(
        Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 10000,
      ) / 10000,
      Math.round(
        Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * 10000,
      ) / 10000,
    ];
  }
  function submit(value: unknown) {
    if (!send(value)) {
      setError("Koneksi terputus. Perubahan belum tersimpan.");
      return false;
    }
    setError("");
    return true;
  }
  return (
    <div className="whiteboard-backdrop">
      <section
        className="whiteboard-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whiteboard-title"
      >
        <header>
          <div>
            <h2 id="whiteboard-title">Papan tulis bersama</h2>
            <p>Coretan dan catatan tersimpan untuk area ini.</p>
          </div>
          <button aria-label="Tutup papan tulis" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="board-tools">
          <button onClick={onShare}>Bagikan papan tulis</button>
          <button
            aria-label="Mode pena"
            aria-pressed={!erase}
            onClick={() => setErase(false)}
          >
            <PenLine size={16} /> Pena
          </button>
          <button
            aria-label="Mode penghapus"
            aria-pressed={erase}
            onClick={() => setErase(true)}
          >
            <Eraser size={16} /> Penghapus
          </button>
          <div>
            {["#294d3e", "#c87855", "#4285f4", "#222222"].map((c) => (
              <button
                key={c}
                aria-label={`Pena ${c}`}
                aria-pressed={color === c}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <span>
            {current
              ? `${current.strokes.length} coretan · ${current.notes.length} catatan`
              : "Memuat papan…"}
          </span>
          <button
            disabled={!host || !current}
            title={
              host
                ? "Bersihkan papan bersama"
                : "Host atau founder dapat membersihkan seluruh papan"
            }
            onClick={() => setClear(true)}
          >
            <Trash2 size={15} /> Bersihkan
          </button>
        </div>
        <canvas
          ref={canvas}
          width={900}
          height={450}
          aria-label="Kanvas papan tulis bersama"
          onPointerDown={(e) => {
            if (!current) return;
            if (erase) {
              const [x, y] = point(e);
              const stroke = current.strokes
                .slice()
                .reverse()
                .find((s) =>
                  s.points.some((p, i) => {
                    const q = s.points[Math.max(0, i - 1)];
                    const dx = (p[0] - q[0]) * 900,
                      dy = (p[1] - q[1]) * 450,
                      px = (x - q[0]) * 900,
                      py = (y - q[1]) * 450;
                    const t = Math.max(
                      0,
                      Math.min(
                        1,
                        (dx * px + dy * py) / (dx * dx + dy * dy || 1),
                      ),
                    );
                    return Math.hypot(px - t * dx, py - t * dy) < 16;
                  }),
                );
              if (stroke) submit({ type: "board-delete", id: stroke.id });
              return;
            }
            e.currentTarget.setPointerCapture(e.pointerId);
            draft.current = {
              id: crypto.randomUUID(),
              author: "",
              color,
              width: 4,
              points: [point(e)],
            };
            draw();
          }}
          onPointerMove={(e) => {
            if (!draft.current) return;
            if (draft.current.points.length >= 127)
              draft.current.points = draft.current.points.filter(
                (_, index) => index % 2 === 0,
              );
            draft.current.points.push(point(e));
            draw();
          }}
          onPointerCancel={() => {
            draft.current = null;
            draw();
          }}
          onPointerUp={(e) => {
            if (!draft.current) return;
            const stroke = draft.current;
            if (stroke.points.length >= 127)
              stroke.points = stroke.points.filter(
                (_, index) => index % 2 === 0,
              );
            stroke.points.push(point(e));
            submit({ type: "board-stroke", stroke });
            draft.current = null;
            draw();
          }}
        />
        {error && <p role="alert">{error}</p>}
        <div className="board-notes">
          {current?.notes.map((n) => (
            <article key={n.id}>
              <p>{n.text}</p>
              <small>{n.author}</small>
              <button
                className="delete-note"
                aria-label={"Hapus catatan " + n.text.slice(0, 40)}
                onClick={() => submit({ type: "board-delete", id: n.id })}
              >
                <Trash2 size={14} /> Hapus
              </button>
            </article>
          ))}
          {!current?.notes.length && (
            <p className="board-empty">
              Tulis agenda atau ide pertama bersama timmu.
            </p>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && submit({ type: "board-note", text }))
              setText("");
          }}
        >
          <label htmlFor="board-note">Tambahkan catatan</label>
          <div>
            <textarea
              id="board-note"
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Agenda, ide, atau keputusan meeting…"
            />
            <button type="submit" disabled={!current || !text.trim()}>
              <Send size={16} /> Kirim catatan
            </button>
          </div>
        </form>
        {clear && (
          <div className="board-confirm" role="alert">
            <p>
              Hapus semua coretan dan catatan di papan ini untuk seluruh
              peserta?
            </p>
            <button
              onClick={() => {
                submit({ type: "board-clear", revision: current?.revision });
                setClear(false);
              }}
            >
              Ya, bersihkan
            </button>
            <button onClick={() => setClear(false)}>Batal</button>
          </div>
        )}
      </section>
    </div>
  );
}
function paintDraft(ctx: CanvasRenderingContext2D, s: BoardStroke) {
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = "round";
  ctx.beginPath();
  s.points.forEach(([x, y], i) =>
    i ? ctx.lineTo(x * 900, y * 450) : ctx.moveTo(x * 900, y * 450),
  );
  ctx.stroke();
}
