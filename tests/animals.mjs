import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FARM_ANIMALS,
  ANIMAL_SPECIES,
  animalAt,
  nextFeed,
  FEED_DURATION,
} from "../shared/animals.ts";
import { walkable } from "../shared/spaces.ts";
test("all five herds patrol valid ground and visibly alternate walking and eating", () => {
  assert.equal(FARM_ANIMALS.length, 21);
  for (const kind of ["cow", "sheep", "cat", "chicken", "duck"])
    assert.ok(FARM_ANIMALS.filter((a) => a.kind === kind).length >= 3);
  assert.equal(
    FARM_ANIMALS.some((a) => a.kind === "dog"),
    false,
  );
  for (const a of FARM_ANIMALS) {
    const positions = new Set(),
      states = new Set();
    for (let t = 0; t < 40000; t += 100) {
      const p = animalAt(a, t);
      assert.ok(walkable(p.x, p.z, "village", "space-2"), a.id);
      assert.ok(Number.isFinite(p.heading));
      positions.add(p.x.toFixed(2) + ":" + p.z.toFixed(2));
      states.add(p.eating ? "eating" : "walking");
      if (a.kind === "duck")
        assert.ok(
          p.x < 6 || p.x > 14 || p.z < 15.5 || p.z > 20.5,
          "ducks waddle beside the pond",
        );
    }
    assert.ok(positions.size > 30);
    assert.deepEqual([...states].sort(), ["eating", "walking"]);
  }
});
test("feeding pauses a moving animal without teleporting and resumes its walk after the meal", () => {
  for (const a of FARM_ANIMALS) {
    const now = 1700000000123,
      before = animalAt(a, now),
      feed = nextFeed(undefined, now, "Elvis");
    for (let dt = 0; dt < FEED_DURATION; dt += 250) {
      const p = animalAt(a, now + dt, feed);
      assert.equal(p.x, before.x);
      assert.equal(p.z, before.z);
      assert.equal(p.feeding, true);
      assert.equal(p.eating, true);
      assert.equal(p.walking, false);
      assert.equal(p.fedBy, "Elvis");
    }
    const resumed = animalAt(a, now + FEED_DURATION + 100, feed),
      expected = animalAt(a, now + 100);
    assert.equal(resumed.x, expected.x);
    assert.equal(resumed.z, expected.z);
    assert.equal(resumed.feeding, false);
    const later = now + FEED_DURATION + 5000,
      second = nextFeed(feed, later, "Nadia"),
      point = animalAt(a, later, feed),
      paused = animalAt(a, later + 1000, second);
    assert.equal(point.x, paused.x);
    assert.equal(point.z, paused.z);
    assert.equal(paused.fedBy, "Nadia");
  }
});
