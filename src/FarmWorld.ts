import * as T from "three";
import { createFarmAnimals } from "./FarmAnimals";
import { FARM_BUILDINGS, FARM_TREES } from "../shared/farm";
/** Space 2 uses the actual supplied sprite atlas, normalized into individual alpha PNGs. */
export function createFarmWorld() {
  const group = new T.Group();
  group.name = "space-2-farm";
  const textures = new Map<string, Promise<T.Texture>>();
  const pending: Promise<unknown>[] = [];
  let disposed = false;
  const groundMaps: T.Texture[] = [];
  function texture(name: string) {
    let promise = textures.get(name);
    if (!promise) {
      promise = new T.TextureLoader()
        .loadAsync(`/assets/farm/${name}.png`)
        .then((t) => {
          t.colorSpace = T.SRGBColorSpace;
          t.magFilter = T.NearestFilter;
          t.minFilter = T.NearestFilter;
          t.generateMipmaps = false;
          if (disposed) t.dispose();
          return t;
        });
      textures.set(name, promise);
    }
    return promise;
  }
  function tile(name: string, x: number, z: number, w: number, d: number) {
    const material = new T.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 1,
    });
    if (name === "grass") {
      material.transparent = true;
      material.opacity = 0.28;
      material.depthWrite = false;
      const base = new T.Mesh(
        new T.PlaneGeometry(w, d),
        new T.MeshStandardMaterial({ color: "#8fa964", roughness: 1 }),
      );
      base.rotation.x = -Math.PI / 2;
      base.position.set(x, 0.58, z);
      base.receiveShadow = true;
      group.add(base);
    }
    const plane = new T.Mesh(new T.PlaneGeometry(w, d), material);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(
      x,
      name === "grass"
        ? 0.6
        : name === "soil"
          ? 0.65
          : name === "water"
            ? 0.625
            : 0.63,
      z,
    );
    plane.receiveShadow = true;
    group.add(plane);
    pending.push(
      texture(name).then((t) => {
        const map = t.clone();
        map.needsUpdate = true;
        groundMaps.push(map);
        if (disposed) map.dispose();
        map.wrapS = map.wrapT = T.RepeatWrapping;
        map.repeat.set(
          w / (name === "grass" ? 4 : 2),
          d / (name === "grass" ? 4 : 2),
        );
        material.map = map;
        material.needsUpdate = true;
      }),
    );
  }
  tile("grass", 0, 0, 130, 130);
  tile("dirt", 0, 4, 45, 3);
  tile("dirt", 0, -5, 4, 33);
  tile("paving", -11, -4.5, 5, 5);
  tile("water", 10, 18, 8, 5);
  function sprite(
    name: string,
    x: number,
    z: number,
    width: number,
    height: number,
  ) {
    const material = new T.SpriteMaterial({
      color: "#ffffff",
      transparent: true,
      alphaTest: 0.22,
      depthWrite: true,
    });
    const item = new T.Sprite(material);
    item.center.set(0.5, 0);
    item.scale.set(width, height, 1);
    item.position.set(x, 0.64, z);
    item.name = name;
    group.add(item);
    pending.push(
      texture(name).then((t) => {
        material.map = t;
        const size = t.image as { width: number; height: number };
        item.scale.y = width * (size.height / size.width);
        material.needsUpdate = true;
      }),
    );
    return item;
  }
  function shadow(x: number, z: number, w: number, d: number) {
    const m = new T.Mesh(
      new T.CircleGeometry(1, 24),
      new T.MeshBasicMaterial({
        color: "#344b2c",
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.scale.set(w, d, 1);
    m.position.set(x, 0.625, z);
    group.add(m);
  }
  for (const b of FARM_BUILDINGS) {
    shadow(b.x, b.z, b.halfX + 1, b.halfZ + 1);
    const building = sprite(b.asset, b.x, b.z, b.width, b.height);
    if ("area" in b) building.userData.area = b.area;
  }
  for (const [i, [x, z]] of FARM_TREES.entries()) {
    sprite(
      ["oak", "apple", "pine", "pink-tree", "autumn-tree"][i % 5],
      x,
      z,
      5.4,
      6.8,
    );
    shadow(x, z, 1.6, 0.8);
  }
  for (const x of [-12, -9, -6])
    for (const z of [8, 11, 14]) {
      tile("soil", x, z, 2.4, 2.4);
      sprite(
        z === 8 ? "turnip" : z === 11 ? "carrot" : "pumpkin",
        x,
        z,
        0.7,
        0.8,
      );
    }
  for (const x of [6, 8.5, 11])
    for (const z of [6, 8.5, 11]) {
      tile("soil", x, z, 2, 2);
      sprite(
        z === 6 ? "tomato" : z === 8.5 ? "corn" : "sunflower",
        x,
        z,
        0.7,
        1.0,
      );
    }
  for (let x = -9; x <= 12; x += 1.8) sprite("fence", x, -17, 1.8, 1.3);
  for (const [asset, x, z, w, h] of [
    ["horse", 18, -15, 2.8, 3.2],
    ["mailbox", -7, -4, 0.65, 1.1],
    ["crate", 13, 6, 0.7, 0.8],
    ["gate", 1, -17, 2.4, 1.7],
    ["stump", -22, 13, 1.3, 1.4],
  ] as const)
    sprite(asset, x, z, w, h);
  for (let i = 0; i < 6; i++) sprite("flower", -2 + i * 1.1, 14, 0.4, 0.5);
  const animals = createFarmAnimals();
  group.add(animals.group);
  return {
    group,
    animals,
    ready: Promise.all(pending),
    dispose: () => {
      disposed = true;
      animals.dispose();
      animals.group.removeFromParent();
      groundMaps.forEach((t) => t.dispose());
      for (const p of textures.values()) void p.then((t) => t.dispose());
    },
  };
}
