// Iris colours. Every player is a hue in OKLCH at a fixed lightness and chroma, so two colours mix by
// averaging hues: the result keeps the same brightness and saturation (no muddy browns or greys, which is
// what averaging RGB gives) and every colour reads the same against the white of the eye.
// Hues stay inside [HUE_MIN, HUE_MAX] and are averaged on that segment, never across the red end:
// red is reserved for "hit by the ball".

export const HUE_MIN = 60;
export const HUE_MAX = 340;
const LIGHTNESS = 0.62;
const CHROMA = 0.15;

export function clampHue(h: number): number {
  return Math.min(HUE_MAX, Math.max(HUE_MIN, h));
}

/** OKLab (Björn Ottosson) to linear sRGB. */
function oklabToLinearSrgb(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function oklchToLinearSrgb(L: number, C: number, hueDeg: number): [number, number, number] {
  const h = (hueDeg * Math.PI) / 180;
  return oklabToLinearSrgb(L, C * Math.cos(h), C * Math.sin(h));
}

const inGamut = (rgb: number[]) => rgb.every((c) => c >= -1e-6 && c <= 1 + 1e-6);

/** The chroma actually used for a hue: CHROMA, or less where sRGB cannot show it. */
export function chromaFor(hueDeg: number): number {
  if (inGamut(oklchToLinearSrgb(LIGHTNESS, CHROMA, hueDeg))) return CHROMA;
  let lo = 0;
  let hi = CHROMA;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinearSrgb(LIGHTNESS, mid, hueDeg))) lo = mid;
    else hi = mid;
  }
  return lo;
}

function encode(linear: number): number {
  const c = Math.min(1, Math.max(0, linear));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** sRGB hex of a player's hue: the same string for every client. */
export function hueToHex(hueDeg: number): string {
  const h = clampHue(hueDeg);
  const rgb = oklchToLinearSrgb(LIGHTNESS, chromaFor(h), h);
  return '#' + rgb.map((c) => Math.round(encode(c) * 255).toString(16).padStart(2, '0')).join('');
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(hexA: string, hexB: string): number {
  const [a, b] = [luminance(hexA), luminance(hexB)].sort((x, y) => y - x) as [number, number];
  return (a + 0.05) / (b + 0.05);
}
