# Construction Coordinate Audit

**Date:** 2026-07-25  
**Scope:** Every site that defines or transforms sphere centers, radii, Tree/Flower positions, or construction coordinates.  
**Method:** Static inventory of `src/engine`, `src/discovery`, `src/exploration`, `src/main.js`. No visual judgment.

---

## Classification key

| Label | Meaning |
|-------|---------|
| `mathematically_derived` | Computed from prior geometry by an explicit rule (intersection, ray∩circle, equal-radius compass) |
| `predefined_layout` | Coordinates taken from a named diagram / unit table (not constructed) |
| `approximate` | Uses tolerances, heuristics, or “looks close enough” filters |
| `hard_coded` | Literal numbers / free choices (origin, first ray axis, scale fractions) |
| `unknown` | Could not classify from code alone |

---

## Inventory

### Layer-ish construction (intended math)

| Location | What | Class | Mutates construction? |
|----------|------|-------|----------------------|
| `construction/kernel/ConstructionKernel.js` `PLACE_ORIGIN` | Center `(0,0,0)` | `hard_coded` (origin convention) | Adds points |
| `construction/kernel/ConstructionKernel.js` `DRAW_SPHERE` | Sphere at point, `radius = state.radius` | `mathematically_derived` (equal compass) | Adds spheres |
| `construction/kernel/ConstructionKernel.js` ray/circle rules | New centers from intersections | `mathematically_derived` | Adds points |
| `construction/compass.js` | Equal-radius ∩, ray∩circle (XY) | `mathematically_derived` | No |
| `kernel/sequences/seedOfLife.js` | Seed rules; first direction `[1,0,0]` | derived + `hard_coded` free ray | No (rules only) |
| `kernel/sequences/flowerOfLife.js` | Mid-ring √3r, tips 2r via rules | `mathematically_derived` | No |
| `kernel/sequences/fruitOfLife.js` | Fruit 13 via Seed + mid-ring ∩ | `mathematically_derived` | No |
| `generators/seedOfLife.js` | Rebuild from Seed rules | `mathematically_derived` | No |
| `generators/flowerOfLife.js` | Rebuild full 19 from rules | `mathematically_derived` | No |
| `seedOfLifePlan.js` | Plans from kernel rebuild | `mathematically_derived` | No |
| `applyPlan.js` | Copies `op.point` / `op.radius` into data | passthrough of baked plan outputs | No |

### Predefined / diagram layouts (not constructed)

| Location | What | Class | Mutates construction? |
|----------|------|-------|----------------------|
| `treeOfLife/layout.js` Kircher/Hermetic/Lurianic | Unit Sephirot `(x,y,z)` tables | `predefined_layout` | No |
| `treeOfLife/graph.js` + `buildTreeLayout` | Centroid + scale unit layout to `radius` | derived **from** predefined | No |
| `generators/treeOfLife.js` | Emits Sephirot from graph | `predefined_layout` + scale | No |
| `construction/treeOfLifePlan.js` | Places Sephirot at graph coords | `predefined_layout` | No |
| `generators/merkaba.js` / `merkabaPlan.js` | Dual-tetra vertices `±s` with `s=0.75r` | `hard_coded` formula | No |
| `generators/tesseract.js` / `tesseractPlan.js` | 4D→3D projection scale `0.7r` | `hard_coded` formula | No |

### Approximate / mixed

| Location | What | Class | Mutates construction? |
|----------|------|-------|----------------------|
| `ConstructionKernel.toConstructionData` neighbor edges | Connect if `\|d−r\| ≤ 0.05r` | `approximate` | No (export only) |
| `treeOfLife/geometricLayout.js` FoL overlay | Seed packing **translated** to Tiphereth | derived + **post-construction translate** | No (overlay only; Sephirot unchanged) |
| `treeOfLife/geometricLayout.js` symmetry axes | Extent `×1.15`, axes through origin / Tiphereth.y | `hard_coded` / approximate | No |
| `evolution/stages/earlySeed.js` | Filters/rewrites exported kernel data for narrative steps | passthrough + **mutation of export** | Yes (filters arrays) |
| `evolution/stages/flowerFruit.js` | Rewrites `step` on Flower data | mutation of export meta | Yes |
| `evolution/stages/metatronPlatonics.js` | Platonics from Fruit distance; comment claims `2R` but Fruit outer is `r√3` | derived + **wrong documentation** | Builds new data |
| `discovery/**` | Analysis tolerances (`~0.08×radius`) | `approximate` (analysis only) | No |

