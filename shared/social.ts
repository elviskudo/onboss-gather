import { walkable, type AreaId } from "./spaces.ts";
export const AVATAR_GAP = 1.05;
export const SEATS = [-2.2, 2.2].flatMap((z, row) =>
  [-2, 0, 2].map((x, column) => ({
    id: `seat-${row}-${column}`,
    x,
    z,
    angle: z < 0 ? 0 : Math.PI,
  })),
);
export type Occupant = {
  id: string;
  x: number;
  z: number;
  area?: string;
  seat?: string;
};
export function personClear(
  self: Occupant,
  x: number,
  z: number,
  people: Occupant[],
) {
  return !people.some((p) => {
    if (p.id === self.id || (p.area || "village") !== (self.area || "village"))
      return false;
    const dx = x - self.x,
      dz = z - self.z,
      sx = self.x - p.x,
      sz = self.z - p.z;
    const before = Math.hypot(sx, sz),
      after = Math.hypot(x - p.x, z - p.z);
    if (before < AVATAR_GAP - 0.0001)
      return after < before - 0.0001 || dx * sx + dz * sz < -0.0001;
    const length = dx * dx + dz * dz;
    const t = length
      ? Math.max(0, Math.min(1, -(sx * dx + sz * dz) / length))
      : 0;
    return Math.hypot(sx + t * dx, sz + t * dz) < AVATAR_GAP - 0.0001;
  });
}
export function freePoint(
  area: AreaId,
  people: Occupant[],
  near: { x: number; z: number },
  id: string,
) {
  for (const distance of [1.5, 2.5, 4, 6])
    for (let n = 0; n < 12; n++) {
      const x = near.x + Math.cos((n * Math.PI) / 6) * distance,
        z = near.z + Math.sin((n * Math.PI) / 6) * distance;
      if (
        walkable(x, z, area) &&
        !people.some(
          (p) =>
            p.id !== id &&
            (p.area || "village") === area &&
            Math.hypot(p.x - x, p.z - z) < AVATAR_GAP,
        )
      )
        return { x, z };
    }
  return null;
}
export type ActivityInvite = {
  id: string;
  from: string;
  name: string;
  to: string;
  area: AreaId;
  kind: "chat" | "meeting";
  expires: number;
};
export type BoardStroke = {
  id: string;
  author: string;
  color: string;
  width: number;
  points: [number, number][];
};
export type BoardNote = { id: string; author: string; text: string };
export type Board = {
  area: AreaId;
  revision: number;
  strokes: BoardStroke[];
  notes: BoardNote[];
};
export const emptyBoard = (area: AreaId): Board => ({
  area,
  revision: 0,
  strokes: [],
  notes: [],
});
