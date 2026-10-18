import { useEffect, useState } from "react";
import {
  FARM_ANIMALS,
  ANIMAL_SPECIES,
  animalAt,
  FEED_DISTANCE,
  type FarmFeeds,
} from "../shared/animals";
export function FarmHud({
  feeds,
  offset,
  self,
  selected,
  onSelect,
  onFeed,
  onWalk,
  enabled,
}: {
  feeds: FarmFeeds;
  offset: number;
  self: { x: number; z: number };
  selected: string | null;
  onSelect: (id: string | null) => void;
  onFeed: (id: string) => void;
  onWalk: (x: number, z: number) => void;
  enabled: boolean;
}) {
  const [now, setNow] = useState(Date.now()),
    [list, setList] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const animals = FARM_ANIMALS.map((def) => {
    const state = animalAt(def, now + offset, feeds[def.id]);
    return {
      ...def,
      ...state,
      distance: Math.hypot(state.x - self.x, state.z - self.z),
    };
  });
  const nearest = animals.slice().sort((a, b) => a.distance - b.distance)[0];
  const animal =
    selected === "none"
      ? undefined
      : animals.find((a) => a.id === selected) ||
        (nearest.distance < 4 ? nearest : undefined);
  const shortcut = animal || nearest;
  const shortcutEnabled =
    shortcut.distance <= FEED_DISTANCE && !shortcut.feeding && enabled;
  const canFeed =
    !!animal && animal.distance <= FEED_DISTANCE && !animal.feeding && enabled;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() !== "f" ||
        e.repeat ||
        !shortcutEnabled ||
        (e.target instanceof HTMLElement &&
          e.target.closest("input,textarea,select,[contenteditable=true]"))
      )
        return;
      e.preventDefault();
      onFeed(shortcut.id);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [shortcut.id, shortcutEnabled, onFeed]);
  return (
    <aside className="farm-hud" aria-label="Hewan kebun">
      <button
        className="farm-herd-toggle"
        aria-expanded={list}
        onClick={() => setList(!list)}
      >
        Hewan kebun <span>{animals.length} teman kecil</span>
      </button>
      {list && (
        <div className="farm-herd-list">
          {animals.map((a) => (
            <button
              key={a.id}
              aria-label={`Lihat ${a.name} ${ANIMAL_SPECIES[a.kind].label}`}
              onClick={() => {
                onSelect(a.id);
                setList(false);
              }}
            >
              <span>{a.name}</span>
              <small>
                {ANIMAL_SPECIES[a.kind].label} · {Math.round(a.distance)} m
              </small>
            </button>
          ))}
        </div>
      )}
      {animal && (
        <section
          className="farm-animal-card"
          aria-label={`Profil hewan ${animal.name}`}
          data-animal-id={animal.id}
          data-activity={
            animal.feeding ? "fed" : animal.eating ? "eating" : "walking"
          }
        >
          <div>
            <span className="farm-animal-dot" />
            <strong>{animal.name}</strong>
            <small>{ANIMAL_SPECIES[animal.kind].label}</small>
            <button
              aria-label="Tutup profil hewan"
              onClick={() => onSelect("none")}
            >
              ×
            </button>
          </div>
          <p>
            {animal.feeding
              ? `Sedang makan · diberi ${feeds[animal.id]?.by}`
              : animal.eating
                ? ["cow", "sheep"].includes(animal.kind)
                  ? "Sedang merumput"
                  : "Sedang mencari makan"
                : "Jalan-jalan di kebun"}
          </p>
          <div className="farm-animal-actions">
            <button
              onClick={() =>
                onWalk(animal.x + (self.x > animal.x ? 1.5 : -1.5), animal.z)
              }
              disabled={!enabled}
            >
              Dekati · {animal.distance.toFixed(1)} m
            </button>
            <button
              className="feed-animal"
              disabled={!canFeed}
              onClick={() => onFeed(animal.id)}
            >
              Beri makan <kbd>F</kbd>
            </button>
          </div>
          <small>
            {animal.feeding
              ? "Terima kasih! Tunggu sampai selesai makan."
              : animal.distance > FEED_DISTANCE
                ? "Dekati hewan untuk memberinya makan."
                : `Pakan: ${ANIMAL_SPECIES[animal.kind].food}`}
          </small>
        </section>
      )}
      {!animal && !list && (
        <p className="farm-hud-hint">
          Klik hewan · Dekati lalu tekan <kbd>F</kbd> untuk memberi makan
        </p>
      )}
    </aside>
  );
}
