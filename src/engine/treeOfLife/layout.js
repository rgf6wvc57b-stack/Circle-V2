/**
 * Tree of Life layout variants — pure mathematical coordinates.
 * Future Hermetic / Lurianic / custom systems register here without
 * touching the Discovery Engine or renderer.
 */

/** @typedef {{ id: string, label: string, number: number, x: number, y: number, z: number }} SephirahDef */
/** @typedef {{ id: string, from: string, to: string, label: string, letter?: string, number: number }} PathDef */

/**
 * Traditional Kircher (Golden Dawn) planar arrangement in unit space.
 * Pillars: Severity (−x), Middle (0), Mercy (+x). Y increases upward.
 * Coordinates are relative; {@link buildTreeLayout} centers and scales them.
 */
export function kircherUnitSephirot() {
  /**
   * Classical Kircher / Golden Dawn proportions (unit space).
   * Pillars: Severity (−x), Middle (0), Mercy (+x). Y increases toward Kether.
   */
  /** @type {SephirahDef[]} */
  return [
    { id: "kether", label: "Kether", number: 1, x: 0, y: 6, z: 0 },
    { id: "chokmah", label: "Chokmah", number: 2, x: 2, y: 5, z: 0 },
    { id: "binah", label: "Binah", number: 3, x: -2, y: 5, z: 0 },
    { id: "chesed", label: "Chesed", number: 4, x: 3, y: 3, z: 0 },
    { id: "geburah", label: "Geburah", number: 5, x: -3, y: 3, z: 0 },
    { id: "tiphereth", label: "Tiphereth", number: 6, x: 0, y: 2, z: 0 },
    { id: "netzach", label: "Netzach", number: 7, x: 3, y: 0, z: 0 },
    { id: "hod", label: "Hod", number: 8, x: -3, y: 0, z: 0 },
    { id: "yesod", label: "Yesod", number: 9, x: 0, y: -1, z: 0 },
    { id: "malkuth", label: "Malkuth", number: 10, x: 0, y: -3, z: 0 },
  ];
}

/**
 * Hermetic variant — slightly wider pillars, Da'ath gap emphasized
 * (Da'ath is not a Sephirah; layout leaves the gap empty).
 */
export function hermeticUnitSephirot() {
  /** @type {SephirahDef[]} */
  return [
    { id: "kether", label: "Kether", number: 1, x: 0, y: 4.2, z: 0 },
    { id: "chokmah", label: "Chokmah", number: 2, x: 1.35, y: 3.15, z: 0 },
    { id: "binah", label: "Binah", number: 3, x: -1.35, y: 3.15, z: 0 },
    { id: "chesed", label: "Chesed", number: 4, x: 1.6, y: 1.9, z: 0 },
    { id: "geburah", label: "Geburah", number: 5, x: -1.6, y: 1.9, z: 0 },
    { id: "tiphereth", label: "Tiphereth", number: 6, x: 0, y: 1.05, z: 0 },
    { id: "netzach", label: "Netzach", number: 7, x: 1.6, y: 0, z: 0 },
    { id: "hod", label: "Hod", number: 8, x: -1.6, y: 0, z: 0 },
    { id: "yesod", label: "Yesod", number: 9, x: 0, y: -0.95, z: 0 },
    { id: "malkuth", label: "Malkuth", number: 10, x: 0, y: -2.5, z: 0 },
  ];
}

/**
 * Lurianic-inspired vertical compression of the lower worlds.
 */
export function lurianicUnitSephirot() {
  /** @type {SephirahDef[]} */
  return [
    { id: "kether", label: "Kether", number: 1, x: 0, y: 3.6, z: 0 },
    { id: "chokmah", label: "Chokmah", number: 2, x: 1.1, y: 2.7, z: 0 },
    { id: "binah", label: "Binah", number: 3, x: -1.1, y: 2.7, z: 0 },
    { id: "chesed", label: "Chesed", number: 4, x: 1.35, y: 1.7, z: 0 },
    { id: "geburah", label: "Geburah", number: 5, x: -1.35, y: 1.7, z: 0 },
    { id: "tiphereth", label: "Tiphereth", number: 6, x: 0, y: 0.85, z: 0 },
    { id: "netzach", label: "Netzach", number: 7, x: 1.35, y: -0.15, z: 0 },
    { id: "hod", label: "Hod", number: 8, x: -1.35, y: -0.15, z: 0 },
    { id: "yesod", label: "Yesod", number: 9, x: 0, y: -1.15, z: 0 },
    { id: "malkuth", label: "Malkuth", number: 10, x: 0, y: -2.7, z: 0 },
  ];
}

