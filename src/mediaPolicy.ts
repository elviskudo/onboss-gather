import { sameAudioSpace } from "../shared/spaces.ts";
import type { Person } from "./types";
export const MAX_REMOTE_VIDEO = 3;
export function canHear(receiver: Person, sender: Person): boolean {
  return (
    sameAudioSpace(receiver, sender) &&
    (receiver.meeting
      ? sender.meeting
      : !sender.meeting &&
        Math.hypot(receiver.x - sender.x, receiver.z - sender.z) < 12)
  );
}
/** A receiver subscribes to at most three remote cameras, plus its own preview. */
export function videoSubscriptions(
  receiver: Person,
  people: Person[],
): string[] {
  return people
    .filter((p) => p.camera && canHear(receiver, p))
    .sort((a, b) => {
      const distance = receiver.meeting
        ? 0
        : Math.hypot(receiver.x - a.x, receiver.z - a.z) -
          Math.hypot(receiver.x - b.x, receiver.z - b.z);
      return distance || a.id.localeCompare(b.id);
    })
    .slice(0, MAX_REMOTE_VIDEO)
    .map((p) => p.id);
}
