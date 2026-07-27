import { pointMap, distance3 } from "../engine/schema.js";
import { intersectCirclesEqualRadius, nearlyEqual, dist as dist2 } from "../engine/construction/compass.js";

const PHI = (1 + Math.sqrt(5)) / 2;
const EPS_REL = 0.04;

/**
 * @param {import('../engine/schema.js').ConstructionData} data
 * @param {{ step?: number, maxStep?: number }} ctx
 */
export function fingerprintData(data, ctx = {}) {
  if (!data) return "empty";
  const parts = [
    data.id,
    data.radius,
    data.points.length,
    data.sphereCenters.length,
    data.circleCenters.length,
    data.edges.length,
    ctx.step ?? "",
    ctx.maxStep ?? "",
    data.points.map((p) => `${p.id}:${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`).join("|"),
    data.sphereCenters.map((s) => `${s.id}:${s.pointId}:${s.radius}`).join("|"),
  ];
  return parts.join(";;");
}

function close(a, b, rel = EPS_REL, abs = 1e-4) {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) <= Math.max(abs, rel * scale);
}

function angleOf(p, origin) {
  return Math.atan2(p.y - origin.y, p.x - origin.x);
}

function normalizeAngle(a) {
  let x = a;
  while (x <= -Math.PI) x += Math.PI * 2;
  while (x > Math.PI) x -= Math.PI * 2;
  return x;
}

function confidenceFromError(err, tol) {
  const c = 1 - Math.min(1, err / Math.max(tol, 1e-9));
  return Math.round(Math.max(0.05, c) * 100) / 100;
}

/**
 * Resolve sphere/circle specs to world centers.
 * @param {import('../engine/schema.js').ConstructionData} data
 */
function resolveCircles(data) {
  const points = pointMap(data);
  const specs = data.sphereCenters.length ? data.sphereCenters : data.circleCenters;
  return specs
    .map((spec) => {
      const p = points.get(spec.pointId);
      if (!p) return null;
      return {
        specId: spec.id,
        pointId: spec.pointId,
        radius: spec.radius,
        x: p.x,
        y: p.y,
        z: p.z,
        step: p.step ?? 1,
        label: p.label || p.id,
      };
    })
    .filter(Boolean);
}

function constructionOrigin(circles) {
  const origin = circles.find((c) => close(c.x, 0) && close(c.y, 0) && close(c.z, 0));
  if (origin) return origin;
  if (!circles.length) return { x: 0, y: 0, z: 0 };
  const sx = circles.reduce((s, c) => s + c.x, 0) / circles.length;
  const sy = circles.reduce((s, c) => s + c.y, 0) / circles.length;
  const sz = circles.reduce((s, c) => s + c.z, 0) / circles.length;
  return { x: sx, y: sy, z: sz };
}

/**
 * All equal-radius circle intersections with provenance.
 */
export function computeIntersections(data) {
  const circles = resolveCircles(data);
  const hits = [];
  const seen = [];

  for (let i = 0; i < circles.length; i += 1) {
    for (let j = i + 1; j < circles.length; j += 1) {
      const a = circles[i];
      const b = circles[j];
      if (!close(a.radius, b.radius, 0.02)) continue;
      const pts = intersectCirclesEqualRadius(a, b, a.radius);
      pts.forEach((p, k) => {
        const dup = seen.find((s) => dist2(s, p) < a.radius * 0.02);
        if (dup) {
          dup.parents.add(a.specId);
          dup.parents.add(b.specId);
          dup.parentCircles.add(a);
          dup.parentCircles.add(b);
          dup.firstStep = Math.min(dup.firstStep, Math.max(a.step, b.step));
          return;
        }
        const entry = {
          id: `ix-${hits.length}`,
          x: p.x,
          y: p.y,
          z: p.z,
          parents: new Set([a.specId, b.specId]),
          parentCircles: new Set([a, b]),
          firstStep: Math.max(a.step, b.step),
          pairKey: `${a.specId}|${b.specId}|${k}`,
        };
        seen.push(entry);
        hits.push(entry);
      });
    }
  }

  return hits.map((h) => ({
    id: h.id,
    x: h.x,
    y: h.y,
    z: h.z,
    parentIds: [...h.parents],
    parents: [...h.parentCircles].map((c) => ({
      specId: c.specId,
      pointId: c.pointId,
      label: c.label,
      radius: c.radius,
      center: { x: c.x, y: c.y, z: c.z },
    })),
    firstStep: h.firstStep,
  }));
}

