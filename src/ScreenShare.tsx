import { useRef, useState } from "react";
import { Expand, Minus, MonitorUp, X } from "lucide-react";

export type SharedScreen = {
  id: string;
  name: string;
  stream: MediaStream;
  local?: boolean;
};

export function ScreenShare({
  screens,
  onStop,
}: {
  screens: SharedScreen[];
  onStop: () => void;
}) {
  const [selected, setSelected] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);
  const active = screens.find((s) => s.id === selected) || screens[0];
  if (!active) return null;
  return (
    <section
      className={"screen-share-panel" + (collapsed ? " collapsed" : "")}
      aria-label="Layar bersama"
    >
      <header>
        <MonitorUp size={18} />
        <strong>{active.local ? "Layar kamu" : "Layar " + active.name}</strong>
        <button
          aria-label={
            collapsed ? "Tampilkan layar bersama" : "Kecilkan layar bersama"
          }
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <Expand size={16} /> : <Minus size={16} />}
        </button>
        {active.local && (
          <button aria-label="Hentikan berbagi layar" onClick={onStop}>
            <X size={16} />
          </button>
        )}
      </header>
      {!collapsed && (
        <>
          <video
            key={active.id}
            ref={(element) => {
              video.current = element;
              if (element && element.srcObject !== active.stream) {
                element.srcObject = active.stream;
                void element.play().catch(() => {});
              }
            }}
            aria-label={
              active.local
                ? "Pratinjau layar kamu"
                : "Layar dibagikan " + active.name
            }
            autoPlay
            playsInline
            muted
          />
          <footer>
            <span>
              {active.local
                ? "Terlihat oleh peserta percakapan ini"
                : "Dibagikan dalam percakapan ini"}
            </span>
            <button
              onClick={() =>
                void video.current?.requestFullscreen?.().catch(() => {})
              }
            >
              <Expand size={14} /> Layar penuh
            </button>
          </footer>
        </>
      )}
      {screens.length > 1 && (
        <nav aria-label="Pilih layar">
          {screens.map((screen) => (
            <button
              key={screen.id}
              aria-pressed={screen.id === active.id}
              onClick={() => setSelected(screen.id)}
            >
              {screen.local ? "Layar kamu" : screen.name}
            </button>
          ))}
        </nav>
      )}
    </section>
  );
}
