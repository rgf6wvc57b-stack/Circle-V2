/**
 * Color palettes indexed by construction order (sphere index).
 * Colors are sRGB hex values; intensity is applied at material time.
 */
export const PALETTES = Object.freeze({
  watercolor: {
    id: "watercolor",
    name: "Watercolor",
    colors: [
      0xf4a6b8, // soft rose
      0x7ec8e3, // sky wash
      0xa8d5a2, // sage
      0xf6d39a, // pale gold
      0xc5b0e3, // lilac
      0xf0b27a, // peach
      0x89cfcb, // seafoam
      0xe8a0bf, // mauve
      0x9bb7e0, // periwinkle
      0xd4e6a5, // chartreuse wash
      0xe6b8a2, // clay
      0xb8d4e8, // mist blue
      0xd9b3d9, // orchid
      0xf5c6aa, // apricot
      0xa3c9a8, // mint
      0xc9d6e8, // cloud
      0xe8c4d4, // blush
    ],
  },
  ocean: {
    id: "ocean",
    name: "Ocean",
    colors: [
      0x0b3d5c, // deep navy
      0x147a8c, // teal
      0x1fa8a0, // aqua
      0x3ecfbf, // bright teal
      0x5bb8ff, // light sea
      0x2a6f97, // mid blue
      0x61a5c2, // soft cyan
      0x01497c, // abyss
      0x00b4d8, // caribbean
      0x48cae4, // shallow
      0x90e0ef, // foam
      0x0077b6, // pacific
      0x023e8a, // deep
      0x0096c7, // lagoon
      0x48b5c4, // reef
      0x80ed99, // coastal green
      0x56cfe1, // ice water
    ],
  },
  spectrum: {
    id: "spectrum",
    name: "Spectrum",
    colors: [
      0xff3b3b, // red
      0xff7a1a, // orange
      0xffd60a, // yellow
      0x4ade80, // green
      0x22d3ee, // cyan
      0x3b82f6, // blue
      0x8b5cf6, // violet
      0xec4899, // magenta
      0xf97316, // amber
      0x84cc16, // lime
      0x06b6d4, // turquoise
      0x6366f1, // indigo
      0xd946ef, // fuchsia
      0xef4444, // scarlet
      0xfbbf24, // gold yellow
      0x10b981, // emerald
      0x0ea5e9, // sky
    ],
  },
  goldAndViolet: {
    id: "goldAndViolet",
    name: "Gold and Violet",
    colors: [
      0xf0c14a, // gold
      0x8b5cf6, // violet
      0xe8b923, // rich gold
      0x7c3aed, // deep violet
      0xffd700, // bright gold
      0xa78bfa, // soft violet
      0xd4a017, // antique gold
      0x6d28d9, // royal purple
      0xf5e6a3, // pale gold
      0xc4b5fd, // lilac gold-pair
      0xc9a227, // brass
      0x5b21b6, // indigo violet
      0xe6c35c, // honey
      0x9333ea, // vivid violet
      0xb8860b, // dark goldenrod
      0xddd6fe, // mist violet
      0xffec8b, // light gold
    ],
  },
  monochrome: {
    id: "monochrome",
    name: "Monochrome",
    colors: [
      0xf5f7fa,
      0xd9dee7,
      0xb8c0cc,
      0x98a2b3,
      0x7a8699,
      0x5e6a7d,
      0x455063,
      0xd0d5dd,
      0xaeb6c2,
      0x8b95a5,
      0x6b7585,
      0x4f5868,
      0xe8ebf0,
      0xc5cad3,
      0x9aa3b2,
      0x727c8c,
      0x3d4654,
    ],
  },
});

export const PALETTE_IDS = Object.freeze(Object.keys(PALETTES));

/**
 * @param {string} paletteId
 * @param {number} index construction-order index (0-based)
 * @param {number} intensity 0..1+ scales saturation/value toward vivid
 * @returns {number} hex color
 */
export function colorForSphere(paletteId, index, intensity = 1) {
  const palette = PALETTES[paletteId] ?? PALETTES.watercolor;
  const base = palette.colors[index % palette.colors.length];
  return applyIntensity(base, intensity);
}

function applyIntensity(hex, intensity) {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  // Convert to HSL-ish adjust: boost saturation and mid brightness with intensity
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  const t = Math.max(0, intensity);
  const s2 = Math.min(1, s * (0.35 + 0.9 * t));
  const l2 = Math.min(0.78, Math.max(0.22, l + (t - 1) * 0.08));
  const rgb = hslToRgb(h, s2, l2);
  return (Math.round(rgb.r * 255) << 16) + (Math.round(rgb.g * 255) << 8) + Math.round(rgb.b * 255);
}

function hslToRgb(h, s, l) {
  if (s < 1e-6) return { r: l, g: l, b: l };
  const hue2rgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3),
    g: hue2rgb(p, q, h),
    b: hue2rgb(p, q, h - 1 / 3),
  };
}
