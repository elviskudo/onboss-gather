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
import { resolveRoom } from "../shared/room";
export const roomFromUrl = () => resolveRoom(new URL(location.href));

import { resolveSpace } from "../shared/space";
export const spaceFromUrl = () => resolveSpace(new URL(location.href));
