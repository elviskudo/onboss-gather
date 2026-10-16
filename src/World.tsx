import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  createCozyTextures,
  projectSurfaceUV,
  type Surface,
} from "./cozyMaterials";
import { walkable, SPACES, TREES, LAMPS } from "../shared/spaces";
import { createHuman, animateHuman } from "./avatar";
import { useEffect, useRef } from "react";
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Person } from "./types";
export type WorldHandle = {
  go: (x: number, z: number) => void;
  zoom: (n: number) => void;
  rotate: () => void;
  home: () => void;
};
type Props = {
  people: Person[];
  self: Person;
  quality: string;
  onMove: (x: number, z: number) => void;
  onPerson: (id: string) => void;
  onEnter: (area: string) => void;
  onReady: () => void;
  onError: () => void;
  handle: React.RefObject<WorldHandle | null>;
};

export function World({
  people,
  self,
  quality,
  onMove,
  onPerson,
  onEnter,
  onReady,
  onError,
  handle,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const live = useRef({ people, self, onMove, onPerson, onEnter });
  live.current = { people, self, onMove, onPerson, onEnter };
  useEffect(() => {
    const el = container.current!;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({
        antialias: quality === "high",
        alpha: false,
        powerPreference: quality === "low" ? "low-power" : "high-performance",
      });
    } catch {
      onError();
      return;
    }
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, quality === "high" ? 2 : 1),
    );
    renderer.shadowMap.enabled = quality === "high";
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.setClearColor("#c8e2df");
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D Hallstatt village. Use WASD or arrow keys to walk.",
    );
    renderer.domElement.tabIndex = 0;
    const textures = createCozyTextures();
    const materials = new Map<string, T.MeshStandardMaterial>();
    const mat = (
      color: string,
      extra: Partial<T.MeshStandardMaterialParameters> = {},
    ) => {
      const key = color + JSON.stringify(extra);
      let m = materials.get(key);
      if (!m) {
        const surface: Surface | undefined =
          color === "#9cb875"
            ? "grass"
            : ["#d7c9ac", "#c3b599", "#b9b7a3", "#c7c3ab"].includes(color)
              ? "stone"
              : [
                    "#9a6455",
                    "#64594f",
                    "#89736a",
                    "#6d7775",
                    "#82604d",
                    "#6e7161",
                    "#77635c",
                    "#8a6856",
                    "#8d6b58",
                    "#815e4d",
                  ].includes(color)
                ? "roof"
                : [
                      "#eddfc4",
                      "#d6b19a",
                      "#e8c58d",
                      "#f3e8d5",
                      "#d8a084",
                      "#d8d1b3",
                      "#e1caae",
                      "#d9b57e",
                      "#ede0c7",
                      "#e5d4b2",
                      "#eee3ce",
                    ].includes(color)
                  ? "plaster"
                  : [
                        "#b5986c",
                        "#a88969",
                        "#806c55",
                        "#c6ac7d",
                        "#75664e",
                        "#ab895f",
                        "#dcc49c",
                        "#b4a185",
                        "#d8ccb4",
                      ].includes(color)
                    ? "wood"
                    : undefined;
        m = new T.MeshStandardMaterial({
          color,
          roughness: surface === "roof" ? 0.78 : 0.88,
          map: surface ? textures.get(surface) : null,
          ...extra,
        });
        materials.set(key, m);
      }
      return m;
    };
    const scene = new T.Scene();
    scene.fog = new T.Fog("#c8e2df", 110, 240);
    const camera = new T.PerspectiveCamera(36, 1, 0.1, 350);
    let angle = -0.45,
      zoom = 24;
    const center = new T.Vector3(self.x, 0, self.z);
    const desiredCenter = new T.Vector3(self.x, 0, self.z);
    const ambient = new T.HemisphereLight("#d5edff", "#819a52", 1.65);
    scene.add(ambient);
    const sun = new T.DirectionalLight("#fff1d3", 2.7);
    sun.position.set(-35, 65, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -65,
      right: 65,
      top: 65,
      bottom: -65,
    });
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    const obstacles: { x: number; z: number; w: number; d: number }[] = [];
    function mesh(
      geo: T.BufferGeometry,
      material: T.Material,
      x: number,
      y: number,
      z: number,
      parent: T.Object3D = scene,
    ) {
      projectSurfaceUV(geo, 0.28);
      const o = new T.Mesh(geo, material);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    }
    const box = (
      w: number,
      h: number,
      d: number,
      c: string,
      x: number,
      y: number,
      z: number,
      p: T.Object3D = scene,
    ) =>
      mesh(
        Math.min(w, h, d) > 0.4
          ? new RoundedBoxGeometry(w, h, d, 2, 0.12)
          : new T.BoxGeometry(w, h, d),
        mat(c),
        x,
        y,
        z,
        p,
      );
    const cylinder = (
      rt: number,
      rb: number,
      h: number,
      c: string,
      x: number,
      y: number,
      z: number,
      n = 8,
      p: T.Object3D = scene,
    ) =>
      mesh(
        new T.CylinderGeometry(rt, rb, h, Math.max(n, 24)),
        mat(c),
        x,
        y,
        z,
        p,
      );
    // A handmade village: all meshes and materials are original, no external model licenses.
    const water = mesh(
      new T.PlaneGeometry(380, 380, 50, 50),
      mat("#7aaeb2", { metalness: 0.2, roughness: 0.35 }),
      0,
      -0.42,
      0,
    );
    water.rotation.x = -Math.PI / 2;
    const land = new T.Shape();
    land.moveTo(-31, -25);
    land.bezierCurveTo(-42, -5, -32, 26, -18, 29);
    land.bezierCurveTo(-3, 32, 19, 28, 25, 17);
    land.bezierCurveTo(29, 8, 27, -7, 20, -22);
    land.bezierCurveTo(5, -31, -17, -31, -31, -25);
    const landgeo = new T.ExtrudeGeometry(land, {
      depth: 2.2,
      bevelEnabled: true,
      bevelSize: 0.8,
      bevelThickness: 0.6,
      bevelSegments: 5,
      steps: 1,
    });
    const island = mesh(landgeo, mat("#9cb875"), 0, -2.3, 0);
    island.rotation.x = -Math.PI / 2;
    // Walkways, waterfront, planting beds.
    box(8, 0.13, 51, "#d7c9ac", 1, 0.52, 0);
    box(45, 0.14, 6, "#d7c9ac", -2, 0.54, 6);
    box(31, 0.16, 4, "#d7c9ac", -2, 0.55, -11);
    box(4, 0.15, 23, "#d7c9ac", -15, 0.54, 9);
    box(3, 0.18, 36, "#c3b599", 23, 0.57, -1);
    box(4.2, 0.3, 12, "#a88969", 29, 0.1, 8);
    for (let i = 0; i < 18; i++)
      box(4.3, 0.05, 0.09, "#806c55", 29, 0.28, 2.5 + i * 0.67);
    for (let i = 0; i < 9; i++) {
      box(0.14, 0.6, 0.14, "#ddd4ba", 25, 0.9, -16 + i * 4);
      if (i < 8) box(0.1, 0.1, 3.9, "#ede2cb", 25, 1.12, -14 + i * 4);
    }
    function roof(
      w: number,
      d: number,
      h: number,
      color: string,
      x: number,
      y: number,
      z: number,
      p: T.Object3D,
    ) {
      const g = new T.BufferGeometry();
      const a = [
        -w / 2,
        0,
        -d / 2,
        w / 2,
        0,
        -d / 2,
        0,
        h,
        -d / 2,
        -w / 2,
        0,
        d / 2,
        0,
        h,
        d / 2,
        w / 2,
        0,
        d / 2,
        -w / 2,
        0,
        -d / 2,
        0,
        h,
        -d / 2,
        0,
        h,
        d / 2,
        -w / 2,
        0,
        -d / 2,
        0,
        h,
        d / 2,
        -w / 2,
        0,
        d / 2,
        w / 2,
        0,
        -d / 2,
        w / 2,
        0,
        d / 2,
        0,
        h,
        d / 2,
        w / 2,
        0,
        -d / 2,
        0,
        h,
        d / 2,
        0,
        h,
        -d / 2,
      ];
      g.setAttribute("position", new T.Float32BufferAttribute(a, 3));
      g.computeVertexNormals();
      return mesh(g, mat(color, { side: T.DoubleSide }), x, y, z, p);
    }
    function house(
      x: number,
      z: number,
      w: number,
      d: number,
      h: number,
      color: string,
      roofcolor: string,
      rotation = 0,
    ) {
      const g = new T.Group();
      g.position.set(x, 0.6, z);
      g.rotation.y = rotation;
      scene.add(g);
      box(w, h, d, color, 0, h / 2, 0, g);
      box(w + 0.12, 0.18, d + 0.12, "#d9c9ac", 0, 0.15, 0, g);
      roof(w + 0.9, d + 0.8, 2.2, roofcolor, 0, h, 0, g);
      box(0.55, 1.6, 0.55, "#d9c9ac", w / 3, h + 1, 0, g);
      box(1, 1.8, 0.12, "#6c5a45", 0, 0.9, d / 2 + 0.02, g);
      box(0.1, 0.1, 0.15, "#e2c77d", 0.3, 0.95, d / 2 + 0.12, g);
      for (let floor = 0; floor < Math.floor(h / 2); floor++)
        for (let side = 0; side < 2; side++) {
          const wx = (side === 0 ? -1 : 1) * w * 0.29;
          const wy = 1.45 + floor * 2;
          box(0.95, 1.05, 0.15, "#f0debd", wx, wy, d / 2 + 0.03, g);
          box(0.65, 0.79, 0.17, "#688a89", wx, wy, d / 2 + 0.12, g);
          box(0.055, 0.8, 0.2, "#ebe1c9", wx, wy, d / 2 + 0.2, g);
          box(0.7, 0.055, 0.2, "#ebe1c9", wx, wy, d / 2 + 0.2, g);
          box(1.2, 0.3, 0.4, "#77624b", wx, wy - 0.65, d / 2 + 0.2, g);
          for (let f = 0; f < 4; f++)
            cylinder(
              0.13,
              0.1,
              0.19,
              f % 2 ? "#d8887e" : "#e6c4ac",
              wx - 0.4 + f * 0.26,
              wy - 0.39,
              d / 2 + 0.22,
              5,
              g,
            );
        }
      if (h > 4) {
        box(w + 0.35, 0.14, 1, "#7e6651", 0, 2.8, d / 2 + 0.5, g);
        box(w + 0.35, 0.09, 0.1, "#90775e", 0, 3.5, d / 2 + 0.95, g);
        for (let i = 0; i < 9; i++)
          box(
            0.06,
            0.6,
            0.06,
            "#90775e",
            -w / 2 + (i * w) / 8,
            3.2,
            d / 2 + 0.95,
            g,
          );
      }
      obstacles.push({
        x,
        z,
        w: (rotation ? d : w) / 2 + 0.5,
        d: (rotation ? w : d) / 2 + 0.5,
      });
      return g;
    }
    house(-8, -3, 5, 5, 5, "#eddfc4", "#9a6455");
    house(-16, -3, 5, 5, 6, "#d6b19a", "#64594f");
    house(-24, -3, 5, 5, 4, "#e8c58d", "#89736a");
    house(-8, -18, 5, 5, 5.7, "#f3e8d5", "#6d7775");
    house(-16, -18, 5, 6, 4.8, "#d8a084", "#82604d");
    house(-24, -16, 4, 5, 5, "#d8d1b3", "#6e7161");
    house(11, -17, 6, 5, 5, "#e1caae", "#77635c");
    house(18, -17, 4.5, 5, 4.2, "#d9b57e", "#8a6856");
    house(12, -4, 6, 5, 4, "#ede0c7", "#8d6b58", Math.PI);
    house(-24, 12, 4, 4.5, 4, "#e5d4b2", "#815e4d");
    // Original lakeside mosque: smooth dome, arched openings, minaret and crescents.
    const mosque = new T.Group();
    mosque.name = "Lakeside mosque";
    mosque.position.set(12, 0.6, 17);
    scene.add(mosque);
    box(6.4, 4.4, 7, "#eee3ce", 0, 2.2, 0, mosque);
    box(6.8, 0.25, 7.4, "#d3c4a3", 0, 0.16, 0, mosque);
    box(6.8, 0.3, 7.4, "#e6d8bb", 0, 4.45, 0, mosque);
    cylinder(2.65, 2.7, 0.38, "#d8c8a3", 0, 4.8, 0, 16, mosque);
    mesh(
      new T.SphereGeometry(2.55, 48, 32, 0, Math.PI * 2, 0, Math.PI / 2),
      mat("#628777", { flatShading: false }),
      0,
      4.95,
      0,
      mosque,
    );
    function crescent(x: number, y: number, z: number, r: number) {
      const outline = new T.Shape();
      outline.absarc(0, 0, r, Math.PI / 3, (Math.PI * 5) / 3, false);
      outline.absarc(
        r / 2,
        0,
        r * Math.sqrt(0.75),
        -Math.PI / 2,
        Math.PI / 2,
        true,
      );
      outline.closePath();
      const symbol = mesh(
        new T.ExtrudeGeometry(outline, {
          depth: 0.07,
          bevelEnabled: false,
          curveSegments: 10,
        }),
        mat("#c6a665", { side: T.DoubleSide }),
        x,
        y,
        z,
        mosque,
      );
      symbol.rotation.y = 0.72;
    }
    cylinder(0.055, 0.075, 0.65, "#c6a665", 0, 7.78, 0, 8, mosque);
    crescent(0, 8.38, 0, 0.42);
    function archedOpening(
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      rotation = 0,
    ) {
      const arch = new T.Shape();
      arch.moveTo(-w / 2, 0);
      arch.lineTo(w / 2, 0);
      arch.lineTo(w / 2, h - w / 2);
      arch.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
      arch.closePath();
      const opening = mesh(
        new T.ShapeGeometry(arch, 8),
        mat("#50776b", { side: T.DoubleSide }),
        x,
        y,
        z,
        mosque,
      );
      opening.rotation.y = rotation;
    }
    archedOpening(0, 0.2, 3.52, 1.65, 3.1);
    for (const x of [-2.2, 2.2]) archedOpening(x, 1.45, 3.53, 0.8, 1.85);
    for (const z of [-1.9, 1.9])
      archedOpening(3.22, 1.4, z, 0.9, 1.9, Math.PI / 2);
    box(2.4, 0.22, 1.25, "#d8c8aa", 0, 0.1, 3.85, mosque);
    box(2.8, 0.12, 1.55, "#e3d5b8", 0, 0.02, 4.05, mosque);
    const tx = -4.25,
      tz = -1.5;
    cylinder(1.05, 1.15, 0.55, "#d3c5a5", tx, 0.28, tz, 12, mosque);
    cylinder(0.65, 0.8, 7.3, "#ece2cb", tx, 4.05, tz, 12, mosque);
    cylinder(1.15, 0.8, 0.35, "#d3c5a5", tx, 7.82, tz, 12, mosque);
    cylinder(0.46, 0.53, 2.4, "#eee3ce", tx, 9.0, tz, 12, mosque);
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5;
      cylinder(
        0.045,
        0.045,
        0.6,
        "#d4c6a5",
        tx + Math.cos(a) * 1.02,
        8.28,
        tz + Math.sin(a) * 1.02,
        6,
        mosque,
      );
    }
    const railing = mesh(
      new T.TorusGeometry(1.02, 0.055, 5, 16),
      mat("#d3c5a5"),
      tx,
      8.58,
      tz,
      mosque,
    );
    railing.rotation.x = Math.PI / 2;
    mesh(
      new T.SphereGeometry(0.76, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2),
      mat("#628777", { flatShading: false }),
      tx,
      10.25,
      tz,
      mosque,
    );
    cylinder(0.04, 0.055, 0.6, "#c6a665", tx, 11.25, tz, 6, mosque);
    crescent(tx, 11.83, tz, 0.28);
    obstacles.push(
      { x: 12, z: 17, w: 3.6, d: 4.5 },
      { x: 12 + tx, z: 17 + tz, w: 1.3, d: 1.3 },
    );
    function tree(x: number, z: number, s = 1, pine = true) {
      cylinder(0.13 * s, 0.22 * s, 1.7 * s, "#806e52", x, 1.2 * s, z);
      // Dense smooth orchard crowns, with a single shared visual language.
      cylinder(0.16 * s, 0.23 * s, 2.5 * s, "#79563e", x, 1.7 * s, z, 24);
      for (let i = 0; i < 6; i++) {
        const a = i * 2.399,
          r = i === 0 ? 0 : 1 * s;
        const crown = mesh(
          new T.SphereGeometry(
            1,
            quality === "low" ? 16 : 24,
            quality === "low" ? 12 : 18,
          ),
          mat(["#87a45f", "#93b96b", "#a3be7a"][i % 3]),
          x + Math.cos(a) * r,
          (3.1 + (i % 3) * 0.5) * s,
          z + Math.sin(a) * r,
        );
        crown.scale.set(1.25 * s, 1.45 * s, 1.15 * s);
      }
      if (!pine)
        for (let i = 0; i < 7; i++) {
          const a = i * 2.399;
          mesh(
            new T.SphereGeometry(0.15 * s, 16, 12),
            mat("#e7a351"),
            x + Math.cos(a) * 1.45 * s,
            (3.1 + (i % 2) * 0.7) * s,
            z + Math.sin(a) * 1.45 * s,
          );
        }
    }
    TREES.forEach(([x, z], i) => tree(x, z, 0.8 + (i % 4) * 0.16, i % 3 !== 0));
    // Fountain at the village square.
    cylinder(2, 2.1, 0.45, "#b9b7a3", 0, 0.8, 5, 12);
    cylinder(1.65, 1.65, 0.08, "#84b3ad", 0, 1.06, 5, 24);
    cylinder(0.35, 0.5, 1.4, "#c7c3ab", 0, 1.5, 5);
    cylinder(0.85, 0.45, 0.24, "#d8cfb7", 0, 2.2, 5, 12);
    cylinder(0.06, 0.1, 0.65, "#9bc4b9", 0, 2.6, 5);
    obstacles.push({ x: 0, z: 5, w: 2.1, d: 2.1 });
    function bench(x: number, z: number, rot = 0) {
      const g = new T.Group();
      g.position.set(x, 0.6, z);
      g.rotation.y = rot;
      scene.add(g);
      for (let i = 0; i < 3; i++)
        box(2.6, 0.12, 0.2, "#b5986c", 0, 0.65, -0.25 + i * 0.25, g);
      box(2.6, 0.6, 0.15, "#b5986c", 0, 1.15, -0.5, g);
      for (const x of [-0.9, 0.9]) box(0.15, 0.7, 0.7, "#617060", x, 0.3, 0, g);
    }
    bench(19, 6, Math.PI / 2);
    bench(19, 0, Math.PI / 2);
    bench(-10, 14);
    bench(-19, 17, Math.PI / 2);
    bench(5, 10, Math.PI / 2);
    for (const [x, z] of LAMPS) {
      cylinder(0.08, 0.12, 3.6, "#5b6a59", x, 2.3, z);
      box(0.5, 0.7, 0.5, "#f9e7b5", x, 4.1, z);
      cylinder(0, 0.5, 0.4, "#5b6a59", x, 4.65, z, 4);
    }
    // Café terrace, parasols, and garden.
    for (const [x, z] of [
      [8, -8],
      [13, -8],
      [-10, 18],
    ]) {
      cylinder(1, 1, 0.15, "#c6ac7d", x, 1.4, z, 16);
      cylinder(0.1, 0.15, 0.9, "#75664e", x, 1, z);
      cylinder(0, 2, 0.65, "#e4d6b0", x, 3.2, z, 8);
      cylinder(0.05, 0.05, 2, "#9d8d6b", x, 2.2, z);
      for (const dx of [-1.5, 1.5]) {
        box(0.6, 0.12, 0.7, "#a4916d", x + dx, 1, z);
        box(0.6, 0.8, 0.12, "#a4916d", x + dx, 1.3, z - 0.4);
      }
    }
    for (let i = 0; i < 6; i++) {
      box(0.7, 0.3, 2.8, "#c5b597", -20 + i * 1.6, 0.85, 21);
      for (let j = 0; j < 5; j++)
        mesh(
          new T.SphereGeometry(0.22, 16, 12),
          mat(i % 2 ? "#d1a688" : "#c3afc2"),
          -20 + i * 1.6,
          1.1,
          20 + j * 0.5,
        );
    }
    // Vegetable beds and cottage garden: original procedural props.
    for (let row = 0; row < 4; row++) {
      box(5, 0.18, 1.1, "#886344", -16, 0.7, 16 + row * 1.45);
      for (let col = 0; col < 7; col++) {
        const x = -18.2 + col * 0.72,
          z = 16 + row * 1.45;
        for (let leaf = 0; leaf < 4; leaf++) {
          const a = (leaf * Math.PI) / 2;
          const crop = mesh(
            new T.SphereGeometry(1, 12, 10),
            mat(row % 2 ? "#6f9848" : "#91ae51"),
            x + Math.cos(a) * 0.13,
            0.99,
            z + Math.sin(a) * 0.13,
          );
          crop.scale.set(0.2, 0.15, 0.28);
          crop.rotation.y = -a;
        }
        if (row % 2 === 0)
          mesh(new T.SphereGeometry(0.11, 12, 10), mat("#e5b66a"), x, 1.1, z);
      }
    }
    for (let i = 0; i < 35; i++) {
      const x = -23 + (i % 7) * 0.55,
        z = 17 + Math.floor(i / 7) * 0.65;
      cylinder(0.025, 0.03, 0.55, "#5b8741", x, 0.92, z, 12);
      for (let p = 0; p < 5; p++) {
        const a = (p * Math.PI * 2) / 5;
        const petal = mesh(
          new T.SphereGeometry(0.11, 12, 8),
          mat(i % 3 === 0 ? "#e6ac91" : i % 3 === 1 ? "#f1df9d" : "#d8c2df"),
          x + Math.cos(a) * 0.1,
          1.21,
          z + Math.sin(a) * 0.1,
        );
        petal.scale.y = 0.45;
      }
      mesh(new T.SphereGeometry(0.055, 12, 8), mat("#d7ac49"), x, 1.25, z);
    }
    for (let i = 0; i < 19; i++) {
      const x = -24 + i * 0.73;
      box(0.18, 1, 0.15, "#f3e5c8", x, 1.15, 23.2);
      mesh(
        new T.ConeGeometry(0.13, 0.2, 4),
        mat("#f3e5c8"),
        x,
        1.74,
        23.2,
      ).rotation.y = Math.PI / 4;
    }
    for (const y of [1, 1.5]) box(13.5, 0.12, 0.12, "#dfd0ab", -17.5, y, 23.2);
    const boat = new T.Group();
    boat.position.set(36, 0, 3);
    boat.rotation.y = -0.5;
    scene.add(boat);
    const hull = mesh(
      new T.SphereGeometry(1, 24, 16),
      mat("#ad7853"),
      0,
      0,
      0,
      boat,
    );
    hull.scale.set(1, 0.35, 2.5);
    box(1.6, 0.12, 0.5, "#ead9ae", 0, 0.25, 0, boat);
    box(0.08, 2.6, 0.08, "#8e8267", 0, 1.3, 0, boat);
    const sail = mesh(
      new T.ConeGeometry(1.4, 2.5, 32),
      mat("#f0e2bc", { side: T.DoubleSide }),
      0.7,
      1.7,
      0,
      boat,
    );
    sail.scale.z = 0.02;
    // Soft, rolling hills frame the farming village.
    for (let i = 0; i < 12; i++) {
      const h = 21 + (i % 4) * 7;
      const hill = mesh(
        new T.SphereGeometry(1, 32, 24),
        mat(i % 2 ? "#81a38a" : "#96b59b"),
        -130 + i * 24,
        -2,
        -70 - (i % 3) * 18,
      );
      hill.scale.set(30, h, 25);
    }
    // Subtle water glints, no per-frame geometry allocations.
    const glints: T.Mesh[] = [];
    for (let i = 0; i < 80; i++) {
      const x = 34 + (i % 10) * 7,
        z = -45 + Math.floor(i / 10) * 12;
      const g = box(1.2 + (i % 3), 0.015, 0.12, "#b4ceca", x, -0.37, z);
      glints.push(g);
    }
    // A flowing river with one walkable timber bridge.
    box(2.5, 0.08, 23, "#629fa8", 2, 0.58, -15.5);
    for (const x of [0.55, 3.45]) box(0.3, 0.22, 23, "#bcba9d", x, 0.62, -15.5);
    box(4.5, 0.3, 3.8, "#b8996e", 2, 0.7, -10);
    for (const z of [-11.8, -8.2]) {
      box(4.7, 0.12, 0.12, "#846d50", 2, 1.65, z);
      for (const x of [0, 2, 4]) box(0.1, 1, 0.1, "#846d50", x, 1.18, z);
    }
    // Open kitchen, island counter, hob and sink beside the garden.
    box(6, 1.3, 1.6, "#d8ccb4", -13.5, 1.25, 11);
    box(6.2, 0.16, 1.8, "#586e66", -13.5, 1.97, 11);
    box(1.2, 0.06, 1, "#b8cdcd", -15, 2.08, 11);
    for (const x of [-12.6, -11.8])
      cylinder(0.23, 0.23, 0.05, "#343f3c", x, 2.09, 11, 16);
    cylinder(0.06, 0.06, 0.7, "#b9c4c0", -15.4, 2.35, 11);
    box(0.6, 0.08, 0.08, "#b9c4c0", -15.15, 2.67, 11);
    for (const x of [-16.3, -10.7])
      cylinder(0.08, 0.08, 3.2, "#988165", x, 2.2, 11);
    box(6.6, 0.16, 2.5, "#e3dac3", -13.5, 3.85, 11);
    const jets = new T.Group();
    scene.add(jets);
    const dropGeo = new T.SphereGeometry(0.055, 6, 5),
      dropMat = mat("#b5e4e5", { roughness: 0.12, metalness: 0.15 });
    const jetMesh = new T.InstancedMesh(dropGeo, dropMat, 72);
    jets.add(jetMesh);
    const dropMatrix = new T.Matrix4();
    // Batch static geometry by shared material: a few dozen draw calls instead of thousands.
    function batchStatic(root: T.Object3D) {
      scene.updateMatrixWorld(true);
      const batches = new Map<
        T.Material,
        { geometry: T.BufferGeometry[]; originals: T.Mesh[] }
      >();
      root.traverse((o) => {
        if (
          !(o instanceof T.Mesh) ||
          o === water ||
          o.parent === boat ||
          o.parent === jets
        )
          return;
        const material = o.material as T.Material;
        let batch = batches.get(material);
        if (!batch) {
          batch = { geometry: [], originals: [] };
          batches.set(material, batch);
        }
        const geo = o.geometry.index
          ? o.geometry.toNonIndexed()
          : o.geometry.clone();
        for (const key of Object.keys(geo.attributes))
          if (!["position", "normal", "uv"].includes(key))
            geo.deleteAttribute(key);
        geo.applyMatrix4(o.matrixWorld);
        batch.geometry.push(geo);
        batch.originals.push(o);
      });
      for (const [material, batch] of batches) {
        const geo = mergeGeometries(batch.geometry);
        if (geo) {
          const merged = new T.Mesh(geo, material);
          merged.castShadow = true;
          merged.receiveShadow = true;
          root.add(merged);
          for (const o of batch.originals) {
            o.removeFromParent();
            o.geometry.dispose();
          }
        }
        for (const g of batch.geometry) g.dispose();
      }
    }
    batchStatic(scene);
    const exterior = scene.children.filter((o) => !(o instanceof T.Light));
    const doors: T.Mesh[] = [];
    for (const sp of SPACES) {
      const door = box(1.5, 2.5, 0.22, "#679e86", sp.x, 1.85, sp.z);
      door.userData.area = sp.id;
      doors.push(door);
      exterior.push(door);
    }
    const interior = new T.Group();
    scene.add(interior);
    box(20, 0.6, 17, "#c9b997", 0, 0.25, 0, interior);
    for (const x of [-10, 10]) box(0.3, 3, 17, "#e9e3d5", x, 2, -0, interior);
    box(20, 3, 0.3, "#e9e3d5", 0, 2, -8.5, interior);
    // Cutaway front and roof keep the room readable from the follow camera.
    box(20, 0.4, 0.3, "#9aaa8d", 0, 0.8, 8.5, interior);
    box(6, 1.1, 2.7, "#ab895f", 0, 1.15, 0, interior);
    box(6.2, 0.15, 2.9, "#dcc49c", 0, 1.8, 0, interior);
    for (const x of [-2, 0, 2])
      for (const z of [-2.2, 2.2]) {
        box(0.8, 0.15, 0.8, "#647e73", x, 1.05, z, interior);
        box(
          0.8,
          0.8,
          0.12,
          "#647e73",
          x,
          1.4,
          z + (z < 0 ? -0.4 : 0.4),
          interior,
        );
      }
    for (const x of [-7, 7]) {
      box(2, 1, 4, "#b4a185", x, 1.1, -4, interior);
      box(1.4, 0.85, 0.15, "#3e5b57", x, 2.05, -4, interior);
      box(1, 0.03, 0.4, "#e0ddd0", x, 1.66, -3.5, interior);
    }
    box(5, 2.1, 0.12, "#f8f5e9", 0, 2.4, -8.25, interior);
    for (const x of [-7, 7]) {
      cylinder(0.6, 0.45, 0.7, "#bba68a", x, 0.9, 5, 14, interior);
      mesh(
        new T.SphereGeometry(0.85, 12, 8),
        mat("#6a956f"),
        x,
        1.8,
        5,
        interior,
      );
    }
    batchStatic(interior);
    interior.visible = false;
    const avatarMap = new Map<string, T.Group>();
    function avatar(p: Person) {
      const g = createHuman(p, mat, quality === "low");
      const ring = mesh(
        new T.RingGeometry(0.6, 0.69, 32),
        new T.MeshBasicMaterial({
          color: p.id === live.current.self.id ? "#f8e2a0" : "#e9eee0",
          side: T.DoubleSide,
          transparent: true,
          opacity: 0.8,
        }),
        0,
        0.65,
        0,
        g,
      );
      ring.rotation.x = -Math.PI / 2;
      const label = document.createElement("button");
      label.className = "world-person-label";
      label.textContent =
        p.name + (p.id === live.current.self.id ? " · kamu" : "");
      label.setAttribute("aria-label", "Buka profil " + p.name);
      label.addEventListener("pointerdown", (e) => e.stopPropagation());
      label.addEventListener("pointerup", (e) => e.stopPropagation());
      label.addEventListener("click", (e) => {
        e.stopPropagation();
        live.current.onPerson(p.id);
      });
      el.appendChild(label);
      g.userData.label = label;
      scene.add(g);
      g.position.set(p.x, 0, p.z);
      return g;
    }
    let px = live.current.self.x,
      pz = live.current.self.z;
    let target: T.Vector2 | null = null;
    let lastSent = 0,
      lastFrame = performance.now(),
      raf = 0,
      lastRender = 0,
      lastAngle = 0,
      lastZoom = 0;
    const keys = new Set<string>();
    const pointer = { x: 0, y: 0, down: false, moved: false };
    const ray = new T.Raycaster(),
      ground = new T.Plane(new T.Vector3(0, 1, 0), -0.6);
    const destination = new T.Vector3();
    function valid(x: number, z: number) {
      return walkable(x, z, live.current.self.area);
    }
    const down = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
      )
        e.preventDefault();
      keys.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const blur = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    const pd = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.down = true;
      pointer.moved = false;
    };
    const pm = (e: PointerEvent) => {
      if (
        pointer.down &&
        Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 8
      ) {
        pointer.moved = true;
        angle -= (e.clientX - pointer.x) * 0.004;
        pointer.x = e.clientX;
        pointer.y = e.clientY;
      }
    };
    const pu = (e: PointerEvent) => {
      if (pointer.down && !pointer.moved) {
        const r = el.getBoundingClientRect();
        ray.setFromCamera(
          new T.Vector2(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            (-(e.clientY - r.top) / r.height) * 2 + 1,
          ),
          camera,
        );
        const hit = ray.intersectObjects([...avatarMap.values()], true)[0];
        if (hit) {
          let o: T.Object3D | null = hit.object;
          while (o && !o.userData.personId) o = o.parent;
          if (o) {
            live.current.onPerson(o.userData.personId);
            pointer.down = false;
            return;
          }
        }
        const doorway = ray.intersectObjects(doors, true)[0];
        if (doorway) {
          live.current.onEnter(doorway.object.userData.area);
          pointer.down = false;
          return;
        }
        if (
          ray.ray.intersectPlane(ground, destination) &&
          valid(destination.x, destination.z)
        )
          target = new T.Vector2(destination.x, destination.z);
      }
      pointer.down = false;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = T.MathUtils.clamp(zoom + e.deltaY * 0.03, 13, 100);
    };
    el.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    el.addEventListener("wheel", wheel, { passive: false });
    handle.current = {
      go(x, z) {
        px = x;
        pz = z;
        target = null;
        desiredCenter.set(x, 0, z);
        live.current.onMove(px, pz);
      },
      zoom(n) {
        zoom = T.MathUtils.clamp(zoom + n, 13, 100);
      },
      rotate() {
        angle += Math.PI / 4;
      },
      home() {
        angle = -0.45;
        zoom = 24;
        desiredCenter.set(px, 0, pz);
      },
    };
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(el);
    function frame(now: number) {
      if (document.hidden) {
        lastFrame = now;
        raf = requestAnimationFrame(frame);
        return;
      }
      const outdoors = (live.current.self.area || "village") === "village";
      for (const o of exterior) o.visible = outdoors;
      interior.visible = !outdoors;
      if (outdoors) {
        for (let i = 0; i < 72; i++) {
          const t = (now * 0.0004 + i / 72) % 1,
            a = i * 2.399,
            radius = t * 1.55;
          dropMatrix.makeTranslation(
            Math.cos(a) * radius,
            2.8 + 3 * t - 4.7 * t * t,
            5 + Math.sin(a) * radius,
          );
          jetMesh.setMatrixAt(i, dropMatrix);
        }
        jetMesh.instanceMatrix.needsUpdate = true;
      }
      let dirty = outdoors;
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;
      let dx =
        Number(keys.has("d") || keys.has("arrowright")) -
        Number(keys.has("a") || keys.has("arrowleft"));
      let dz =
        Number(keys.has("s") || keys.has("arrowdown")) -
        Number(keys.has("w") || keys.has("arrowup"));
      if (dx || dz) {
        target = null;
        const len = Math.hypot(dx, dz);
        dx /= len;
        dz /= len;
        const a = angle + 0.45;
        const tx = dx * Math.cos(a) + dz * Math.sin(a);
        dz = -dx * Math.sin(a) + dz * Math.cos(a);
        dx = tx;
      } else if (target) {
        dx = target.x - px;
        dz = target.y - pz;
        const len = Math.hypot(dx, dz);
        if (len < 0.15) {
          target = null;
          dx = 0;
          dz = 0;
        } else {
          dx /= len;
          dz /= len;
        }
      }
      const nx = px + dx * 5 * dt,
        nz = pz + dz * 5 * dt;
      if (valid(nx, pz)) px = nx;
      if (valid(px, nz)) pz = nz;
      if ((dx || dz) && now - lastSent > 90) {
        live.current.onMove(px, pz);
        lastSent = now;
      }
      desiredCenter.set(px, 0, pz);
      const all = [
        ...live.current.people.filter(
          (p) =>
            p.id !== live.current.self.id &&
            (p.area || "village") === (live.current.self.area || "village"),
        ),
        { ...live.current.self, x: px, z: pz },
      ];
      for (const p of all) {
        let g = avatarMap.get(p.id);
        if (g && g.userData.identity !== p.name + p.color + p.avatar) {
          dirty = true;
          (g.userData.label as HTMLButtonElement)?.remove();
          scene.remove(g);
          g.traverse((o) => {
            if (o instanceof T.Sprite) {
              o.material.map?.dispose();
              o.material.dispose();
            }
            if (o instanceof T.Mesh) {
              o.geometry.dispose();
              if (o.material instanceof T.MeshBasicMaterial)
                o.material.dispose();
            }
          });
          avatarMap.delete(p.id);
          g = undefined;
        }
        if (!g) {
          dirty = true;
          g = avatar(p);
          g.userData.identity = p.name + p.color + p.avatar;
          avatarMap.set(p.id, g);
        }
        const ox = g.position.x,
          oz = g.position.z;
        g.position.x = T.MathUtils.lerp(ox, p.x, Math.min(1, dt * 12));
        g.position.z = T.MathUtils.lerp(oz, p.z, Math.min(1, dt * 12));
        if (Math.hypot(p.x - ox, p.z - oz) > 0.01) {
          dirty = true;
          g.rotation.y = Math.atan2(p.x - ox, p.z - oz);
          g.position.y = Math.sin(now * 0.012) * 0.06;
        } else g.position.y = 0;
        animateHuman(g, now, Math.hypot(p.x - ox, p.z - oz) > 0.01);
      }
      for (const [id, g] of avatarMap)
        if (!all.some((p) => p.id === id)) {
          dirty = true;
          (g.userData.label as HTMLButtonElement)?.remove();
          scene.remove(g);
          g.traverse((o) => {
            if (o instanceof T.Sprite) {
              o.material.map?.dispose();
              o.material.dispose();
            }
            if (o instanceof T.Mesh) {
              o.geometry.dispose();
              if (o.material instanceof T.MeshBasicMaterial)
                o.material.dispose();
            }
          });
          avatarMap.delete(id);
        }
      if (
        center.distanceTo(desiredCenter) > 0.01 ||
        angle !== lastAngle ||
        zoom !== lastZoom
      )
        dirty = true;
      center.lerp(desiredCenter, dt * 3);
      camera.position.set(
        center.x + Math.sin(angle) * zoom,
        zoom * 0.75,
        center.z + Math.cos(angle) * zoom,
      );
      camera.lookAt(center.x, 1.2, center.z);
      camera.updateMatrixWorld();
      const projected = new T.Vector3();
      for (const g of avatarMap.values()) {
        projected.copy(g.position);
        projected.y = 3.4;
        projected.project(camera);
        const label = g.userData.label as HTMLButtonElement;
        label.hidden =
          projected.z > 1 ||
          projected.z < -1 ||
          Math.abs(projected.x) > 1 ||
          Math.abs(projected.y) > 1;
        const tx = Math.round(((projected.x + 1) * el.clientWidth) / 2),
          ty = Math.round(((-projected.y + 1) * el.clientHeight) / 2);
        const transform = `translate(-50%,-100%) translate(${tx}px,${ty}px)`;
        if (label.style.transform !== transform)
          label.style.transform = transform;
      }
      boat.position.y = Math.sin(now * 0.001) * 0.08;
      water.material.opacity = 1;
      if (
        now - lastRender > (quality === "low" ? 50 : 32) &&
        (dirty || now - lastRender > 1000)
      ) {
        renderer.render(scene, camera);
        lastRender = now;
        lastAngle = angle;
        lastZoom = zoom;
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    onReady();
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      el.removeEventListener("pointerdown", pd);
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
      el.removeEventListener("wheel", wheel);
      scene.traverse((o) => {
        if (o instanceof T.Mesh) {
          if (o instanceof T.InstancedMesh) o.dispose();
          o.geometry.dispose();
          const m = o.material as T.Material;
          m.dispose();
        }
        if (o instanceof T.Sprite) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
      for (const g of avatarMap.values())
        (g.userData.label as HTMLButtonElement)?.remove();
      for (const texture of textures.values()) texture.dispose();
      for (const material of materials.values()) material.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      handle.current = null;
    };
    // Rebuild only for graphics quality. Live participant data is read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality]);
  return <div className="world-canvas" ref={container} />;
}
