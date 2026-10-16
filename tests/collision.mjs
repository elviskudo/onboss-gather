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
  for (const area of ["village", "workspace", "hall", "lounge", "studio"]) {
    const people = [];
    for (let i = 0; i < 20; i++) {
      const p = spawnPoint(area, people);
      assert.equal(walkable(p.x, p.z, area), true);
      assert.ok(people.every((o) => Math.hypot(p.x - o.x, p.z - o.z) >= 0.9));
      people.push({ ...p, area });
    }
  }
});
