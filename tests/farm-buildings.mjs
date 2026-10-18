import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import * as T from "three";
import { FARM_BUILDINGS, FARM_SOLIDS } from "../shared/farm.ts";
let source = stripTypeScriptTypes(
  await fs.readFile(
    new URL("../src/FarmBuildings.ts", import.meta.url),
    "utf8",
  ),
);
for (const spec of [
  "three",
  "three/addons/geometries/RoundedBoxGeometry.js",
  "three/addons/utils/BufferGeometryUtils.js",
])
  source = source.replaceAll(
    JSON.stringify(spec),
    JSON.stringify(import.meta.resolve(spec)),
  );
source = source.replaceAll(
  '"../shared/farm"',
  JSON.stringify(new URL("../shared/farm.ts", import.meta.url).href),
);
const { createFarmBuilding } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
test("all six farm buildings have actual depth, human-scale entrances and matching collision footprints", () => {
  for (const def of FARM_BUILDINGS) {
    const model = createFarmBuilding(def);
    assert.equal(model.userData.building, def.asset);
    assert.equal(model.userData.area, "area" in def ? def.area : undefined);
    let meshes = 0;
    model.traverse((o) => {
      assert.ok(!o.isSprite, "Architecture must never use billboards");
      if (o.isMesh) {
        meshes++;
        assert.ok(o.geometry.attributes.normal);
        for (const v of o.geometry.attributes.position.array)
          assert.ok(Number.isFinite(v));
      }
    });
    assert.ok(meshes > 2);
    assert.ok(meshes < 45, `${def.asset}: ${meshes} draw calls`);
    const bounds = new T.Box3().setFromObject(model),
      size = bounds.getSize(new T.Vector3());
    assert.ok(size.z > def.halfZ * 1.8, `${def.asset}: actual side walls`);
    assert.ok(
      size.x < def.halfX * 2 + 1,
      `${def.asset}: overhang fits the footprint`,
    );
    assert.ok(bounds.min.y >= 0.59, `${def.asset}: grounded`);
    assert.ok(size.y < 6.5 && size.y > 2.5, `${def.asset}: height ${size.y}`);
    assert.ok(
      FARM_SOLIDS.some(
        ([x, z, hx, hz]) =>
          x === def.x && z === def.z && hx === def.halfX && hz === def.halfZ,
      ),
    );
    if ("area" in def) {
      assert.ok(model.userData.door.height >= 2.3);
      assert.ok(model.userData.door.width >= 1.2);
      const ray = new T.Raycaster(
        new T.Vector3(def.x, 1.8, def.z + def.halfZ + 4),
        new T.Vector3(0, 0, -1),
      );
      const hit = ray.intersectObject(model, true)[0];
      assert.ok(hit, "front door is clickable");
      let ancestor = hit.object;
      while (ancestor && !ancestor.userData.area) ancestor = ancestor.parent;
      assert.equal(ancestor?.userData.area, def.area);
    }
    const geometries = new Set(),
      materials = new Set();
    model.traverse((o) => {
      if (o.isMesh) {
        geometries.add(o.geometry);
        materials.add(o.material);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  }
});
