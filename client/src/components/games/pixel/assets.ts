/**
 * Пиксель-арт предоставлен владельцем проекта.
 * Sprite sheet: Pixelhammer / PeaceCraft —
 * https://bolterandchainsword.com/topic/367239-pixelhammer-an-oldschool-pixelart-gameproject/
 * Орк, варбосс и Эльдар: исходные изображения с отметкой @kabewski.
 * Карты AoS: десять sprite sheets, предоставленных владельцем проекта.
 * Имена файлов карт совпадают с ID и русскими названиями в каталоге.
 * Указание источников не является предположением о дополнительной лицензии.
 */
const images = new Map<string, HTMLImageElement>();

export function gameImage(src: string): HTMLImageElement {
  let image = images.get(src);
  if (!image) {
    image = new Image();
    image.src = src;
    images.set(src, image);
  }
  return image;
}

export function drawGameImage(
  ctx: CanvasRenderingContext2D,
  src: string,
  x: number,
  y: number,
  options: { flip?: boolean; tint?: string; width?: number; height?: number } = {},
) {
  const image = gameImage(src);
  if (!image.complete || image.naturalWidth === 0) return;
  const width = options.width ?? image.naturalWidth;
  const height = options.height ?? image.naturalHeight;
  let source: HTMLImageElement | HTMLCanvasElement = image;

  // Красим только спрайт на отдельном канвасе, не затрагивая фон арены.
  if (options.tint) {
    const tinted = document.createElement("canvas");
    tinted.width = image.naturalWidth;
    tinted.height = image.naturalHeight;
    const tintCtx = tinted.getContext("2d");
    if (tintCtx) {
      tintCtx.imageSmoothingEnabled = false;
      tintCtx.drawImage(image, 0, 0);
      tintCtx.globalCompositeOperation = "source-atop";
      tintCtx.globalAlpha = 0.72;
      tintCtx.fillStyle = options.tint;
      tintCtx.fillRect(0, 0, tinted.width, tinted.height);
      source = tinted;
    }
  }

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (options.flip) {
    ctx.translate(Math.round(x + width), Math.round(y));
    ctx.scale(-1, 1);
    ctx.drawImage(source, 0, 0, width, height);
  } else {
    ctx.drawImage(source, Math.round(x), Math.round(y), width, height);
  }
  ctx.restore();
}
