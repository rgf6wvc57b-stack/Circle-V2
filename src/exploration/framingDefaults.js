/**
 * Default camera fit policy — display only (does not move geometry).
 *
 * Object screen height ≈ 1 / (FIT_DISTANCE_SCALE * (1 + 2 * DEFAULT_FIT_MARGIN))
 * of the usable viewport when height-limited. With the defaults below that is
 * roughly 20–22% for simple constructions (Vesica / single sphere).
 */

/** Previous default was 0.13 (~76% of view). */
export const DEFAULT_FIT_MARGIN = 1.75;

/** Extra distance pad after FOV fit (previous 1.05). */
export const FIT_DISTANCE_SCALE = 1.08;

/**
 * Minimum world-space extent used when fitting (max box dimension floor).
 * Prevents a tiny / single-sphere construction from filling the screen.
 * Previous floor was 0.5. 2.4 ≈ diameter of the default radius-1.2 sphere.
 */
export const MIN_FRAMING_SIZE = 2.4;

/**
 * Minimum orbit distance after a fit (previous effective min was ~FOV fit only;
 * OrbitControls.minDistance remains the user zoom floor at 0.8).
 */
export const MIN_CAMERA_DISTANCE = 10;

/** Default look direction for Reset View / initial frame. */
export const DEFAULT_FRAME_DIRECTION = Object.freeze({ x: 0.35, y: 0.28, z: 1 });

/** Face-on look direction — construction plane normal toward the camera. */
export const FRONT_FRAME_DIRECTION = Object.freeze({ x: 0, y: 0, z: 1 });

/**
 * Mobile tutorial fit margin — targets ~28–38% of the usable geometry area
 * (above the bottom sheet + tutorial card) for Flower of Life face-on.
 */
export const MOBILE_TUTORIAL_FIT_MARGIN = 1.15;

/**
 * Extra minimum orbit distance while the phone tutorial is framing into the
 * short band above the sheet. Prevents MIN_CAMERA_DISTANCE (10) from filling
 * a ~200px-tall usable rect.
 */
export const MOBILE_TUTORIAL_MIN_DISTANCE = 16;

/**
 * Volumetric 3D Tree — target ~70–80% of the shorter usable viewport axis.
 * Object screen span ≈ 1 / (VOLUMETRIC_FIT_DISTANCE_SCALE * (1 + 2 * margin)).
 */
export const VOLUMETRIC_FIT_MARGIN = 0.08;

/** Tight distance pad for volumetric framing (previous global 1.08). */
export const VOLUMETRIC_FIT_DISTANCE_SCALE = 1.02;

/** Use actual geometry extent — do not inflate small 3D trees via MIN_FRAMING_SIZE. */
export const VOLUMETRIC_MIN_FRAMING_SIZE = 0.5;

/** Orbit floor for volumetric fit — below calm Vesica MIN_CAMERA_DISTANCE (10). */
export const VOLUMETRIC_MIN_CAMERA_DISTANCE = 0.8;