function detectVesica(circles) {
  const out = [];
  for (let i = 0; i < circles.length; i += 1) {
    for (let j = i + 1; j < circles.length; j += 1) {
      const a = circles[i];
      const b = circles[j];
      if (!close(a.radius, b.radius, 0.02)) continue;
      const d = distance3(a, b);
      const r = (a.radius + b.radius) / 2;
      if (d < r * 0.15 || d > r * 1.85) continue;
      // Classic vesica: centers one radius apart
      const err = Math.abs(d - r) / r;
      if (err > 0.12) continue;
      const conf = confidenceFromError(err, 0.12);
      const lens = intersectCirclesEqualRadius(a, b, r);
      out.push({
        id: `vesica-${out.length + 1}`,
        type: "vesicaPiscis",
        title: `Vesica Piscis #${out.length + 1}`,
        confidence: conf,
        reasoning: `Equal-radius circles (${a.label}, ${b.label}) with center distance ${d.toFixed(4)} ≈ radius ${r.toFixed(4)} (error ${(err * 100).toFixed(1)}%). The shared lens is the vesica piscis.`,
        payload: {
          a,
          b,
          distance: d,
          radius: r,
          lensPoints: lens,
        },
      });
    }
  }
  return out;
}

function detectEquilateral(circles) {
  const out = [];
  const n = circles.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const dij = distance3(circles[i], circles[j]);
      if (dij < 1e-6) continue;
      for (let k = j + 1; k < n; k += 1) {
        const dik = distance3(circles[i], circles[k]);
        const djk = distance3(circles[j], circles[k]);
        const mean = (dij + dik + djk) / 3;
        const err =
          (Math.abs(dij - mean) + Math.abs(dik - mean) + Math.abs(djk - mean)) / (3 * mean);
        if (err > 0.06) continue;
        out.push({
          id: `eqtri-${out.length + 1}`,
          type: "equilateralTriangle",
          title: `Equilateral Triangle #${out.length + 1}`,
          confidence: confidenceFromError(err, 0.06),
          reasoning: `Centers ${circles[i].label}, ${circles[j].label}, ${circles[k].label} form equal sides ≈ ${mean.toFixed(4)} (relative variance ${(err * 100).toFixed(1)}%).`,
          payload: {
            points: [circles[i], circles[j], circles[k]],
            side: mean,
          },
        });
      }
    }
  }
  return out;
}

