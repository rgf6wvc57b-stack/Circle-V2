# Regression Audit — 2026-07-25 (updated)

## Stable commit

**`c6a9faa`** — last known good before Emergent Tree.

## Important correction

PR #12 (**Emergent Tree**) was merged to `main` as **`c82d7cb`**.  
An earlier restore branch that only added audit/test files on top of `c6a9faa` would **not** remove Emergent when merged into `main`.

## Actual restore

This branch contains:

```
git revert -m 1 c82d7cb
```

(`2618994`) which removes Emergent Tree from the tip of `main` when this PR merges.

### Files reverted / deleted by that revert

| Path | Change |
|------|--------|
| `index.html` | Emergent option / UI removed |
| `src/main.js` | Emergent wiring removed |
| `src/engine/treeOfLife/emergent.js` | **deleted** |
| `src/engine/treeOfLife/modes.js` | Emergent mode removed |
| `src/engine/generators/treeOfLife.js` | Emergent dispatch removed |
| `src/engine/construction/treeOfLifePlan.js` | Emergent plan path removed |
| `scripts/verify-emergent-tree.mjs` | **deleted** |

### Compare vs `c6a9faa`

```bash
git diff --stat c6a9faa...HEAD -- index.html src/
# (empty — app source matches stable)
```

Only additions on top of that match: this audit and `scripts/browser-regression.mjs`.

## Emergent presence checklist (all confirmed absent)

| Path | Status |
|------|--------|
| `index.html` | no "emergent" |
| `src/main.js` | no Emergent |
| `src/engine/treeOfLife/emergent.js` | file missing |
| `src/engine/treeOfLife/modes.js` | no EMERGENT |
| `src/engine/generators/treeOfLife.js` | no Emergent |
| `src/engine/construction/treeOfLifePlan.js` | no Emergent |

## Browser tests (Chrome + SwiftShader)

Command:

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
PORT=4173 node scripts/browser-regression.mjs
```

Result: **PASS 52 | FAIL 0** (headless Chrome with `--use-gl=angle --use-angle=swiftshader`).

See PR description / agent report for the per-feature matrix.

## Node proofs

```bash
node scripts/verify-steps-0-2.mjs   # PASS
npm run build                      # PASS
```

## Merge stance

Do **not** treat this as “stable / ready to merge” solely from Node scripts. Browser matrix was run in this environment; human confirmation on a GPU desktop browser is still recommended before merge.
