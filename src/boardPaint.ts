import type { Board } from "../shared/social";
export function paintBoard(
  ctx: CanvasRenderingContext2D,
  board: Board | null,
  width: number,
  height: number,
) {
  ctx.fillStyle = "#fffef8";
  ctx.fillRect(0, 0, width, height);
  for (const stroke of board?.strokes || []) {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = (stroke.width * width) / 900;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    stroke.points.forEach(([x, y], i) =>
      i ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height),
    );
    ctx.stroke();
  }
}
