# AGENTS.md

## Cursor Cloud specific instructions

### What this is
`Circle` (a.k.a. Geometry Explorer) is a 100% client-side static web app built with Vite + three.js. There is no backend, database, or API server. The single dev service is the Vite dev server.

### Run / build (see `package.json` scripts)
- Dev server: `npm run dev` → serves on `http://0.0.0.0:5173` (Vite, hot reload).
- Production build: `npm run build` (outputs `dist/`), preview with `npm run preview` (also port 5173).
- `vite.config.js` sets `base: "/"`.

### Testing notes (non-obvious)
The `test:*` scripts split into two kinds:
- Pure-Node math/DOM-string checks (no browser): currently passing ones include `test:flower`, `test:framing`, `test:framing-calm`, `test:concentric-shells`, `test:menu`.
- Browser regression scripts using `puppeteer-core` + Chrome at `/usr/bin/google-chrome-stable` (each spawns its own `npm run build` + `vite preview`). puppeteer-core is auto-installed by the scripts via `npm install --no-save` on first run.

Known pre-existing drift (NOT an environment problem — do not "fix" via env setup):
- Browser scripts (`test:tutorial`, `test:tutorial-mobile`, `test:render-layers`, `test:render-layer-styles`, `test:renderer-dropdown`, `test:construction-plane`, `test:endless`, `test:framing-screen`) block on `window.__geometryExplor`, a test hook the current source never assigns, so they time out.
- Some pure-Node scripts (`test:intro`, `test:ui-cleanup`, `test:dark-bg`) assert a desired UI/source state the current committed code does not match, so they report failing assertions.
- Browser scripts default `BASE_PATH=/-Geometry-Explor/` even though `vite.config.js` uses `base: "/"`; the base-path mismatch is not what causes the failures above (the missing `window.__geometryExplor` hook is), but be aware of it.

### Manual verification
The reliable end-to-end check is manual in a browser: `npm run dev`, open `http://localhost:5173/`, pick a Geometry (e.g. Flower of Life), enable Construction Mode, and drag the Construction Step slider to reveal the figure step by step; drag on the canvas to orbit the 3D scene.
