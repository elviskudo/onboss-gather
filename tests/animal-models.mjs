import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import * as T from "three";
import { pathToFileURL } from "node:url";
import { animalAt, FARM_ANIMALS, nextFeed } from "../shared/animals.ts";
async function loadModel(path) {
  let source = stripTypeScriptTypes(await fs.readFile(path, "utf8"));
  source = source
    .replaceAll('"three"', JSON.stringify(import.meta.resolve("three")))
    .replaceAll(
      '"three/addons/utils/BufferGeometryUtils.js"',
      JSON.stringify(
        import.meta.resolve("three/addons/utils/BufferGeometryUtils.js"),
      ),
    )
    .replaceAll(
      '"../shared/animals"',
      JSON.stringify(new URL("../shared/animals.ts", import.meta.url).href),
    )
    .replaceAll(
      '"../shared/spaces"',
      JSON.stringify(new URL("../shared/spaces.ts", import.meta.url).href),
    );
  return import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
}
test("actual 3D NPC rigs walk, lower their heads to eat, show food and resume without moving during a meal", async () => {
  const { createFarmAnimals } = await loadModel(
    new URL("../src/FarmAnimals.ts", import.meta.url),
  );
  const farm = createFarmAnimals();
  assert.equal(farm.models.length, 21);
  for (const model of farm.models) {
    let walkingTime = 1234;
    while (!animalAt(model.def, walkingTime).walking) walkingTime += 100;
    farm.update(walkingTime, {});
    assert.ok(model.legs.some((l) => Math.abs(l.rotation.x) > 0.01));
    const before = model.root.position.clone();
    const feed = nextFeed(undefined, walkingTime, "Test");
    for (let i = 0; i < 35; i++)
      farm.update(walkingTime + 1000, { [model.def.id]: feed });
    assert.ok(model.root.position.distanceTo(before) < 1e-6);
    assert.ok(model.head.rotation.x > 0.7);
    assert.ok(model.head.position.y < model.headHeight);
    assert.equal(model.meal.visible, true);
    farm.update(walkingTime + 9000, { [model.def.id]: feed });
    assert.equal(model.meal.visible, false);
    const size = new T.Box3()
      .setFromObject(model.root)
      .getSize(new T.Vector3());
    assert.ok(size.y < 2 && size.y > 0.3, `${model.def.id}: height ${size.y}`);
  }
  farm.dispose();
});
test("farm avatars use a compact human silhouette; children remain smaller than adults and livestock fits beside them", async () => {
  const { createHuman } = await loadModel(
    new URL("../src/avatar.ts", import.meta.url),
  );
  const mat = (c) => new T.MeshStandardMaterial({ color: c }),
    person = { id: "test", name: "Test", color: "#628c7a", avatar: "adult" };
  const adult = createHuman(person, mat, true, true),
    child = createHuman({ ...person, avatar: "child" }, mat, true, true),
    original = createHuman(person, mat, true, false);
  const size = (g) => new T.Box3().setFromObject(g).getSize(new T.Vector3());
  assert.ok(size(adult).y < 2.5 && size(adult).y > 1.8);
  assert.ok(size(child).y < size(adult).y * 0.8);
  assert.ok(size(adult).y < size(original).y * 0.85);
  assert.equal(adult.userData.faceless, true);
  assert.equal(adult.userData.farming, true);
  for (const g of [adult, child, original])
    g.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
});
