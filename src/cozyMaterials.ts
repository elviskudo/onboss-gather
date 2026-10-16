import * as T from "three";
export type Surface = "grass" | "stone" | "wood" | "roof" | "plaster";
/** Original tileable material marks. Fixed seeds keep the asset family deterministic. */
export function createCozyTextures() {
  const textures = new Map<Surface, T.CanvasTexture>();
  const colors = {
    grass: "#d5e8ad",
    stone: "#e8d9b9",
    wood: "#d0ab7a",
    roof: "#e6b196",
    plaster: "#f6eedb",
  };
  for (const kind of Object.keys(colors) as Surface[]) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const c = cv.getContext("2d")!;
    let seed = kind.length * 733;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    c.fillStyle = colors[kind];
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) {
      const x = random() * 256,
        y = random() * 256;
      c.fillStyle = `rgba(${random() > 0.5 ? "255,255,235" : "63,72,37"},${random() * 0.065})`;
      c.fillRect(x, y, 1 + random() * 3, 1 + random() * 3);
    }
    if (kind === "grass")
      for (let i = 0; i < 600; i++) {
        const x = random() * 256,
          y = random() * 256;
        c.strokeStyle = random() > 0.5 ? "#95b75c60" : "#f4f2c160";
        c.lineWidth = 0.7;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(
          x - 2,
          y - 3,
          x + random() * 5 - 2,
          y - 5 - random() * 4,
        );
        c.stroke();
      }
    if (kind === "stone")
      for (let row = 0; row < 8; row++)
        for (let col = -1; col < 8; col++) {
          const x = col * 40 + (row % 2) * 20,
            y = row * 32;
          c.fillStyle = `rgba(255,250,228,${0.15 + random() * 0.2})`;
          c.beginPath();
          c.roundRect(x + 2, y + 2, 36, 28, 7);
          c.fill();
          c.strokeStyle = "#a58f6b50";
          c.lineWidth = 1;
          c.stroke();
        }
    if (kind === "wood")
      for (let i = 0; i < 80; i++) {
        const y = random() * 256;
        c.strokeStyle = "#6d4c2840";
        c.lineWidth = 0.5 + random();
        c.beginPath();
        c.moveTo(0, y);
        c.bezierCurveTo(80, y - 5, 180, y + 5, 256, y);
        c.stroke();
      }
    if (kind === "roof")
      for (let row = 0; row < 8; row++)
        for (let col = -1; col < 9; col++) {
          const x = col * 32 + (row % 2) * 16,
            y = row * 32;
          c.fillStyle = `rgba(123,56,26,${0.04 + random() * 0.15})`;
          c.beginPath();
          c.roundRect(x + 1, y + 1, 30, 30, [2, 2, 9, 9]);
          c.fill();
          c.strokeStyle = "#7b483b60";
          c.stroke();
          c.strokeStyle = "#ffe6c870";
          c.beginPath();
          c.moveTo(x + 4, y + 4);
          c.lineTo(x + 28, y + 4);
          c.stroke();
        }
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.anisotropy = 4;
    textures.set(kind, tex);
  }
  return textures;
}
export function projectSurfaceUV(geometry: T.BufferGeometry, density = 1) {
  const p = geometry.getAttribute("position"),
    n = geometry.getAttribute("normal"),
    uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i)),
      az = Math.abs(n.getZ(i));
    uv[i * 2] =
      (ay >= ax && ay >= az ? p.getX(i) : az >= ax ? p.getX(i) : p.getZ(i)) *
      density;
    uv[i * 2 + 1] = (ay >= ax && ay >= az ? p.getZ(i) : p.getY(i)) * density;
  }
  geometry.setAttribute("uv", new T.BufferAttribute(uv, 2));
  return geometry;
}