function detectHexagons(circles, origin) {
  const out = [];
  // Rings of 6 around a hub at distance ≈ hub.radius (or common r)
  circles.forEach((hub) => {
    const r = hub.radius;
    const ring = circles
      .filter((c) => c.specId !== hub.specId)
      .map((c) => ({ c, d: distance3(hub, c) }))
      .filter(({ d }) => close(d, r, 0.08));
    if (ring.length < 6) return;

    // Cluster by angle and pick 6 evenly spaced
    ring.sort((a, b) => angleOf(a.c, hub) - angleOf(b.c, hub));
    // Greedy: take points near 60° spacing
    const picked = [];
    const used = new Set();
    for (let slot = 0; slot < 6; slot += 1) {
      const target = -Math.PI + (slot * Math.PI) / 3 + Math.PI; // 0..5 * 60° from first
      let best = null;
      let bestErr = Infinity;
      ring.forEach(({ c, d }, idx) => {
        if (used.has(idx)) return;
        // relative to first candidate angle
        const ang = angleOf(c, hub);
        // We'll refine after picking first
        best = best ?? { c, d, idx, ang };
      });
      if (!best) return;
    }

    // Better approach: find 6 with mutual angular spacing ~60°
    if (ring.length >= 6) {
      const candidates = ring.map(({ c, d }) => ({ c, d, ang: angleOf(c, hub) }));
      candidates.sort((a, b) => a.ang - b.ang);
      // Try each starting index
      for (let start = 0; start < candidates.length; start += 1) {
        const seq = [];
        let ok = true;
        let errSum = 0;
        for (let s = 0; s < 6; s += 1) {
          const targetAng = candidates[start].ang + (s * Math.PI) / 3;
          let best = null;
          let bestErr = Infinity;
          candidates.forEach((cand) => {
            if (seq.some((q) => q.c.specId === cand.c.specId)) return;
            let da = normalizeAngle(cand.ang - targetAng);
            const err = Math.abs(da);
            if (err < bestErr) {
              bestErr = err;
              best = cand;
            }
          });
          if (!best || bestErr > 0.25) {
            ok = false;
            break;
          }
          errSum += bestErr;
          seq.push(best);
        }
        if (!ok) continue;
        const meanErr = errSum / 6;
        const conf = confidenceFromError(meanErr, 0.25);
        // Avoid duplicates
        const key = seq
          .map((s) => s.c.specId)
          .sort()
          .join(",");
        if (out.some((o) => o.payload.key === key)) continue;
        out.push({
          id: `hex-${out.length + 1}`,
          type: "hexagon",
          title: out.length === 0 ? "Hexagon" : `Hexagon #${out.length + 1}`,
          confidence: conf,
          reasoning: `Six centers lie on a circle of radius ≈ ${r.toFixed(4)} around ${hub.label}, spaced near 60° (mean angular error ${((meanErr * 180) / Math.PI).toFixed(1)}°).`,
          payload: {
            hub,
            vertices: seq.map((s) => s.c),
            key,
            radius: r,
          },
        });
        break;
      }
    }
  });

  // Also: hex ring without requiring hub if 6 points form regular hex
  if (out.length === 0 && circles.length >= 6) {
    const around = circles.filter((c) => distance3(c, origin) > 1e-6);
    // skip complex fallback
  }

  return out;
}

function detectNFoldSymmetry(circles, origin, order, type, title) {
  if (circles.length < order) return [];
  const angle = (Math.PI * 2) / order;
  let totalErr = 0;
  let checks = 0;
  const unmatched = [];

  circles.forEach((c) => {
    const dx = c.x - origin.x;
    const dy = c.y - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-8) return; // center fixed
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const rx = origin.x + dx * ca - dy * sa;
    const ry = origin.y + dx * sa + dy * ca;
    let best = Infinity;
    circles.forEach((o) => {
      const e = Math.hypot(o.x - rx, o.y - ry, o.z - c.z);
      if (e < best) best = e;
    });
    const tol = Math.max(c.radius * 0.08, 0.05);
    totalErr += best / tol;
    checks += 1;
    if (best > tol) unmatched.push(c.label);
  });

  if (checks < order) return [];
  const meanErr = totalErr / checks;
  if (meanErr > 1.2) return [];
  const conf = confidenceFromError(meanErr, 1.2);
  return [
    {
      id: `${type}-1`,
      type,
      title,
      confidence: conf,
      reasoning: `Rotation by ${360 / order}° about (${origin.x.toFixed(3)}, ${origin.y.toFixed(3)}) maps centers onto centers (mean normalized error ${meanErr.toFixed(2)}). ${unmatched.length ? `Weak matches: ${unmatched.slice(0, 3).join(", ")}.` : "All peripheral centers close under the orbit."}`,
      payload: {
        order,
        origin: { ...origin },
        angle,
      },
    },
  ];
}

