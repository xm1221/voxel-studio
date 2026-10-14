export function drawTag(canvas: HTMLCanvasElement, text: string) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = "600 64px Outfit, 'WenQuanYi Micro Hei', sans-serif";
  const width = Math.min(context.measureText(text).width, 460);
  const boxW = width + 48;
  const boxH = 84;
  const x = (canvas.width - boxW) / 2;
  const y = 22;
  context.fillStyle = "rgba(12, 12, 14, 0.55)";
  context.fillRect(x, y, boxW, boxH);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, y + boxH / 2, 460);
}

export function drawBubble(canvas: HTMLCanvasElement, text: string) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  roundRect(context, 16, 12, 480, 120, 28);
  context.beginPath();
  context.moveTo(46, 132);
  context.lineTo(28, 176);
  context.lineTo(92, 132);
  context.fill();
  context.fillStyle = "#16325c";
  context.font = "600 42px Outfit, 'WenQuanYi Micro Hei', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 72, 440);
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
  context.fill();
}
