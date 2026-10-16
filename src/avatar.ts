import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { AVATARS } from "../shared/spaces";
import type { Person } from "./types";
/** Original articulated human model with age-specific proportions and facial features. */
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
    female = preset.id === "woman",
    elder = preset.id === "elder",
    child = preset.id === "child";
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
  ellipsoid(head, skin, 0, 0.04, 0, child ? 0.255 : 0.23, 0.29, 0.215);
  ellipsoid(head, hair, 0, 0.2, -0.035, 0.238, 0.19, 0.215);
  if (female) {
    ellipsoid(head, hair, -0.2, 0.02, -0.09, 0.085, 0.29, 0.15);
    ellipsoid(head, hair, 0.2, 0.02, -0.09, 0.085, 0.29, 0.15);
    ellipsoid(head, hair, 0.04, 0.2, -0.22, 0.16, 0.17, 0.16);
  }
  for (const side of [-1, 1]) {
    ellipsoid(head, skin, side * 0.233, 0.025, 0, 0.047, 0.078, 0.048);
    ellipsoid(head, "#f7f4e8", side * 0.085, 0.08, 0.193, 0.056, 0.044, 0.024);
    ellipsoid(head, "#302b28", side * 0.085, 0.08, 0.213, 0.027, 0.037, 0.014);
    ellipsoid(head, hair, side * 0.085, 0.14, 0.19, 0.058, 0.014, 0.018);
    if (elder) {
      const glasses = new T.Mesh(
        new T.TorusGeometry(0.065, 0.008, 5, 20),
        material("#62645f"),
      );
      glasses.position.set(side * 0.085, 0.082, 0.223);
      head.add(glasses);
    }
  }
  ellipsoid(head, skin, 0, 0.004, 0.217, 0.04, 0.06, 0.051);
  ellipsoid(head, "#955f50", 0, -0.105, 0.194, 0.06, 0.012, 0.017);
  if (preset.id === "adult")
    ellipsoid(head, hair, 0, -0.16, 0.114, 0.17, 0.105, 0.103);
  const limbs: T.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new T.Group();
    leg.position.set(side * 0.15, 0.98, 0);
    body.add(leg);
    limbs.push(leg);
    capsule(leg, "#374755", 0, -0.24, 0, 0.105, 0.33);
    capsule(leg, "#374755", 0, -0.64, 0, 0.087, 0.32);
    ellipsoid(leg, "#e8e4d9", 0, -0.9, 0.07, 0.115, 0.085, 0.22);
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
  for (const limb of limbs) batch(limb);
  root.userData.limbs = limbs;
  root.userData.personId = p.id;
  return root;
}
export function animateHuman(g: T.Group, now: number, moving: boolean) {
  const limbs = g.userData.limbs as T.Group[];
  limbs?.forEach(
    (limb, i) =>
      (limb.rotation.x = moving
        ? Math.sin(now * 0.01 + [0, Math.PI, Math.PI, 0][i]) *
          (i % 2 ? 0.4 : 0.5)
        : T.MathUtils.lerp(limb.rotation.x, 0, 0.2)),
  );
}