function detectGoldenRatio(circles, data) {
  const out = [];
  const dists = [];
  for (let i = 0; i < circles.length; i += 1) {
    for (let j = i + 1; j < circles.length; j += 1) {
      const d = distance3(circles[i], circles[j]);
      if (d > 1e-6) dists.push({ d, a: circles[i], b: circles[j] });
    }
  }
  dists.sort((a, b) => a.d - b.d);
  for (let i = 0; i < dists.length; i += 1) {
    for (let j = i + 1; j < dists.length; j += 1) {
      const lo = dists[i].d;
      const hi = dists[j].d;
      const ratio = hi / lo;
      const err = Math.abs(ratio - PHI) / PHI;
      if (err > 0.04) continue;
      out.push({
        id: `phi-${out.length + 1}`,
        type: "goldenRatio",
        title: `Golden Ratio #${out.length + 1}`,
        confidence: confidenceFromError(err, 0.04),
        reasoning: `Distance ${hi.toFixed(4)} / ${lo.toFixed(4)} = ${ratio.toFixed(4)} ≈ φ (${PHI.toFixed(4)}). Segments: ${dists[i].a.label}–${dists[i].b.label} and ${dists[j].a.label}–${dists[j].b.label}.`,
        payload: {
          short: dists[i],
          long: dists[j],
          ratio,
          phi: PHI,
        },
      });
      if (out.length >= 8) return out;
    }
  }
  // Radius-based: diameter vs radius is 2, not phi — also check radius vs distance to ring2
  const r = data.radius;
  dists.forEach(({ d, a, b }) => {
    const ratio = d / r;
    const err = Math.abs(ratio - PHI) / PHI;
    if (err > 0.04) return;
    if (out.some((o) => o.payload.usesRadius && close(o.payload.d, d))) return;
    out.push({
      id: `phi-${out.length + 1}`,
      type: "goldenRatio",
      title: `Golden Ratio #${out.length + 1}`,
      confidence: confidenceFromError(err, 0.04),
      reasoning: `Center distance ${d.toFixed(4)} / radius ${r.toFixed(4)} = ${ratio.toFixed(4)} ≈ φ.`,
      payload: { d, a, b, ratio, phi: PHI, usesRadius: true },
    });
  });
  return out.slice(0, 10);
}

function detectTangencies(circles) {
  const out = [];
  for (let i = 0; i < circles.length; i += 1) {
    for (let j = i + 1; j < circles.length; j += 1) {
      const a = circles[i];
      const b = circles[j];
      const d = distance3(a, b);
      const ext = a.radius + b.radius;
      const inn = Math.abs(a.radius - b.radius);
      const errExt = Math.abs(d - ext) / Math.max(ext, 1e-6);
      const errInn = inn < 1e-6 ? Infinity : Math.abs(d - inn) / Math.max(inn, 1e-6);
      if (errExt <= 0.05) {
        out.push({
          id: `tan-${out.length + 1}`,
          type: "tangency",
          title: `Tangency #${out.length + 1}`,
          confidence: confidenceFromError(errExt, 0.05),
          reasoning: `External tangency: |c₁c₂| = ${d.toFixed(4)} ≈ r₁+r₂ = ${ext.toFixed(4)} (${a.label}, ${b.label}).`,
          payload: { a, b, kind: "external", distance: d, point: midpoint(a, b, a.radius / ext) },
        });
      } else if (errInn <= 0.05) {
        out.push({
          id: `tan-${out.length + 1}`,
          type: "tangency",
          title: `Tangency #${out.length + 1}`,
          confidence: confidenceFromError(errInn, 0.05),
          reasoning: `Internal tangency: |c₁c₂| = ${d.toFixed(4)} ≈ |r₁−r₂| = ${inn.toFixed(4)} (${a.label}, ${b.label}).`,
          payload: { a, b, kind: "internal", distance: d },
        });
      }
    }
  }
  return out;
}

