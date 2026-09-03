export type EventPalette = {
  primary: string;
  secondary: string;
  accent: string;
};

type RGB = { r: number; g: number; b: number };
type HSL = { h: number; s: number; l: number };
type Bucket = RGB & HSL & { count: number };

const FALLBACK: EventPalette = {
  primary: "#220708",
  secondary: "#751013",
  accent: "#e12622",
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function hslToRgb({ h, s, l }: HSL): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hp >= 0 && hp < 1) [rp, gp, bp] = [c, x, 0];
  else if (hp < 2) [rp, gp, bp] = [x, c, 0];
  else if (hp < 3) [rp, gp, bp] = [0, c, x];
  else if (hp < 4) [rp, gp, bp] = [0, x, c];
  else if (hp < 5) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

function hex({ r, g, b }: RGB) {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function hueDistance(a: number, b: number) {
  const raw = Math.abs(a - b) % 360;
  return Math.min(raw, 360 - raw);
}

function rgbDistance(a: RGB, b: RGB) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function themedColor(source: Bucket, role: "primary" | "secondary" | "accent") {
  if (role === "primary") {
    return hex(hslToRgb({ h: source.h, s: clamp(Math.max(source.s, 0.28), 0, 0.78), l: clamp(source.l * 0.36, 0.055, 0.16) }));
  }
  if (role === "secondary") {
    return hex(hslToRgb({ h: source.h, s: clamp(Math.max(source.s, 0.34), 0, 0.86), l: clamp(source.l * 0.72, 0.16, 0.34) }));
  }
  return hex(hslToRgb({ h: source.h, s: clamp(Math.max(source.s, 0.58), 0, 0.96), l: clamp(source.l, 0.42, 0.67) }));
}

async function loadImage(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    return (await createImageBitmap(file)) as ImageBitmap;
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function extractEventPalette(file: File): Promise<EventPalette> {
  if (typeof document === "undefined") return FALLBACK;
  const image = await loadImage(file);
  const maxSide = 84;
  const ratio = Math.min(maxSide / Math.max(image.width, image.height), 1);
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return FALLBACK;
  context.drawImage(image, 0, 0, width, height);
  if ("close" in image && typeof image.close === "function") image.close();

  const pixels = context.getImageData(0, 0, width, height).data;
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha < 180) continue;
    const rgb = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
    const hsl = rgbToHsl(rgb);
    if (hsl.l > 0.96 && hsl.s < 0.12) continue;
    if (hsl.l < 0.025) continue;
    const qr = Math.round(rgb.r / 28) * 28;
    const qg = Math.round(rgb.g / 28) * 28;
    const qb = Math.round(rgb.b / 28) * 28;
    const key = `${qr}-${qg}-${qb}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += rgb.r;
    bucket.g += rgb.g;
    bucket.b += rgb.b;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  const candidates: Bucket[] = [...buckets.values()]
    .filter((bucket) => bucket.count >= 2)
    .map((bucket) => {
      const rgb = { r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count };
      return { ...rgb, ...rgbToHsl(rgb), count: bucket.count };
    })
    .sort((a, b) => b.count - a.count);

  if (!candidates.length) return FALLBACK;

  const primarySource = candidates
    .filter((item) => item.l < 0.72)
    .sort((a, b) => (b.count * (0.75 + b.s)) - (a.count * (0.75 + a.s)))[0] ?? candidates[0];

  const secondarySource = candidates
    .filter((item) => rgbDistance(item, primarySource) > 54 || hueDistance(item.h, primarySource.h) > 28)
    .sort((a, b) => (b.count * (0.55 + b.s)) - (a.count * (0.55 + a.s)))[0] ?? primarySource;

  const accentSource = candidates
    .filter((item) => item.l > 0.1 && item.l < 0.9)
    .filter((item) => rgbDistance(item, primarySource) > 38 || item.s > primarySource.s + 0.12)
    .sort((a, b) => {
      const scoreA = Math.sqrt(a.count) * (0.35 + a.s * 1.8) * (0.7 + Math.min(a.l, 0.65));
      const scoreB = Math.sqrt(b.count) * (0.35 + b.s * 1.8) * (0.7 + Math.min(b.l, 0.65));
      return scoreB - scoreA;
    })[0] ?? secondarySource;

  return {
    primary: themedColor(primarySource, "primary"),
    secondary: themedColor(secondarySource, "secondary"),
    accent: themedColor(accentSource, "accent"),
  };
}
