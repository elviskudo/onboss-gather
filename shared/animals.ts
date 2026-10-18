export type AnimalKind = "cow" | "sheep" | "cat" | "chicken" | "duck";
export type AnimalFeed = { at: number; delay: number; by: string };
export type FarmFeeds = Record<string, AnimalFeed>;
export const FEED_DURATION = 8000;
export const FEED_DISTANCE = 3.2;
export const ANIMAL_SPECIES = {
  cow: { label: "Sapi", food: "jerami", height: 1.45 },
  sheep: { label: "Domba", food: "rumput", height: 1.05 },
  cat: { label: "Kucing", food: "makanan kucing", height: 0.65 },
  chicken: { label: "Ayam", food: "biji-bijian", height: 0.65 },
  duck: { label: "Bebek", food: "biji-bijian", height: 0.7 },
} as const;
export type FarmAnimal = {
  id: string;
  kind: AnimalKind;
  name: string;
  x: number;
  z: number;
  radius: number;
  phase: number;
  variant: number;
};
const groups: [AnimalKind, string[], number[][]][] = [
  [
    "cow",
    ["Susu", "Moka", "Bintik"],
    [
      [7, -1],
      [12, 1],
      [4, -4],
    ],
  ],
  [
    "sheep",
    ["Awan", "Kapas", "Bolu", "Embun"],
    [
      [-11, -1],
      [-14, 1],
      [-9, -2],
      [-16, -3],
    ],
  ],
  [
    "cat",
    ["Oren", "Mimi", "Luna"],
    [
      [-5, 4],
      [-3, 9],
      [1, 7],
    ],
  ],
  [
    "chicken",
    ["Kiki", "Piko", "Cici", "Koko", "Biji", "Pipi"],
    [
      [0, -5],
      [1, -2],
      [3, 1],
      [17, 3],
      [21, 1],
      [20, -5],
    ],
  ],
  [
    "duck",
    ["Bubu", "Kwek", "Puding", "Nala", "Putih"],
    [
      [5, 16],
      [5, 18],
      [15, 16],
      [15, 19],
      [10, 22],
    ],
  ],
];
export const FARM_ANIMALS: FarmAnimal[] = groups.flatMap(
  ([kind, names, points], g) =>
    names.map((name, i) => ({
      id: `${kind}-${i + 1}`,
      kind,
      name,
      x: points[i][0],
      z: points[i][1],
      radius:
        kind === "cow"
          ? 1.25
          : kind === "sheep"
            ? 0.8
            : kind === "cat"
              ? 1.1
              : 0.45,
      phase: g * 7 + i * 3.13,
      variant: i,
    })),
);
export function animalAt(animal: FarmAnimal, now: number, feed?: AnimalFeed) {
  const paused = feed ? Math.min(Math.max(0, now - feed.at), FEED_DURATION) : 0;
  const clock = (now - (feed?.delay || 0) - paused) / 1000 + animal.phase;
  const t = ((clock % 40) + 40) % 40,
    edge = Math.floor(t / 10),
    progress = Math.min((t % 10) / 7, 1);
  const r = animal.radius,
    points = [
      [-r, -r * 0.65],
      [r, -r * 0.65],
      [r, r * 0.65],
      [-r, r * 0.65],
    ];
  const a = points[edge],
    b = points[(edge + 1) % 4];
  const feeding = !!feed && now >= feed.at && now - feed.at < FEED_DURATION;
  return {
    x: animal.x + a[0] + (b[0] - a[0]) * progress,
    z: animal.z + a[1] + (b[1] - a[1]) * progress,
    heading: Math.atan2(b[0] - a[0], b[1] - a[1]),
    walking: t % 10 < 7 && !feeding,
    eating: t % 10 >= 7 || feeding,
    feeding,
    fedBy: feeding ? feed?.by : undefined,
  };
}
export function nextFeed(
  previous: AnimalFeed | undefined,
  now: number,
  by: string,
): AnimalFeed {
  return {
    at: now,
    delay:
      (previous?.delay || 0) +
      (previous ? Math.min(Math.max(0, now - previous.at), FEED_DURATION) : 0),
    by,
  };
}