function midpoint(a, b, t = 0.5) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function detectCoincidentCenters(circles) {
  const out = [];
  for (let i = 0; i < circles.length; i += 1) {
    for (let j = i + 1; j < circles.length; j += 1) {
      const d = distance3(circles[i], circles[j]);
      const tol = Math.max(circles[i].radius, circles[j].radius) * 0.02;
      if (d > tol) continue;
      out.push({
        id: `coin-${out.length + 1}`,
        type: "coincidentCenters",
        title: `Coincident Centers #${out.length + 1}`,
        confidence: confidenceFromError(d / Math.max(tol, 1e-9), 1),
        reasoning: `${circles[i].label} and ${circles[j].label} share nearly the same center (Δ = ${d.toFixed(5)}).`,
        payload: { a: circles[i], b: circles[j], distance: d },
      });
    }
  }
  return out;
}

function detectConcentric(circles) {
  const out = [];
  for (let i = 0; i < circles.length; i += 1) {
    for (let j = i + 1; j < circles.length; j += 1) {
      const a = circles[i];
      const b = circles[j];
      const d = distance3(a, b);
      const tol = Math.max(a.radius, b.radius) * 0.03;
      if (d > tol) continue;
      if (close(a.radius, b.radius, 0.02)) continue;
      out.push({
        id: `conc-${out.length + 1}`,
        type: "concentricCircles",
        title: `Concentric Circles #${out.length + 1}`,
        confidence: confidenceFromError(d / Math.max(tol, 1e-9), 1),
        reasoning: `${a.label} and ${b.label} share a center (Δ = ${d.toFixed(5)}) with distinct radii ${a.radius.toFixed(4)} and ${b.radius.toFixed(4)}.`,
        payload: { a, b },
      });
    }
  }
  return out;
}

function detectMidpoints(circles, intersections) {
  const out = [];
  // Intersection midpoints of vesica (radical axis midpoint)
  for (let i = 0; i < circles.length; i += 1) {
    for (let j = i + 1; j < circles.length; j += 1) {
      const a = circles[i];
      const b = circles[j];
      if (!close(a.radius, b.radius, 0.02)) continue;
      const d = distance3(a, b);
      // Allow up to ~2r so opposite equal-radius centers (midpoint at a shared center) are included.
      if (d < a.radius * 0.2 || d > a.radius * 2.05) continue;
      const mid = midpoint(a, b);
      // Is there a construction point near mid?
      const hit = intersections.find((ix) => dist2(ix, mid) < a.radius * 0.08);
      // Also check if any circle center is the midpoint
      const centerAtMid = circles.find(
        (c) => c.specId !== a.specId && c.specId !== b.specId && dist2(c, mid) < a.radius * 0.06
      );
      if (!centerAtMid && !hit) continue;
      out.push({
        id: `mid-${out.length + 1}`,
        type: "midpoint",
        title: `Midpoint #${out.length + 1}`,
        confidence: 0.9,
        reasoning: `Point (${mid.x.toFixed(4)}, ${mid.y.toFixed(4)}) is the midpoint of ${a.label}–${b.label}${centerAtMid ? ` and coincides with center ${centerAtMid.label}` : ""}.`,
        payload: { a, b, midpoint: mid, marker: centerAtMid || hit || mid },
      });
    }
  }
  return out.slice(0, 12);
}

