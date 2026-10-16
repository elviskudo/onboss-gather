import { test } from "node:test";
import assert from "node:assert/strict";
import { videoSubscriptions, canHear } from "../src/mediaPolicy.ts";
const person = (n, overrides = {}) => ({
  id: String(n).padStart(2, "0"),
  name: "Visitor " + n,
  color: "#c87855",
  x: n,
  z: 0,
  mic: true,
  camera: true,
  meeting: true,
  host: n === 0,
  ...overrides,
});
test("twenty-camera meeting subscribes every receiver to at most three remote videos", () => {
  const people = Array.from({ length: 20 }, (_, i) => person(i));
  for (const receiver of people) {
    const ids = videoSubscriptions(receiver, people);
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    assert.ok(!ids.includes(receiver.id));
  }
});
test("spatial video follows the nearest active cameras and excludes meetings", () => {
  const receiver = person(0, { meeting: false });
  const people = [
    receiver,
    person(1, { meeting: false, x: 2 }),
    person(2, { meeting: false, x: 3 }),
    person(3, { meeting: false, x: 4 }),
    person(4, { meeting: false, x: 5 }),
    person(5, { meeting: false, x: 13 }),
    person(6, { meeting: true, x: 1 }),
  ];
  assert.deepEqual(videoSubscriptions(receiver, people), ["01", "02", "03"]);
  assert.equal(canHear(receiver, people[5]), false);
  assert.equal(canHear(receiver, people[6]), false);
  people[1].camera = false;
  assert.deepEqual(videoSubscriptions(receiver, people), ["02", "03", "04"]);
});
test("audio and video cannot cross building boundaries, including active meetings", () => {
  const a = person(0, { area: "workspace" }),
    b = person(1, { area: "hall" });
  assert.equal(canHear(a, b), false);
  assert.deepEqual(videoSubscriptions(a, [a, b]), []);
  b.area = "workspace";
  assert.equal(canHear(a, b), true);
  a.meeting = false;
  b.meeting = false;
  b.area = "village";
  assert.equal(canHear(a, b), false);
});
