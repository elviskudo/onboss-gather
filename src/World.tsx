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
  onReady: () => void;
  onError: () => void;
  handle: React.RefObject<WorldHandle | null>;
};

export function World({
  people,
  self,
  quality,
  onMove,
  onReady,
  onError,
  handle,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const live = useRef({ people, self, onMove });
  live.current = { people, self, onMove };
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
    renderer.setClearColor("#dce7dc");
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D Hallstatt village. Use WASD or arrow keys to walk.",
    );
    renderer.domElement.tabIndex = 0;
    const materials = new Map<string, T.MeshStandardMaterial>();
    const mat = (
      color: string,
      extra: Partial<T.MeshStandardMaterialParameters> = {},
    ) => {
      const key = color + JSON.stringify(extra);
      let m = materials.get(key);
      if (!m) {
        m = new T.MeshStandardMaterial({ color, roughness: 0.95, ...extra });
        materials.set(key, m);
      }
      return m;
    };
    const scene = new T.Scene();
    scene.fog = new T.Fog("#dce7dc", 100, 220);
    const camera = new T.PerspectiveCamera(36, 1, 0.1, 350);
    let angle = 0.72,
      zoom = 81;
    const center = new T.Vector3(0, 0, 0);
    const desiredCenter = new T.Vector3(0, 0, 0);
    const ambient = new T.HemisphereLight("#fff3d9", "#759585", 3);
    scene.add(ambient);
    const sun = new T.DirectionalLight("#ffe0ac", 4);
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
    ) => mesh(new T.BoxGeometry(w, h, d), mat(c), x, y, z, p);
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
    ) => mesh(new T.CylinderGeometry(rt, rb, h, n), mat(c), x, y, z, p);
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
      bevelSegments: 1,
      steps: 1,
    });
    const island = mesh(landgeo, mat("#a9b88a"), 0, -2.3, 0);
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
    // Iconic lakeside church and its slender spire.
    const church = new T.Group();
    church.position.set(12, 0.6, 17);
    scene.add(church);
    box(5.5, 5, 8, "#e8ddc5", 0, 2.5, 0, church);
    roof(6.1, 8.5, 2.9, "#686e63", 0, 5, 0, church);
    box(2.6, 9.5, 2.8, "#ebe3d0", 0, 4.75, 4.5, church);
    box(2.9, 0.3, 3.1, "#c4bdaa", 0, 8.7, 4.5, church);
    cylinder(0, 2.25, 7, "#596c64", 0, 13, 4.5, 4, church).rotation.y =
      Math.PI / 4;
    box(0.1, 1.1, 0.1, "#bbad7f", 0, 17, 4.5, church);
    box(0.65, 0.1, 0.1, "#bbad7f", 0, 17.15, 4.5, church);
    box(0.8, 1.6, 0.1, "#7c8c7e", 0, 7.6, 5.94, church);
    cylinder(0.62, 0.62, 0.1, "#f1e6ca", 0, 6, 5.95, 24, church).rotation.x =
      Math.PI / 2;
    box(0.07, 0.4, 0.1, "#645d4a", 0, 6.14, 6.04, church);
    box(0.32, 0.06, 0.1, "#645d4a", 0.13, 6, 6.05, church);
    obstacles.push({ x: 12, z: 17, w: 3.2, d: 5.8 });
    function tree(x: number, z: number, s = 1, pine = true) {
      cylinder(0.13 * s, 0.22 * s, 1.7 * s, "#806e52", x, 1.2 * s, z);
      if (pine) {
        for (let i = 0; i < 3; i++)
          cylinder(
            0,
            1.5 * s - i * 0.27 * s,
            2.6 * s,
            "#" + ["6e8e6b", "5d7f5d", "799b73"][i],
            x,
            (2.4 + i * 0.9) * s,
            z,
            7,
          );
      } else {
        mesh(
          new T.IcosahedronGeometry(1.75 * s, 0),
          mat("#89a56e"),
          x,
          3 * s,
          z,
        );
        mesh(
          new T.IcosahedronGeometry(1.3 * s, 0),
          mat("#a4b87a"),
          x + 0.5 * s,
          3.8 * s,
          z,
        );
      }
    }
    [
      [-29, -22],
      [-22, -24],
      [-12, -25],
      [-3, -24],
      [4, -23],
      [22, -23],
      [25, -13],
      [-30, -9],
      [-29, 4],
      [-28, 19],
      [-22, 23],
      [-16, 24],
      [-7, 24],
      [0, 22],
      [5, 21],
      [20, 19],
      [20, 13],
      [-6, 13],
      [-6, 18],
      [-21, 16],
      [-20, 9],
    ].forEach(([x, z], i) => tree(x, z, 0.8 + (i % 4) * 0.16, i % 3 !== 0));
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
    for (const [x, z] of [
      [6, -8],
      [-4, 8],
      [21, 11],
      [-12, 10],
      [-19, -10],
    ]) {
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
          new T.IcosahedronGeometry(0.22, 0),
          mat(i % 2 ? "#d1a688" : "#c3afc2"),
          -20 + i * 1.6,
          1.1,
          20 + j * 0.5,
        );
    }
    const boat = new T.Group();
    boat.position.set(36, 0, 3);
    boat.rotation.y = -0.5;
    scene.add(boat);
    const hull = mesh(
      new T.SphereGeometry(1, 8, 6),
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
      new T.ConeGeometry(1.4, 2.5, 3),
      mat("#f0e2bc", { side: T.DoubleSide }),
      0.7,
      1.7,
      0,
      boat,
    );
    sail.scale.z = 0.02;
    // Low-poly alpine backdrop.
    for (let i = 0; i < 13; i++) {
      const x = -140 + i * 23,
        z = -75 - (i % 3) * 19,
        h = 24 + (i % 5) * 9;
      const m = mesh(
        new T.ConeGeometry(24, h, 5),
        mat(i % 2 ? "#7e9b8b" : "#8fa99a"),
        x,
        h / 2 - 2,
        z,
      );
      m.rotation.y = i * 0.7;
      const snow = mesh(
        new T.ConeGeometry(7, h * 0.24, 5),
        mat("#ced9c7"),
        x,
        h - h * 0.12 - 2,
        z,
      );
      snow.rotation.y = i * 0.7;
    }
    // Subtle water glints, no per-frame geometry allocations.
    const glints: T.Mesh[] = [];
    for (let i = 0; i < 80; i++) {
      const x = 34 + (i % 10) * 7,
        z = -45 + Math.floor(i / 10) * 12;
      const g = box(1.2 + (i % 3), 0.015, 0.12, "#b4ceca", x, -0.37, z);
      glints.push(g);
    }
    // Batch static geometry by shared material: a few dozen draw calls instead of thousands.
    scene.updateMatrixWorld(true);
    const batches = new Map<
      T.Material,
      { geometry: T.BufferGeometry[]; originals: T.Mesh[] }
    >();
    scene.traverse((o) => {
      if (!(o instanceof T.Mesh) || o === water || o.parent === boat) return;
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
        if (!["position", "normal"].includes(key)) geo.deleteAttribute(key);
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
        scene.add(merged);
        for (const o of batch.originals) {
          o.removeFromParent();
          o.geometry.dispose();
        }
      }
      for (const g of batch.geometry) g.dispose();
    }
    const avatarMap = new Map<string, T.Group>();
    function avatar(p: Person) {
      const g = new T.Group();
      const body = cylinder(0.32, 0.37, 0.8, p.color, 0, 1, 0, 8, g);
      body.name = "body";
      cylinder(0.27, 0.26, 0.5, "#e6bea0", 0, 1.65, 0, 8, g);
      const hair = mesh(
        new T.SphereGeometry(0.29, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        mat("#56483f"),
        0,
        1.88,
        0,
        g,
      );
      hair.rotation.z = 0.08;
      for (const x of [-0.17, 0.17]) {
        box(0.23, 0.55, 0.23, "#48574d", x, 0.35, 0, g);
        box(0.26, 0.16, 0.4, "#f0e6ce", x, 0.1, 0.07, g);
      }
      for (const x of [-0.44, 0.44])
        cylinder(0.1, 0.1, 0.65, p.color, x, 1, 0, 6, g);
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
      const cv = document.createElement("canvas");
      cv.width = 512;
      cv.height = 100;
      const c = cv.getContext("2d")!;
      c.fillStyle = "#fffcf0";
      c.beginPath();
      c.roundRect(6, 6, 500, 84, 35);
      c.fill();
      c.fillStyle = "#3b5148";
      c.font = "500 36px system-ui";
      c.textAlign = "center";
      c.fillText(
        p.name + (p.id === live.current.self.id ? " · you" : ""),
        256,
        61,
      );
      const tex = new T.CanvasTexture(cv);
      const sp = new T.Sprite(
        new T.SpriteMaterial({ map: tex, depthTest: false }),
      );
      sp.scale.set(3.7, 0.72, 1);
      sp.position.y = 2.8;
      g.add(sp);
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
      return (
        x > -27 &&
        x < 24 &&
        z > -24 &&
        z < 24 &&
        !obstacles.some(
          (o) =>
            Math.abs(x - o.x) < o.w + 0.35 && Math.abs(z - o.z) < o.d + 0.35,
        )
      );
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
      zoom = T.MathUtils.clamp(zoom + e.deltaY * 0.03, 38, 120);
    };
    el.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    el.addEventListener("wheel", wheel, { passive: false });
    handle.current = {
      go(x, z) {
        if (!valid(x, z)) {
          x += 3;
          z += 3;
        }
        px = x;
        pz = z;
        target = null;
        desiredCenter.set(x * 0.3, 0, z * 0.3);
        live.current.onMove(px, pz);
      },
      zoom(n) {
        zoom = T.MathUtils.clamp(zoom + n, 38, 120);
      },
      rotate() {
        angle += Math.PI / 4;
      },
      home() {
        angle = 0.72;
        zoom = 81;
        desiredCenter.set(0, 0, 0);
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
      let dirty = false;
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
        const a = angle - 0.72;
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
      const all = [
        ...live.current.people.filter((p) => p.id !== live.current.self.id),
        { ...live.current.self, x: px, z: pz },
      ];
      for (const p of all) {
        let g = avatarMap.get(p.id);
        if (g && g.userData.identity !== p.name + p.color) {
          dirty = true;
          scene.remove(g);
          g.traverse((o) => {
            if (o instanceof T.Sprite) {
              o.material.map?.dispose();
              o.material.dispose();
            }
            if (o instanceof T.Mesh) o.geometry.dispose();
          });
          avatarMap.delete(p.id);
          g = undefined;
        }
        if (!g) {
          dirty = true;
          g = avatar(p);
          g.userData.identity = p.name + p.color;
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
      }
      for (const [id, g] of avatarMap)
        if (!all.some((p) => p.id === id)) {
          dirty = true;
          scene.remove(g);
          g.traverse((o) => {
            if (o instanceof T.Sprite) {
              o.material.map?.dispose();
              o.material.dispose();
            }
            if (o instanceof T.Mesh) {
              o.geometry.dispose();
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
      camera.lookAt(center.x, 0, center.z);
      boat.position.y = Math.sin(now * 0.001) * 0.08;
      water.material.opacity = 1;
      if (now - lastRender > 32 && (dirty || now - lastRender > 1000)) {
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
          o.geometry.dispose();
          const m = o.material as T.Material;
          m.dispose();
        }
        if (o instanceof T.Sprite) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
      handle.current = null;
    };
    // Rebuild only for graphics quality. Live participant data is read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality]);
  return <div className="world-canvas" ref={container} />;
}