function detectReflectionSymmetry(circles, origin) {
  const out = [];
  if (circles.length < 3) return out;
  // Candidate axes: through origin at angles of existing points, and every 15°
  const angles = new Set();
  circles.forEach((c) => {
    if (distance3(c, origin) > 1e-6) angles.add(angleOf(c, origin) / 2);
  });
  for (let k = 0; k < 12; k += 1) angles.add((k * Math.PI) / 12);

  const scored = [];
  angles.forEach((theta) => {
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    let errSum = 0;
    let n = 0;
    circles.forEach((c) => {
      const dx = c.x - origin.x;
      const dy = c.y - origin.y;
      const proj = dx * ux + dy * uy;
      const rx = origin.x + 2 * proj * ux - dx;
      const ry = origin.y + 2 * proj * uy - dy;
      let best = Infinity;
      circles.forEach((o) => {
        const e = Math.hypot(o.x - rx, o.y - ry);
        if (e < best) best = e;
      });
      const tol = Math.max(c.radius * 0.08, 0.05);
      errSum += best / tol;
      n += 1;
    });
    const mean = errSum / Math.max(n, 1);
    if (mean <= 1.0) {
      scored.push({ theta, mean });
    }
  });

  scored.sort((a, b) => a.mean - b.mean);
  // Dedup similar axes
  const kept = [];
  scored.forEach((s) => {
    if (kept.some((k) => Math.abs(normalizeAngle(2 * (k.theta - s.theta))) < 0.15)) return;
    kept.push(s);
  });

  kept.slice(0, 6).forEach((s, i) => {
    out.push({
      id: `refl-${i + 1}`,
      type: "reflectionSymmetry",
      title: i === 0 ? "Symmetry Axis" : `Symmetry Axis #${i + 1}`,
      confidence: confidenceFromError(s.mean, 1.0),
      reasoning: `Reflection across the line through (${origin.x.toFixed(3)}, ${origin.y.toFixed(3)}) at angle ${((s.theta * 180) / Math.PI).toFixed(1)}° maps centers onto centers.`,
      payload: {
        origin: { ...origin },
        angle: s.theta,
        axisLength: Math.max(...circles.map((c) => distance3(c, origin)), circles[0]?.radius ?? 1) * 2.4,
      },
    });
  });
  return out;
}

function detectRotationalSymmetry(circles, origin) {
  const out = [];
  [2, 3, 4, 5, 6, 8, 12].forEach((order) => {
    const found = detectNFoldSymmetry(
      circles,
      origin,
      order,
      "rotationalSymmetry",
      order === 6
        ? "Six-fold Symmetry"
        : order === 12
          ? "Twelve-fold Symmetry"
          : `Rotational Symmetry C${order}`
    );
    // Only keep strong ones; six/twelve are also emitted separately below
    if (found[0] && found[0].confidence >= 0.55 && order !== 6 && order !== 12) {
      found[0].id = `rot-${order}`;
      out.push(found[0]);
    }
  });
  return out;
}

function buildGraph(circles, discoveries, intersections) {
  const nodes = circles.map((c) => ({
    id: c.specId,
    pointId: c.pointId,
    label: c.label,
    x: c.x,
    y: c.y,
    z: c.z,
    radius: c.radius,
  }));
  const edgeKey = new Set();
  const edges = [];

  const addEdge = (a, b, kind, weight = 1) => {
    const key = [a, b].sort().join("|") + ":" + kind;
    if (edgeKey.has(key)) return;
    edgeKey.add(key);
    edges.push({ from: a, to: b, kind, weight });
  };

  discoveries.forEach((d) => {
    if (d.type === "vesicaPiscis") addEdge(d.payload.a.specId, d.payload.b.specId, "intersection", d.confidence);
    if (d.type === "tangency") addEdge(d.payload.a.specId, d.payload.b.specId, "tangency", d.confidence);
    if (d.type === "coincidentCenters") addEdge(d.payload.a.specId, d.payload.b.specId, "coincident", d.confidence);
    if (d.type === "concentricCircles") addEdge(d.payload.a.specId, d.payload.b.specId, "concentric", d.confidence);
  });

  intersections.forEach((ix) => {
    if (ix.parentIds.length >= 2) addEdge(ix.parentIds[0], ix.parentIds[1], "intersection", 0.8);
  });

  return { nodes, edges };
}

/**
 * Live mathematics summary for the Mathematics panel.
 */
