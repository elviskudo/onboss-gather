import { WORLD_BOUNDS } from "./world.ts";
export const AVATARS = [
  {
    id: "man",
    label: "Cowok",
    icon: "👨",
    scale: 1,
    skin: "#c99169",
    hair: "#302820",
  },
  {
    id: "woman",
    label: "Cewek",
    icon: "👩",
    scale: 0.96,
    skin: "#dbab86",
    hair: "#382b25",
  },
  {
    id: "child",
    label: "Anak",
    icon: "🧒",
    scale: 0.69,
    skin: "#d6a07b",
    hair: "#32271f",
  },
  {
    id: "teen",
    label: "Remaja",
    icon: "🧑",
    scale: 0.88,
    skin: "#bb825d",
    hair: "#262526",
  },
  {
    id: "adult",
    label: "Dewasa",
    icon: "🧔",
    scale: 1.03,
    skin: "#a66f50",
    hair: "#372d29",
  },
  {
    id: "elder",
    label: "Orang tua",
    icon: "🧓",
    scale: 0.94,
    skin: "#d5aa8b",
    hair: "#d5d3ca",
  },
] as const;
export type AvatarId = (typeof AVATARS)[number]["id"];
export const SPACES = [
  {
    id: "workspace",
    name: "Working space",
    description: "Meja kerja bersama & meeting tim",
    x: -8,
    z: 0.4,
  },
  {
    id: "hall",
    name: "Community hall",
    description: "Ruang pertemuan bersama",
    x: -16,
    z: 0.4,
  },
  {
    id: "lounge",
    name: "Lakeside house",
    description: "Ruang santai & percakapan",
    x: 12,
    z: -0.6,
  },
  {
    id: "studio",
    name: "Creative studio",
    description: "Ruang ide & kolaborasi",
    x: -24,
    z: 0.4,
  },
] as const;
export type AreaId = "village" | (typeof SPACES)[number]["id"];
export const validArea = (v: unknown): v is AreaId =>
  v === "village" || SPACES.some((s) => s.id === v);
export const validAvatar = (v: unknown): v is AvatarId =>
  AVATARS.some((a) => a.id === v);
export const TREES = [
  [-29, -22],
  [-22, -24],
  [-12, -25],
  [-3, -24],
  [4, -23],
  [22, -23],
  [25, -13],
  [-30, -9],
  [-29, 4],
  [-28, 19],
  [-22, 23],
  [-16, 24],
  [-7, 24],
  [0, 22],
  [5, 21],
  [20, 19],
  [20, 13],
  [-6, 13],
  [-6, 18],
  [-21, 16],
  [-20, 9],
];
export const LAMPS = [
  [6, -8],
  [-4, 8],
  [21, 11],
  [-12, 10],
  [-19, -10],
];
export const SOLIDS = [
  [-8, -3, 3, 3],
  [-16, -3, 3, 3],
  [-24, -3, 3, 3],
  [-8, -18, 3, 3],
  [-16, -18, 3, 3.5],
  [-24, -16, 2.5, 3],
  [11, -17, 3.5, 3],
  [18, -17, 2.75, 3],
  [12, -4, 3.5, 3],
  [-24, 12, 2.5, 2.75],
  [12, 17, 3.6, 4.5],
  [7.75, 15.5, 1.3, 1.3],
  [0, 5, 2.1, 2.1],
  ...TREES.map(([x, z], i) => [
    x,
    z,
    0.3 * (0.8 + (i % 4) * 0.16),
    0.3 * (0.8 + (i % 4) * 0.16),
  ]),
  ...LAMPS.map(([x, z]) => [x, z, 0.24, 0.24]),
  [-13.5, 11, 3, 0.8], // Outdoor kitchen counter.
];
export const FURNITURE = [
  [0, 0, 3, 1.35],
  [-7, -4, 1, 2],
  [7, -4, 1, 2],
];
export function walkable(x: number, z: number, area: string = "village") {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (area !== "village")
    return (
      Math.abs(x) < 9.4 &&
      Math.abs(z) < 7.9 &&
      !FURNITURE.some(
        ([a, b, w, d]) =>
          Math.abs(x - a) < w + 0.35 && Math.abs(z - b) < d + 0.35,
      )
    );
  return (
    x > WORLD_BOUNDS.minX &&
    x < WORLD_BOUNDS.maxX &&
    z > WORLD_BOUNDS.minZ &&
    z < WORLD_BOUNDS.maxZ &&
    !(Math.abs(x - 2) < 1.55 && z < -4 && !(z > -12 && z < -8)) &&
    !SOLIDS.some(
      ([a, b, w, d]) =>
        Math.abs(x - a) < w + 0.35 && Math.abs(z - b) < d + 0.35,
    )
  );
}
export function sameAudioSpace(
  a: { id: string; meeting: boolean; area?: string },
  b: { id: string; meeting: boolean; area?: string },
) {
  return (
    a.id !== b.id &&
    (a.area || "village") === (b.area || "village") &&
    a.meeting === b.meeting
  );
}
/** Spread arrivals over free, walkable spots so people and name tags do not overlap. */
export function spawnPoint(
  area: string,
  people: { x: number; z: number; area?: string }[],
) {
  const points: number[][] =
    area === "village"
      ? [
          [3.5, 9],
          ...[9, 10.5, 12, 13.5, 15].flatMap((z) =>
            [-3, -1.5, 0, 1.5, 3].map((x) => [x, z]),
          ),
        ]
      : [
          [0, 6],
          ...[6, 4, 2, -2, -6].flatMap((z) =>
            [-8, -5, -2, 2, 5, 8].map((x) => [x, z]),
          ),
        ];
  const point = points.find(
    ([x, z]) =>
      walkable(x, z, area) &&
      !people.some(
        (p) =>
          (p.area || "village") === area && Math.hypot(p.x - x, p.z - z) < 0.9,
      ),
  );
  return { x: point?.[0] ?? points[0][0], z: point?.[1] ?? points[0][1] };
}
