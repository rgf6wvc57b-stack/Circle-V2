# Circle

Mathematical construction engine for sacred geometry.

## Live app

Deployment in progress.

> If that URL 404s, enable Pages once:  
> [Repository Settings → Pages](https://github.com/rgf6wvc57b-stack/-Geometry-Explor/settings/pages) →  
> **Deploy from a branch** → Branch **`gh-pages`** / folder **`/` (root)** → Save.  
> Or choose **GitHub Actions** as the source, then re-run the **Deploy GitHub Pages** workflow.

## Architecture

1. **Geometry Generator** — pure math (`points`, `sphereCenters`, `circleCenters`, `edges`, `faces`)
2. **Construction System** — reveals objects by Construction Step (no nesting/scaling)
3. **Renderer** — independent layers (spheres, circles, points, connections) drawn from the same data, in any combination

Changing the renderer never recalculates geometry.

## Seed of Life

- Center at the origin
- Six surrounding points at distance `r` and angles 0°–300°
- Steps 1–7 reveal the construction sequentially

## Run locally

```bash
npm install
npm run dev
```

Production build (GitHub Pages base path `/-Geometry-Explor/`):

```bash
npm run build
npm run preview
```
