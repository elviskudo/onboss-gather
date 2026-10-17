import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { AVATARS } from "../shared/spaces";
import type { Person } from "./types";
/** Original articulated human model with age-specific silhouettes and a deliberately featureless face. */
export function createHuman(
  p: Person,
  material: (color: string) => T.Material,
  low = false,
) {
  const preset = AVATARS.find((a) => a.id === p.avatar) || AVATARS[0];
  const root = new T.Group(),
    body = new T.Group();
  root.add(body);
  body.position.y = 0.62;
  body.scale.setScalar(preset.scale);
  const skin = preset.skin,
    hair = preset.hair,
    female = ["woman", "niqab", "girl"].includes(preset.id),
    elder = preset.id === "elder",
    child = preset.id === "child" || preset.id === "girl";
  function ellipsoid(
    parent: T.Object3D,
    c: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) {
    const m = new T.Mesh(
      new T.SphereGeometry(1, low ? 20 : 32, low ? 14 : 24),
      material(c),
    );
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function capsule(
    parent: T.Object3D,
    c: string,
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
  ) {
    const m = new T.Mesh(
      new T.CapsuleGeometry(r, h, 8, low ? 12 : 20),
      material(c),
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  const hips = ellipsoid(body, "#374755", 0, 1.02, 0, 0.29, 0.19, 0.18);
  hips.name = "hips";
  ellipsoid(body, p.color, 0, 1.43, 0, female ? 0.29 : 0.34, 0.43, 0.2);
  ellipsoid(body, p.color, 0, 1.14, 0, 0.29, 0.22, 0.19);
  capsule(body, skin, 0, 1.89, 0, 0.09, 0.16);
  const head = new T.Group();
  head.position.set(0, 2.1, 0);
  head.scale.set(1.24, 1.16, 1.24);
  body.add(head);
  if (female) {
    ellipsoid(head, p.color, 0, 0.02, -0.02, 0.29, 0.38, 0.27);
    ellipsoid(head, p.color, 0, -0.4, -0.035, 0.35, 0.35, 0.24);
    ellipsoid(head, skin, 0, 0.015, 0.218, 0.19, 0.25, 0.075);
    if (preset.id === "niqab")
      ellipsoid(head, p.color, 0, -0.11, 0.28, 0.215, 0.19, 0.04);
  } else {
    ellipsoid(head, skin, 0, 0.04, 0, child ? 0.255 : 0.23, 0.29, 0.215);
    ellipsoid(head, hair, 0, 0.2, -0.035, 0.238, 0.19, 0.215);
    for (const side of [-1, 1])
      ellipsoid(head, skin, side * 0.233, 0.025, 0, 0.047, 0.078, 0.048);
    if (preset.id === "adult" || elder)
      ellipsoid(
        head,
        elder ? "#eeeeE8" : "#20221f",
        0,
        -0.15,
        0.17,
        0.205,
        elder ? 0.21 : 0.18,
        0.115,
      );
  }
  root.userData.faceless = true;
  const limbs: T.Group[] = [];
  const knees: T.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new T.Group();
    leg.position.set(side * 0.15, 0.98, 0);
    body.add(leg);
    limbs.push(leg);
    capsule(leg, "#374755", 0, -0.24, 0, 0.105, 0.33);
    const knee = new T.Group();
    knee.position.y = -0.44;
    leg.add(knee);
    knees.push(knee);
    capsule(knee, "#374755", 0, -0.2, 0, 0.087, 0.32);
    ellipsoid(knee, "#e8e4d9", 0, -0.46, 0.07, 0.115, 0.085, 0.22);
    const arm = new T.Group();
    arm.position.set(side * 0.35, 1.69, 0);
    body.add(arm);
    limbs.push(arm);
    arm.rotation.z = side * 0.09;
    capsule(arm, p.color, side * 0.012, -0.19, 0, 0.105, 0.25);
    capsule(arm, skin, side * 0.035, -0.49, 0.015, 0.073, 0.25);
    ellipsoid(arm, skin, side * 0.04, -0.7, 0.02, 0.075, 0.1, 0.055);
  }
  // Merge rigid surfaces per material while retaining the four animated joints.
  function batch(group: T.Group, excluded: T.Group[] = []) {
    root.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert(),
      meshes: T.Mesh[] = [];
    group.traverse((o) => {
      if (
        o instanceof T.Mesh &&
        !excluded.some((l) => {
          let p: T.Object3D | null = o;
          while (p) {
            if (p === l) return true;
            p = p.parent;
          }
          return false;
        })
      )
        meshes.push(o);
    });
    const sets = new Map<T.Material, T.BufferGeometry[]>();
    for (const m of meshes) {
      const geo = m.geometry.index
        ? m.geometry.toNonIndexed()
        : m.geometry.clone();
      for (const attr of Object.keys(geo.attributes))
        if (!["position", "normal"].includes(attr)) geo.deleteAttribute(attr);
      geo.applyMatrix4(
        new T.Matrix4().multiplyMatrices(inverse, m.matrixWorld),
      );
      const material = m.material as T.Material;
      sets.set(material, [...(sets.get(material) || []), geo]);
    }
    for (const [material, geos] of sets) {
      const merged = mergeGeometries(geos);
      if (merged) {
        const mesh = new T.Mesh(merged, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      for (const geo of geos) geo.dispose();
    }
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
  }
  batch(body, limbs);
  for (const limb of limbs) batch(limb, knees);
  for (const knee of knees) batch(knee);
  root.userData.knees = knees;
  root.userData.scale = preset.scale;
  root.userData.limbs = limbs;
  root.userData.personId = p.id;
  return root;
}
export function animateHuman(
  g: T.Group,
  now: number,
  moving: boolean,
  sitting = false,
) {
  for (const knee of (g.userData.knees || []) as T.Group[])
    knee.rotation.x = sitting ? Math.PI / 2 : 0;
  const limbs = g.userData.limbs as T.Group[];
  limbs?.forEach(
    (limb, i) =>
      (limb.rotation.x = sitting
        ? i % 2
          ? -0.65
          : -Math.PI / 2
        : moving
          ? Math.sin(now * 0.01 + [0, Math.PI, Math.PI, 0][i]) *
            (i % 2 ? 0.4 : 0.5)
          : T.MathUtils.lerp(limb.rotation.x, 0, 0.2)),
  );
}
