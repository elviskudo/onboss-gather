export type SpaceId = "space-1" | "space-2";
export const WORLD_SPACES = [
  { id: "space-1", name: "Space 1", description: "Desa Hallstatt" },
  { id: "space-2", name: "Space 2", description: "Harvest Farm" },
] as const;
export const validSpace = (value: unknown): value is SpaceId =>
  value === "space-1" || value === "space-2";
export const resolveSpace = (url: URL): SpaceId =>
  url.searchParams.get("space") === "space-2" ? "space-2" : "space-1";
export const spaceQuery = (space: SpaceId) =>
  space === "space-2" ? "?space=space-2" : "";
export const areaKey = (space: SpaceId | undefined, area: string) =>
  space === "space-2" ? `space-2:${area}` : area;
export const sameSpace = (a: { space?: string }, b: { space?: string }) =>
  (a.space || "space-1") === (b.space || "space-1");
