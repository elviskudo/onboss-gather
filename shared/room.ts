import { spaceQuery, type SpaceId } from "./space.ts";
export const DEFAULT_ROOM = "hallstatt-village";
export const validRoom = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9-]{1,48}$/.test(value);
export const roomPath = (room: string) =>
  `/rooms/${validRoom(room) ? room : DEFAULT_ROOM}`;
export function resolveRoom(url: URL) {
  const match = url.pathname.match(/^\/rooms\/([^/]+)\/?$/);
  if (match && validRoom(match[1])) return match[1];
  const query = url.searchParams.get("room");
  return validRoom(query) ? query : DEFAULT_ROOM;
}

export const loginPath = (room: string, space: SpaceId = "space-1") =>
  "/login?room=" +
  encodeURIComponent(room) +
  (space === "space-2" ? "&space=space-2" : "");
export const roomSpacePath = (room: string, space: SpaceId = "space-1") =>
  roomPath(room) + spaceQuery(space);
