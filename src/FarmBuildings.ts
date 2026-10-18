import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FARM_BUILDINGS } from "../shared/farm";

type Building = (typeof FARM_BUILDINGS)[number];
/** Metre-scale, original mesh architecture. Front entrances face +Z. */
export function createFarmBuilding(def: Building) {
  const root = new T.Group();
  root.name = `farm-building-${def.asset}`;
  root.position.set(def.x, 0.65, def.z);
  root.userData.building = def.asset;
  if ("area" in def) root.userData.area = def.area;
  const materials = new Map<string, T.MeshStandardMaterial>();
  function mat(color: string, glass = false) {
    const key = color + glass;
    if (!materials.has(key))
      materials.set(
        key,
        new T.MeshStandardMaterial({
          color,
          roughness: glass ? 0.22 : 0.86,
          metalness: glass ? 0.12 : 0,
          transparent: glass,
          opacity: glass ? 0.32 : 1,
          depthWrite: !glass,
          side: glass ? T.DoubleSide : T.FrontSide,
        }),
      );
    return materials.get(key)!;
  }
  const timber = mat("#735239"),
    trim = mat("#e9d5aa"),
    stone = mat("#aaa28a");
  const dark = mat("#344b46"),
    brass = mat("#bd9551");
  function mesh(
    g: T.BufferGeometry,
    material: T.Material,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const m = new T.Mesh(g, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    return m;
  }
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: T.Material,
    radius = 0.025,
  ) {
    return mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 4, h / 4, d / 4)),
      material,
      x,
      y,
      z,
    );
  }
  function beam(a: T.Vector3, b: T.Vector3, r: number, material: T.Material) {
    const delta = b.clone().sub(a);
    const m = mesh(
      new T.CylinderGeometry(r, r, delta.length(), 12),
      material,
      ...(a.clone().add(b).multiplyScalar(0.5).toArray() as [
        number,
        number,
        number,
      ]),
    );
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
  }
  const w = def.halfX * 2,
    d = def.halfZ * 2,
    front = d / 2;
  function roof(eave: number, rise: number, color: string) {
    const half = w / 2 + 0.28,
      depth = d + 0.6;
    // A closed, bevelled gable with thickness, rather than a flat triangle billboard.
    const shape = new T.Shape();
    shape.moveTo(-half, eave);
    shape.lineTo(0, eave + rise);
    shape.lineTo(half, eave);
    shape.lineTo(half, eave - 0.14);
    shape.lineTo(0, eave + rise - 0.18);
    shape.lineTo(-half, eave - 0.14);
    shape.closePath();
    mesh(
      new T.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.045,
        bevelThickness: 0.035,
      }),
      mat(color),
      0,
      0,
      -depth / 2,
    );
    // Ridge cap and individually spaced courses catch the light from every camera angle.
    beam(
      new T.Vector3(0, eave + rise + 0.035, -depth / 2),
      new T.Vector3(0, eave + rise + 0.035, depth / 2),
      0.08,
      mat(color),
    );
    for (const side of [-1, 1])
      for (let t = 0.2; t < 1; t += 0.2) {
        const x = side * half * t,
          y = eave + rise * (1 - t) + 0.1;
        beam(
          new T.Vector3(x, y, -depth / 2),
          new T.Vector3(x, y, depth / 2),
          0.025,
          mat(color),
        );
      }
    for (const z of [-depth / 2, depth / 2])
      for (const side of [-1, 1])
        beam(
          new T.Vector3(0, eave + rise, z),
          new T.Vector3(side * half, eave, z),
          0.065,
          timber,
        );
  }
  function door(width = 1.25, height = 2.35) {
    const z = front + 0.045;
    box(width, height, 0.1, 0, height / 2 + 0.1, z, timber);
    for (let i = 1; i < 5; i++)
      box(
        0.015,
        height - 0.16,
        0.025,
        -width / 2 + (width * i) / 5,
        height / 2 + 0.1,
        z + 0.06,
        dark,
        0,
      );
    for (const x of [-width / 2 - 0.08, width / 2 + 0.08])
      box(0.13, height + 0.2, 0.18, x, (height + 0.2) / 2, z, trim);
    box(width + 0.3, 0.15, 0.18, 0, height + 0.2, z, trim);
    mesh(
      new T.SphereGeometry(0.055, 12, 8),
      brass,
      width * 0.32,
      1.18,
      z + 0.12,
    );
    root.userData.door = { width, height, front };
  }
  function windowAt(
    x: number,
    z: number,
    side = false,
    elevation = 1.85,
    scale = 1,
  ) {
    const panel = new T.Group();
    root.add(panel);
    panel.position.set(x, elevation, z);
    panel.scale.setScalar(scale);
    if (side) panel.rotation.y = Math.PI / 2;
    // Temporarily author at the origin, then parent the parts to the window plane.
    const pieces: T.Mesh[] = [];
    pieces.push(box(1.12, 1.1, 0.075, 0, 0, 0, mat("#92b9bc")));
    for (const px of [-0.59, 0, 0.59])
      pieces.push(box(0.085, 1.24, 0.14, px, 0, 0.03, trim));
    for (const py of [-0.59, 0, 0.59])
      pieces.push(box(1.26, 0.085, 0.14, 0, py, 0.03, trim));
    pieces.push(box(1.4, 0.12, 0.3, 0, -0.66, 0.06, timber));
    pieces.forEach((p) => panel.add(p));
  }
  if (def.asset === "well") {
    const ring = new T.Shape();
    ring.absarc(0, 0, 0.86, 0, Math.PI * 2, false);
    const hole = new T.Path();
    hole.absarc(0, 0, 0.61, 0, Math.PI * 2, true);
    ring.holes.push(hole);
    const wall = mesh(
      new T.ExtrudeGeometry(ring, {
        depth: 0.85,
        bevelEnabled: true,
        bevelSegments: 3,
        bevelSize: 0.045,
        bevelThickness: 0.035,
        steps: 1,
        curveSegments: 32,
      }),
      stone,
      0,
      0.88,
      0,
    );
    wall.rotation.x = Math.PI / 2;
    const water = mesh(
      new T.CircleGeometry(0.6, 32),
      mat("#547f85"),
      0,
      0.24,
      0,
    );
    water.rotation.x = -Math.PI / 2;
    for (const x of [-0.74, 0.74]) box(0.14, 2.35, 0.16, x, 1.18, 0, timber);
    beam(
      new T.Vector3(-0.8, 1.65, 0),
      new T.Vector3(0.8, 1.65, 0),
      0.08,
      timber,
    );
    beam(new T.Vector3(0, 0.55, 0), new T.Vector3(0, 1.65, 0), 0.018, trim);
    roof(2.3, 0.55, "#776858");
  } else if (def.asset === "greenhouse") {
    box(w, 0.22, d, 0, 0.11, 0, stone);
    const glass = mat("#bad9cb", true),
      frame = mat("#d5d9c7");
    const eave = 2.75,
      rise = 1.25;
    const glazedGable = new T.Shape();
    glazedGable.moveTo(-w / 2, eave);
    glazedGable.lineTo(0, eave + rise);
    glazedGable.lineTo(w / 2, eave);
    glazedGable.closePath();
    for (const z of [-d / 2, d / 2])
      mesh(new T.ShapeGeometry(glazedGable), glass, 0, 0, z);

    for (const x of [-w / 2, w / 2])
      box(0.035, eave - 0.2, d, x, (eave + 0.2) / 2, 0, glass, 0);
    box(w, eave - 0.2, 0.035, 0, (eave + 0.2) / 2, -d / 2, glass, 0);
    // Front glazing leaves a correctly sized central entrance.
    for (const side of [-1, 1])
      box(
        (w - 1.4) / 2,
        eave - 0.2,
        0.035,
        (side * (w + 1.4)) / 4,
        (eave + 0.2) / 2,
        front,
        glass,
        0,
      );
    for (const z of [-d / 2, 0, d / 2]) {
      for (const x of [-w / 2, w / 2])
        box(0.09, eave, 0.09, x, eave / 2, z, frame);
      for (const side of [-1, 1])
        beam(
          new T.Vector3((side * w) / 2, eave, z),
          new T.Vector3(0, eave + rise, z),
          0.045,
          frame,
        );
    }
    for (const side of [-1, 1]) {
      const length = Math.hypot(w / 2, rise);
      const pane = box(
        length,
        0.035,
        d,
        (side * w) / 4,
        eave + rise / 2,
        0,
        glass,
        0,
      );
      pane.rotation.z = -side * Math.atan2(rise, w / 2);
      for (const y of [1.1, 2.0, eave])
        box(0.065, 0.065, d, (side * w) / 2, y, 0, frame);
    }
    beam(
      new T.Vector3(0, eave + rise, -d / 2),
      new T.Vector3(0, eave + rise, d / 2),
      0.055,
      frame,
    );
    door();
    // Raised beds and leafy plants remain visible through real glass walls.
    for (const side of [-1, 1]) {
      box(1.0, 0.42, d - 0.65, side * (w / 2 - 0.72), 0.43, 0, timber);
      box(0.9, 0.05, d - 0.75, side * (w / 2 - 0.72), 0.66, 0, mat("#63503b"));
      for (const z of [-1, 0, 1])
        mesh(
          new T.SphereGeometry(0.29, 12, 10),
          mat("#608452"),
          side * (w / 2 - 0.72),
          0.91,
          z,
        );
    }
  } else {
    const coop = def.asset === "coop",
      barn = def.asset === "barn",
      shop = def.asset === "workshop";
    const h = coop ? 2.05 : barn ? 3.5 : 2.95,
      rise = coop ? 1.0 : barn ? 2.0 : 1.6;
    const wall = mat(
      barn ? "#ae5c46" : coop ? "#cfad73" : shop ? "#d2bb97" : "#eedfbc",
    );
    box(w, 0.25, d, 0, 0.125, 0, stone);
    box(w - 0.08, h - 0.25, d - 0.08, 0, (h + 0.25) / 2, 0, wall, 0.055);
    for (const x of [-w / 2 + 0.08, w / 2 - 0.08])
      for (const z of [-d / 2 + 0.08, d / 2 - 0.08])
        box(0.16, h, 0.16, x, h / 2, z, timber);
    // Timber siding on all walls, with broad plaster panels on the cottage.
    if (barn || coop || shop) {
      for (let y = 0.48; y < h; y += 0.34) {
        for (const z of [-d / 2, d / 2])
          box(w, 0.025, 0.025, 0, y, z, timber, 0.005);
        for (const x of [-w / 2, w / 2])
          box(0.025, 0.025, d, x, y, 0, timber, 0.005);
      }
    }
    const gable = new T.Shape();
    gable.moveTo(-w / 2 + 0.04, h - 0.04);
    gable.lineTo(0, h + rise);
    gable.lineTo(w / 2 - 0.04, h - 0.04);
    gable.closePath();
    mesh(
      new T.ExtrudeGeometry(gable, { depth: d - 0.08, bevelEnabled: false }),
      wall,
      0,
      0,
      -d / 2 + 0.04,
    );
    roof(
      h + 0.08,
      rise,
      barn ? "#6c7771" : coop ? "#8e6545" : shop ? "#697b75" : "#b56d50",
    );
    door(coop ? 0.8 : barn ? 1.9 : 1.25, coop ? 1.45 : 2.35);
    if (!coop) {
      for (const x of [-w * 0.32, w * 0.32]) windowAt(x, front + 0.075);
      windowAt(w / 2 + 0.045, 0, true);
    } else {
      windowAt(-1.05, front + 0.08, false, 1.25, 0.65);
    }
    if (!barn && !coop) {
      const chimney = mat("#a68f7b");
      box(0.55, 1.75, 0.65, -w * 0.29, h + rise * 0.45, -0.6, chimney);
      box(0.67, 0.14, 0.77, -w * 0.29, h + rise * 0.45 + 0.85, -0.6, stone);
    }
    if (barn) {
      // Loft vent and structural cross braces make the hall read as a working barn.
      mesh(
        new T.CylinderGeometry(0.38, 0.38, 0.1, 24),
        dark,
        0,
        h + 0.55,
        front + 0.08,
      ).rotation.x = Math.PI / 2;
      for (const s of [-1, 1])
        beam(
          new T.Vector3(-s * 0.8, 0.38, front + 0.13),
          new T.Vector3(s * 0.8, 2.25, front + 0.13),
          0.035,
          trim,
        );
    }
  }
  // Merge opaque architecture per material: detail without hundreds of draw calls.
  root.updateMatrixWorld(true);
  const buckets = new Map<T.Material, T.BufferGeometry[]>();
  const old: T.Mesh[] = [];
  root.traverse((o) => {
    if (
      o instanceof T.Mesh &&
      !Array.isArray(o.material) &&
      !o.material.transparent
    ) {
      const geometry = o.geometry.index
        ? o.geometry.toNonIndexed()
        : o.geometry.clone();
      const relative = new T.Matrix4()
        .copy(root.matrixWorld)
        .invert()
        .multiply(o.matrixWorld);
      geometry.applyMatrix4(relative);
      const list = buckets.get(o.material) || [];
      list.push(geometry);
      buckets.set(o.material, list);
      old.push(o);
    }
  });
  for (const o of old) {
    o.removeFromParent();
    o.geometry.dispose();
  }
  for (const [material, geometries] of buckets) {
    const joined = mergeGeometries(geometries, false);
    if (!joined) throw new Error(`Cannot batch farm building ${def.asset}`);
    mesh(joined, material);
    geometries.forEach((g) => g.dispose());
  }
  return root;
}
