import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  FARM_ANIMALS,
  animalAt,
  type FarmFeeds,
  type FarmAnimal,
} from "../shared/animals";
/** Smooth articulated, code-authored farm animals. +Z is forward; one world unit is about a metre. */
export function createFarmAnimals() {
  const group = new T.Group();
  group.name = "farm-npcs";
  const materials = new Map<string, T.MeshStandardMaterial>();
  const mat = (color: string) => {
    let m = materials.get(color);
    if (!m) {
      m = new T.MeshStandardMaterial({ color, roughness: 0.94 });
      materials.set(color, m);
    }
    return m;
  };
  const sphere = new T.SphereGeometry(1, 16, 12);
  const models = FARM_ANIMALS.map((def) => {
    const root = new T.Group(),
      body = new T.Group(),
      head = new T.Group(),
      tail = new T.Group();
    root.add(body);
    body.add(head, tail);
    group.add(root);
    root.userData.animalId = def.id;
    root.name = def.id;
    const legs: T.Group[] = [];
    const ball = (
      parent: T.Object3D,
      color: string,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
    ) => {
      const mesh = new T.Mesh(sphere.clone(), mat(color));
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const cone = (
      parent: T.Object3D,
      color: string,
      x: number,
      y: number,
      z: number,
      r: number,
      h: number,
      rotation = 0,
    ) => {
      const mesh = new T.Mesh(new T.ConeGeometry(r, h, 12), mat(color));
      mesh.position.set(x, y, z);
      mesh.rotation.z = rotation;
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const leg = (
      x: number,
      z: number,
      y: number,
      length: number,
      color: string,
    ) => {
      const pivot = new T.Group();
      pivot.position.set(x, y, z);
      body.add(pivot);
      legs.push(pivot);
      ball(pivot, color, 0, -length / 2, 0, 0.065, length / 2, 0.065);
      ball(pivot, "#655443", 0, -length, 0.025, 0.085, 0.055, 0.11);
    };
    const eyes = (x: number, y: number, z: number) => {
      for (const side of [-1, 1])
        ball(head, "#302c27", side * x, y, z, 0.025, 0.034, 0.018);
    };
    if (def.kind === "cow") {
      const cream = def.variant === 1 ? "#b98a61" : "#f4e8d0",
        spot = def.variant === 1 ? "#8b6044" : "#433e35";
      ball(body, cream, 0, 0.9, 0, 0.48, 0.48, 0.82);
      for (const side of [-1, 1]) {
        ball(body, spot, side * 0.43, 1.02, -0.23, 0.07, 0.25, 0.32);
        ball(body, spot, side * 0.45, 0.86, 0.36, 0.055, 0.2, 0.19);
        leg(side * 0.3, -0.5, 0.62, 0.55, cream);
        leg(side * 0.3, 0.49, 0.62, 0.55, cream);
      }
      head.position.set(0, 1.04, 0.78);
      ball(head, cream, 0, 0, 0.05, 0.3, 0.34, 0.34);
      ball(head, "#d4a291", 0, -0.12, 0.33, 0.29, 0.19, 0.16);
      for (const side of [-1, 1]) {
        ball(head, cream, side * 0.35, 0.13, -0.02, 0.2, 0.1, 0.12);
        cone(
          head,
          "#d9c79f",
          side * 0.2,
          0.37,
          -0.06,
          0.065,
          0.22,
          side * -0.25,
        );
        ball(head, "#765a4e", side * 0.12, -0.08, 0.47, 0.035, 0.025, 0.015);
      }
      eyes(0.16, 0.06, 0.33);
      tail.position.set(0, 1, -0.76);
      ball(tail, cream, 0, -0.16, -0.05, 0.045, 0.24, 0.04);
      ball(tail, spot, 0, -0.4, -0.05, 0.075, 0.1, 0.07);
    } else if (def.kind === "sheep") {
      const wool = def.variant % 2 ? "#e5d4b4" : "#f6edda";
      ball(body, wool, 0, 0.65, 0, 0.42, 0.39, 0.57);
      for (let i = 0; i < 10; i++) {
        const a = i * 2.4;
        ball(
          body,
          wool,
          Math.cos(a) * 0.3,
          0.72 + Math.sin(a) * 0.2,
          Math.sin(i * 1.8) * 0.37,
          0.21,
          0.21,
          0.22,
        );
      }
      for (const side of [-1, 1]) {
        leg(side * 0.24, -0.3, 0.43, 0.36, "#756350");
        leg(side * 0.24, 0.3, 0.43, 0.36, "#756350");
      }
      head.position.set(0, 0.78, 0.53);
      ball(head, "#8a7660", 0, -0.03, 0.08, 0.21, 0.26, 0.27);
      ball(head, wool, 0, 0.19, -0.03, 0.24, 0.15, 0.2);
      for (const side of [-1, 1])
        ball(head, "#8a7660", side * 0.25, 0.05, 0, 0.15, 0.07, 0.1);
      eyes(0.11, 0.04, 0.3);
      tail.position.set(0, 0.65, -0.55);
      ball(tail, wool, 0, 0, 0, 0.13, 0.15, 0.16);
    } else if (def.kind === "cat") {
      const color = ["#c88b50", "#66645d", "#d5c7ae"][def.variant % 3];
      ball(body, color, 0, 0.33, 0, 0.18, 0.22, 0.38);
      for (const side of [-1, 1]) {
        leg(side * 0.12, -0.2, 0.23, 0.16, color);
        leg(side * 0.12, 0.19, 0.23, 0.16, color);
      }
      head.position.set(0, 0.5, 0.32);
      ball(head, color, 0, 0, 0, 0.23, 0.21, 0.21);
      for (const side of [-1, 1]) {
        cone(head, color, side * 0.15, 0.23, 0, 0.105, 0.25, side * -0.16);
        cone(
          head,
          "#c39384",
          side * 0.15,
          0.235,
          0.03,
          0.057,
          0.15,
          side * -0.16,
        );
        ball(head, "#efe0c3", side * 0.075, -0.07, 0.18, 0.08, 0.06, 0.055);
      }
      ball(head, "#9b6457", 0, -0.03, 0.22, 0.035, 0.025, 0.02);
      eyes(0.1, 0.025, 0.19);
      tail.position.set(0, 0.34, -0.32);
      ball(tail, color, 0, 0.18, -0.12, 0.055, 0.27, 0.06);
      ball(tail, color, 0, 0.41, -0.06, 0.06, 0.11, 0.1);
    } else {
      const duck = def.kind === "duck",
        color = duck
          ? def.variant % 2
            ? "#e6d6ad"
            : "#f4edda"
          : def.variant % 2
            ? "#ba7b4a"
            : "#e8d5a8";
      ball(
        body,
        color,
        0,
        0.31,
        0,
        duck ? 0.23 : 0.23,
        0.25,
        duck ? 0.38 : 0.28,
      );
      for (const side of [-1, 1]) {
        leg(side * 0.115, 0, 0.15, 0.09, "#b87838");
        ball(body, color, side * 0.205, 0.33, -0.02, 0.075, 0.16, 0.23);
      }
      head.position.set(0, duck ? 0.55 : 0.57, duck ? 0.29 : 0.18);
      ball(head, color, 0, 0, 0, 0.17, 0.18, 0.17);
      ball(
        head,
        "#d59a40",
        0,
        -0.04,
        0.19,
        duck ? 0.145 : 0.085,
        duck ? 0.035 : 0.06,
        0.13,
      );
      eyes(0.1, 0.025, 0.14);
      if (!duck) {
        for (let i = 0; i < 3; i++)
          ball(
            head,
            "#b65442",
            0,
            0.17 + i * 0.025,
            -0.07 + i * 0.075,
            0.055,
            0.09,
            0.07,
          );
        ball(head, "#b65442", 0, -0.16, 0.09, 0.06, 0.075, 0.06);
      }
      tail.position.set(0, 0.4, duck ? -0.33 : -0.24);
      ball(tail, color, 0, 0.07, -0.035, 0.13, 0.13, 0.17);
    }
    // Batch rigid surfaces by material; keep head/legs/tail articulated for gait and grazing.
    const batch = (part: T.Group, excluded: T.Group[] = []) => {
      root.updateMatrixWorld(true);
      const inv = part.matrixWorld.clone().invert(),
        meshes: T.Mesh[] = [];
      part.traverse((o) => {
        if (o instanceof T.Mesh) {
          let p: T.Object3D | null = o;
          while (p && p !== part) {
            if (excluded.includes(p as T.Group)) return;
            p = p.parent;
          }
          meshes.push(o);
        }
      });
      const sets = new Map<T.Material, T.BufferGeometry[]>();
      for (const mesh of meshes) {
        const geo = mesh.geometry.clone();
        geo.applyMatrix4(
          new T.Matrix4().multiplyMatrices(inv, mesh.matrixWorld),
        );
        const m = mesh.material as T.Material;
        sets.set(m, [...(sets.get(m) || []), geo]);
      }
      for (const [m, geos] of sets) {
        const geo = mergeGeometries(geos);
        if (geo) {
          const mesh = new T.Mesh(geo, m);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          part.add(mesh);
        }
        geos.forEach((g) => g.dispose());
      }
      meshes.forEach((m) => {
        m.removeFromParent();
        m.geometry.dispose();
      });
    };
    batch(body, [head, tail, ...legs]);
    [head, tail, ...legs].forEach((p) => batch(p));
    const shadow = new T.Mesh(
      new T.CircleGeometry(1, 20),
      new T.MeshBasicMaterial({
        color: "#445138",
        opacity: 0.14,
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(
      def.kind === "cow" ? 0.65 : def.kind === "sheep" ? 0.5 : 0.26,
      def.kind === "cow" ? 1 : def.kind === "sheep" ? 0.7 : 0.4,
      1,
    );
    shadow.position.y = 0.015;
    root.add(shadow);
    const meal = new T.Group();
    root.add(meal);
    meal.position.set(
      0,
      0.045,
      def.kind === "cow" ? 1.25 : def.kind === "sheep" ? 0.95 : 0.65,
    );
    const bowl = new T.Mesh(
      new T.TorusGeometry(def.kind === "cow" ? 0.23 : 0.15, 0.035, 6, 16),
      mat("#b18c52"),
    );
    bowl.rotation.x = -Math.PI / 2;
    meal.add(bowl);
    for (let i = 0; i < 7; i++)
      ball(
        meal,
        def.kind === "cat" ? "#8b5c3c" : "#d0ae53",
        Math.sin(i * 2.4) * 0.1,
        0.03,
        Math.cos(i * 2.4) * 0.1,
        0.04,
        0.035,
        0.045,
      );
    meal.visible = false;
    return {
      def,
      root,
      body,
      head,
      tail,
      legs,
      meal,
      headHeight: head.position.y,
    };
  });
  sphere.dispose();
  return {
    group,
    models,
    update(now: number, feeds: FarmFeeds) {
      for (const a of models) {
        const state = animalAt(a.def, now, feeds[a.def.id]);
        a.root.position.set(state.x, 0.665, state.z);
        a.root.rotation.y = state.heading;
        const gait = now * 0.009 + a.def.phase;
        a.body.position.y = state.walking
          ? Math.abs(Math.sin(gait)) * 0.025
          : 0;
        a.legs.forEach(
          (leg, i) =>
            (leg.rotation.x = state.walking
              ? Math.sin(gait + (i % 2) * Math.PI) * 0.45
              : 0),
        );
        a.head.position.y = T.MathUtils.lerp(
          a.head.position.y,
          a.headHeight -
            (state.eating ? (a.def.kind === "cow" ? 0.4 : 0.16) : 0),
          0.16,
        );
        a.head.rotation.x = T.MathUtils.lerp(
          a.head.rotation.x,
          state.eating ? 0.85 : 0,
          0.16,
        );
        a.head.rotation.z = state.eating
          ? Math.sin(now * 0.018) * 0.04
          : Math.sin(now * 0.002 + a.def.phase) * 0.035;
        a.tail.rotation.z = Math.sin(now * 0.004 + a.def.phase) * 0.18;
        a.meal.visible = state.feeding;
        a.root.userData.activity = state.feeding
          ? "fed"
          : state.eating
            ? "eating"
            : "walking";
      }
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.geometry.dispose();
          if (o.material instanceof T.MeshBasicMaterial) o.material.dispose();
        }
      });
      materials.forEach((m) => m.dispose());
    },
  };
}