### Display only (must not define construction)

| Location | What | Class | Mutates construction? |
|----------|------|-------|----------------------|
| `renderer/GeometryRenderer.js` | `mesh.position.set(p.x,p.y,p.z)`; mesh radius = `spec.radius` | display passthrough | **No** |
| `renderer/primitives.js` | Mesh tessellation from radius | display | No |
| `renderer/primitives.js` `createCircleArcTubeXY` | Always XY plane; ignores `CircleSpec.normal` | display constraint | No |
| `exploration/*` | Overlays/focus/measure/camera | display | No |
| `main.js` `designGroup.rotation` | Scene rotation animation | display | No (arrays untouched) |
| `main.js` default `radius: 1.2` | UI parameter into generators | `hard_coded` default | Regenerates new data |

---

## Cross-checks (root-cause checklist)

| Question | Finding |
|----------|---------|
| All spheres same radius? | Kernel draws all with `state.radius`. Tree Sephirot use `sephiraRadius` or median path length — **different radius system**. |
| Second center exactly one radius from first? | Kernel Vesica: `dist((0,0,0),(R,0,0)) = R` when rebuilt in isolation. **Not locked by a dedicated Steps 0–2 test suite with full sphere provenance.** |
| Coordinate scaling applied more than once? | Tree: unit → world scale once in `buildTreeLayout`. Kernel: no post-scale. **No double-scale found for Vesica.** |
| Geometry translated after construction? | FoL overlay translated onto Tiphereth. Evolution stages filter/rewrite exports. **Vesica kernel centers not translated.** |
| Display coords ≠ construction coords? | Same numbers; only Three.js group rotation/camera. |
| Tree mixed with Flower? | Overlay mixes Seed packing with Kircher Tree for display. Sephirot positions remain Kircher (`predefined_layout`). |
| 2D misread as 3D? | Construction is XY (`z=0`). Circles forced to XY in renderer. Spatial Tree is planar spheres. |
| Renderer changes geometry? | **No.** Renderer reads centers/radii; does not write ConstructionData. |

---

## Root cause (Steps 2+)

**Primary:** There is no isolated, proven Layer-1 primitive for Steps 0–2. Vesica math is embedded inside the full Seed rule list and re-exported through evolution filters, plans that bake coordinates into operations, and generators that immediately continue to later centers. Sphere records omit required provenance (`center`, `constructionStep`, `parents`, `rule`, `validationStatus`), so the pipeline cannot *prove* Step 2 before building Step 3+.

**Contributing:**

1. **Multiple sources of truth** — kernel rules, baked plan `op.point`, Tree unit tables, evolution snapshots.  
2. **Step numbering mismatch** — user Step 0 = point; ConstructionPlayer/UI often treat first sphere as step 1 and snap past the bare point.  
3. ~~**Flower plan (13) ≠ Flower generator (19)**~~ — **resolved:** both use `buildFlowerOfLifeRules()` (19). The 13-circle stage is a step filter of that history.  
4. **Tree remains `predefined_layout`** while Flower is rule-derived — later stages can blend systems.  
5. **Approximate edge/discovery tolerances** can hide distance errors downstream.

**Not the primary Vesica bug:** Renderer mutation, double-scaling of Seed/Vesica centers, or camera/overlays rewriting construction arrays — those were checked and are display-only.

---

## Required fix scope (this change)

Per instructions: **fix and prove only Steps 0–2**.  
Do not “correct” Seed / Flower / Tree layouts by eye. Lock Vesica with automated tests first.