export function computeMathematics(data, intersections, ctx = {}) {
  if (!data) {
    return {
      radius: 0,
      diameter: 0,
      circumference: 0,
      area: 0,
      volume: 0,
      centers: [],
      intersections: 0,
      euler: null,
      constructionDepth: 0,
      uniqueVertices: 0,
      circles: 0,
      spheres: 0,
    };
  }
  const r = data.radius;
  const V = data.points.length;
  const E = data.edges.length;
  const F = data.faces.length;
  // For planar cell complexes with faces, χ = V − E + (F+1) including outer face
  let euler = null;
  if (V > 0 && F > 0) {
    euler = V - E + F + 1;
  }

  return {
    radius: r,
    diameter: 2 * r,
    circumference: 2 * Math.PI * r,
    area: Math.PI * r * r,
    volume: (4 / 3) * Math.PI * r * r * r,
    centers: data.points.map((p) => ({
      id: p.id,
      label: p.label || p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      step: p.step,
    })),
    intersections: intersections.length,
    euler,
    constructionDepth: ctx.step ?? data.maxStep ?? 0,
    maxStep: data.maxStep ?? 0,
    uniqueVertices: V,
    circles: data.circleCenters.length,
    spheres: data.sphereCenters.length,
    edges: E,
    faces: F,
    name: data.name,
  };
}

/**
 * Full discovery pass (pure, cacheable).
 * @param {import('../engine/schema.js').ConstructionData} data
 * @param {{ step?: number, maxStep?: number }} ctx
 */
export function analyzeConstruction(data, ctx = {}) {
  if (!data) {
    return {
      fingerprint: "empty",
      discoveries: [],
      intersections: [],
      mathematics: computeMathematics(null, [], ctx),
      graph: { nodes: [], edges: [] },
    };
  }

  const circles = resolveCircles(data);
  const origin = constructionOrigin(circles);
  const intersections = computeIntersections(data);

  const discoveries = [
    ...detectVesica(circles),
    ...detectEquilateral(circles),
    ...detectHexagons(circles, origin),
    ...detectNFoldSymmetry(circles, origin, 6, "sixFoldSymmetry", "Six-fold Symmetry"),
    ...detectNFoldSymmetry(circles, origin, 12, "twelveFoldSymmetry", "Twelve-fold Symmetry"),
    ...detectGoldenRatio(circles, data),
    ...detectTangencies(circles),
    ...detectCoincidentCenters(circles),
    ...detectConcentric(circles),
    ...detectMidpoints(circles, intersections),
    ...detectReflectionSymmetry(circles, origin),
    ...detectRotationalSymmetry(circles, origin),
  ];

  // Prefer higher confidence; stable sort by type then title
  discoveries.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.title.localeCompare(b.title, undefined, { numeric: true });
  });

  // Renumber by shared base title (not by type alone) so "Rotational Symmetry C3"
  // is not corrupted into "Rotational Symmetry C3 #2" when C2 exists (H2).
  const byBase = new Map();
  discoveries.forEach((d) => {
    if (d.type === "sixFoldSymmetry" || d.type === "twelveFoldSymmetry") return;
    const base = d.title.replace(/\s+#\d+$/, "").trim();
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(d);
  });
  byBase.forEach((list, base) => {
    if (list.length === 1) {
      list[0].title = base;
      return;
    }
    list.forEach((d, i) => {
      if (
        i === 0 &&
        (d.type === "hexagon" || (d.type === "reflectionSymmetry" && base === "Symmetry Axis"))
      ) {
        d.title = base;
        return;
      }
      d.title = `${base} #${i + 1}`;
    });
  });

  const graph = buildGraph(circles, discoveries, intersections);
  const mathematics = computeMathematics(data, intersections, ctx);

  return {
    fingerprint: fingerprintData(data, ctx),
    discoveries,
    intersections,
    mathematics,
    graph,
    origin,
    circles,
  };
}

/** Simple LRU-ish cache for analyzeConstruction */
const cache = new Map();
const CACHE_LIMIT = 24;

export function analyzeConstructionCached(data, ctx = {}) {
  const key = fingerprintData(data, ctx);
  if (cache.has(key)) return cache.get(key);
  const result = analyzeConstruction(data, ctx);
  cache.set(key, result);
  if (cache.size > CACHE_LIMIT) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
  return result;
}

export function clearDiscoveryCache() {
  cache.clear();
}
