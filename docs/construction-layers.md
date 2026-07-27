# Construction System Layers

## Layer 1 — Mathematical construction data (source of truth)

- Module root: `src/engine/math/`
- Steps 0–2: `src/engine/math/steps0to2.js`
- Owns points, sphere centers, radii, construction history, per-object provenance.
- Coordinates are **outputs** of rules, never display parameters.
- Documents are deep-frozen after build.

## Layer 2 — Validation and discovery

- Steps 0–2 validator: `src/engine/validation/validateSteps0to2.js`
- Discovery Engine (`src/discovery/`) analyzes graphs built from construction data.
- **Must not** modify centers, radii, or parent relationships.

## Layer 3 — Rendering / display

- Adapter: `src/engine/display/DisplayAdapter.js`
- Renderer: `src/engine/renderer/` (meshes from data)
- Camera / overlays: `src/exploration/`, `src/main.js` scene transforms
- **Must not** contain construction logic (no intersections, no layout tables).
- **Must not** mutate Layer 1 documents.

## Current proven scope

Only Steps 0–2 (Vesica Piscis foundation) are covered by the Layer 1 builder and
`scripts/verify-steps-0-2.mjs`. Seed / Flower / Tree are out of scope until
Steps 0–2 remain green under these tests.
