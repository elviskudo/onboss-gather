import type { AvatarId } from "../shared/spaces";
export type SessionInfo = {
  required: boolean;
  configured: boolean;
  user: {
    name: string;
    founder?: boolean;
    profile?: { name: string; color: string; avatar: AvatarId; bio: string };
  } | null;
};
export const roomFromUrl = () =>
  new URLSearchParams(location.search)
    .get("room")
    ?.match(/^[a-z0-9-]{1,48}$/)?.[0] || "hallstatt-village";
