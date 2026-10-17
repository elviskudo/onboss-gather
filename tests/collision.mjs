import { test } from "node:test";
import assert from "node:assert/strict";
import { walkable, TREES, LAMPS, spawnPoint } from "../shared/spaces.ts";
test("tree trunks, lamp posts, river banks and furniture block avatar movement", () => {
  for (const [x, z] of [...TREES, ...LAMPS])
    assert.equal(walkable(x, z), false);
  assert.equal(walkable(2, -16), false);
  assert.equal(walkable(2, -10), true);
  assert.equal(walkable(0, 0, "workspace"), false);
  assert.equal(walkable(0, 6, "workspace"), true);
  assert.equal(walkable(11, 6, "hall"), false);
  assert.equal(walkable(3.5, 9), true);
});

test("twenty arrivals get distinct walkable spawn points in every area", () => {
  for (const space of ["space-1", "space-2"])
    for (const area of ["village", "workspace", "hall", "lounge", "studio"]) {
      const people = [];
      for (let i = 0; i < 20; i++) {
        const p = spawnPoint(area, people, space);
        assert.equal(walkable(p.x, p.z, area, space), true);
        assert.ok(
          people.every((o) => Math.hypot(p.x - o.x, p.z - o.z) >= 1.05),
        );
        people.push({ ...p, area });
      }
    }
});

test("avatars block overlapping and crossing movement, allow separation, and isolate houses", async () => {
  const { personClear } = await import("../shared/social.ts");
  const self = { id: "a", x: 0, z: 0, area: "village" };
  assert.equal(
    personClear(self, 2, 0, [{ id: "b", x: 1.5, z: 0, area: "village" }]),
    false,
  );
  assert.equal(
    personClear(self, 3, 0, [{ id: "b", x: 1.5, z: 0, area: "village" }]),
    false,
  );
  assert.equal(
    personClear(self, 0, 2, [{ id: "b", x: 1.5, z: 0, area: "village" }]),
    true,
  );
  assert.equal(
    personClear(self, 2, 0, [{ id: "b", x: 1.5, z: 0, area: "hall" }]),
    true,
  );
  assert.equal(
    personClear(self, -1, 0, [{ id: "b", x: 0.5, z: 0, area: "village" }]),
    true,
  );
});