/** Hebrew letters for the 22 paths (Aleph–Tav), traditional ordering on the Kircher tree. */
const PATH_LETTERS = [
  "Aleph",
  "Beth",
  "Gimel",
  "Daleth",
  "Heh",
  "Vav",
  "Zain",
  "Cheth",
  "Teth",
  "Yod",
  "Kaph",
  "Lamed",
  "Mem",
  "Nun",
  "Samekh",
  "Ayin",
  "Peh",
  "Tzaddi",
  "Qoph",
  "Resh",
  "Shin",
  "Tav",
];

/**
 * Traditional 22 connecting paths (Kircher arrangement).
 * Order matches common path numbering 1–22.
 */
export function traditionalPaths() {
  const pairs = [
    ["kether", "chokmah"],
    ["kether", "binah"],
    ["kether", "tiphereth"],
    ["chokmah", "binah"],
    ["chokmah", "tiphereth"],
    ["chokmah", "chesed"],
    ["binah", "tiphereth"],
    ["binah", "geburah"],
    ["chesed", "geburah"],
    ["chesed", "tiphereth"],
    ["chesed", "netzach"],
    ["geburah", "tiphereth"],
    ["geburah", "hod"],
    ["tiphereth", "netzach"],
    ["tiphereth", "hod"],
    ["tiphereth", "yesod"],
    ["netzach", "hod"],
    ["netzach", "yesod"],
    ["netzach", "malkuth"],
    ["hod", "yesod"],
    ["hod", "malkuth"],
    ["yesod", "malkuth"],
  ];

  /** @type {PathDef[]} */
  return pairs.map(([from, to], i) => ({
    id: `path-${i + 1}`,
    from,
    to,
    number: i + 1,
    letter: PATH_LETTERS[i],
    label: `${PATH_LETTERS[i]} (${i + 1})`,
  }));
}

const VARIANT_BUILDERS = {
  kircher: kircherUnitSephirot,
  hermetic: hermeticUnitSephirot,
  lurianic: lurianicUnitSephirot,
};

export function listTreeOfLifeVariants() {
  return Object.keys(VARIANT_BUILDERS);
}

/**
 * Build a centered, radius-scaled Tree of Life layout.
 * Geometric centroid is the world origin (pivot for orbit / framing).
 *
 * @param {number} radius Overall construction radius (layout + sephira scale reference)
 * @param {{ variant?: string, sephiraRadiusRatio?: number }} [opts]
 */
export function buildTreeLayout(radius, opts = {}) {
  const variant = opts.variant ?? "kircher";
  const builder = VARIANT_BUILDERS[variant];
  if (!builder) {
    throw new Error(`Unknown Tree of Life variant: ${variant}`);
  }

  const unit = builder();
  if (unit.length !== 10) {
    throw new Error(`Tree of Life variant "${variant}" must define exactly 10 Sephirot`);
  }

  const cx = unit.reduce((s, p) => s + p.x, 0) / unit.length;
  const cy = unit.reduce((s, p) => s + p.y, 0) / unit.length;
  const cz = unit.reduce((s, p) => s + p.z, 0) / unit.length;

  const centered = unit.map((p) => ({
    ...p,
    x: p.x - cx,
    y: p.y - cy,
    z: p.z - cz,
  }));

  const maxDist = Math.max(...centered.map((p) => Math.hypot(p.x, p.y, p.z)), 1e-9);
  // Fit tree so farthest Sephirah lies near `radius` from origin
  const scale = radius / maxDist;

  const sephirot = centered.map((p) => ({
    id: p.id,
    label: p.label,
    number: p.number,
    x: p.x * scale,
    y: p.y * scale,
    z: p.z * scale,
  }));

  const sephiraRadiusRatio = opts.sephiraRadiusRatio ?? 0.2;
  const sephiraRadius = radius * sephiraRadiusRatio;
  const paths = traditionalPaths();

  return {
    variant,
    sephirot,
    paths,
    sephiraRadius,
    origin: { x: 0, y: 0, z: 0 },
    scale,
  };
}
