import { distance3 } from "../../engine/schema.js";
import {
  DISCOVERY_TYPES,
  DISCOVERY_LABELS,
  NODE_TYPES,
  REL,
  PHI,
  REL_EPS,
  EPS,
} from "../graph/types.js";

function close(a, b, rel = REL_EPS, abs = 1e-4) {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) <= Math.max(abs, rel * scale);
}

function confFromErr(err, tol) {
  return Math.round(Math.max(0.05, 1 - Math.min(1, err / Math.max(tol, 1e-9))) * 100) / 100;
}

/**
 * Construction-independent discoveries derived only from GeometryGraph.
 * @param {import('../graph/GeometryGraph.js').GeometryGraph} graph
 */
export function discoverFromGraph(graph) {
  const discoveries = [];
  discoveries.push(...detectEquilateralTriangles(graph));
  discoveries.push(...detectSquares(graph));
  discoveries.push(...detectRectangles(graph));
  discoveries.push(...detectRegularPolygons(graph));
  discoveries.push(...detectHexagons(graph));
  discoveries.push(...detectVesica(graph));
  discoveries.push(...detectReflectionSymmetry(graph));
  discoveries.push(...detectRotationalSymmetry(graph));
  discoveries.push(...detectEqualLengthGroups(graph));
  discoveries.push(...detectEqualRadiusGroups(graph));
  discoveries.push(...detectGoldenRatio(graph));

  // Normalize id fields used by highlighter / inspector
  discoveries.forEach((d) => {
    d.nodeIds = d.nodeIds || d.objectIds || [];
    d.objectIds = d.objectIds || d.nodeIds;
    d.relatedIds = d.relatedIds || [];
  });

  // Group by type for explorer counts
  const byType = new Map();
  discoveries.forEach((d) => {
    if (!byType.has(d.type)) byType.set(d.type, []);
    byType.get(d.type).push(d);
  });

  const summary = Object.keys(DISCOVERY_LABELS).map((type) => ({
    type,
    label: DISCOVERY_LABELS[type],
    count: (byType.get(type) || []).length,
    items: byType.get(type) || [],
  }));

  return { discoveries, summary, byType };
}

function pointNodes(graph) {
  return graph.nodesOfType(NODE_TYPES.POINT);
}

function radialNodes(graph) {
  const spheres = graph.nodesOfType(NODE_TYPES.SPHERE);
  return spheres.length ? spheres : graph.nodesOfType(NODE_TYPES.CIRCLE);
}

function detectEquilateralTriangles(graph) {
  const pts = pointNodes(graph);
  const out = [];
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      const dij = distance3(pts[i].center, pts[j].center);
      if (dij < EPS) continue;
      for (let k = j + 1; k < pts.length; k += 1) {
        const dik = distance3(pts[i].center, pts[k].center);
        const djk = distance3(pts[j].center, pts[k].center);
        const mean = (dij + dik + djk) / 3;
        const err =
          (Math.abs(dij - mean) + Math.abs(dik - mean) + Math.abs(djk - mean)) / (3 * mean);
        if (err > 0.06) continue;
        const ids = [pts[i].id, pts[j].id, pts[k].id];
        out.push({
          id: `eqtri-${out.length + 1}`,
          type: DISCOVERY_TYPES.EQUILATERAL_TRIANGLE,
          title: `Equilateral Triangle #${out.length + 1}`,
          confidence: confFromErr(err, 0.06),
          reasoning: `Three points form equal sides ≈ ${mean.toFixed(4)}.`,
          objectIds: ids,
          payload: { points: ids, side: mean },
        });
      }
    }
  }
  return out;
}

function detectSquares(graph) {
  return detectRegularN(graph, 4, DISCOVERY_TYPES.SQUARE, "Square");
}

function detectRectangles(graph) {
  const pts = pointNodes(graph);
  const out = [];
  // Brute: 4 distinct points forming rectangle (right angles + opposite equal)
  for (let a = 0; a < pts.length; a += 1) {
    for (let b = a + 1; b < pts.length; b += 1) {
      for (let c = b + 1; c < pts.length; c += 1) {
        for (let d = c + 1; d < pts.length; d += 1) {
          const quad = [pts[a], pts[b], pts[c], pts[d]];
          const rect = classifyRectangle(quad);
          if (!rect) continue;
          if (rect.isSquare) continue; // squares reported separately
          out.push({
            id: `rect-${out.length + 1}`,
            type: DISCOVERY_TYPES.RECTANGLE,
            title: `Rectangle #${out.length + 1}`,
            confidence: rect.confidence,
            reasoning: `Four points form a rectangle (sides ${rect.w.toFixed(3)} × ${rect.h.toFixed(3)}).`,
            objectIds: rect.order.map((p) => p.id),
            payload: rect,
          });
        }
      }
    }
  }
  return out;
}

function classifyRectangle(quad) {
  // Order by angle about centroid
  const cx = quad.reduce((s, p) => s + p.center.x, 0) / 4;
  const cy = quad.reduce((s, p) => s + p.center.y, 0) / 4;
  const order = [...quad].sort(
    (a, b) =>
      Math.atan2(a.center.y - cy, a.center.x - cx) - Math.atan2(b.center.y - cy, b.center.x - cx)
  );
  const sides = [];
  for (let i = 0; i < 4; i += 1) {
    const p = order[i].center;
    const q = order[(i + 1) % 4].center;
    sides.push({
      len: distance3(p, q),
      dx: q.x - p.x,
      dy: q.y - p.y,
    });
  }
  // Opposite sides equal
  if (!close(sides[0].len, sides[2].len) || !close(sides[1].len, sides[3].len)) return null;
  // Adjacent perpendicular
  for (let i = 0; i < 4; i += 1) {
    const u = sides[i];
    const v = sides[(i + 1) % 4];
    const lu = Math.hypot(u.dx, u.dy);
    const lv = Math.hypot(v.dx, v.dy);
    if (lu < EPS || lv < EPS) return null;
    const dot = Math.abs((u.dx * v.dx + u.dy * v.dy) / (lu * lv));
    if (dot > 0.08) return null;
  }
  const isSquare = close(sides[0].len, sides[1].len);
  return {
    order,
    w: sides[0].len,
    h: sides[1].len,
    isSquare,
    confidence: 0.92,
  };
}

function detectRegularN(graph, n, type, titleBase) {
  const pts = pointNodes(graph);
  const out = [];
  if (pts.length < n) return out;

  // For each candidate center (each point + geometric centroid)
  const centers = [
    ...pts.map((p) => p.center),
    {
      x: pts.reduce((s, p) => s + p.center.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.center.y, 0) / pts.length,
      z: pts.reduce((s, p) => s + p.center.z, 0) / pts.length,
    },
  ];

  const seen = new Set();
  centers.forEach((origin) => {
    // Group points by distance from origin
    const rings = new Map();
    pts.forEach((p) => {
      const d = distance3(p.center, origin);
      if (d < EPS) return;
      const key = d.toFixed(3);
      if (!rings.has(key)) rings.set(key, []);
      rings.get(key).push({ p, d, ang: Math.atan2(p.center.y - origin.y, p.center.x - origin.x) });
    });

    rings.forEach((ring) => {
      if (ring.length < n) return;
      ring.sort((a, b) => a.ang - b.ang);
      for (let start = 0; start < ring.length; start += 1) {
        const seq = [];
        let errSum = 0;
        let ok = true;
        for (let s = 0; s < n; s += 1) {
          const target = ring[start].ang + (s * Math.PI * 2) / n;
          let best = null;
          let bestErr = Infinity;
          ring.forEach((cand) => {
            if (seq.some((q) => q.p.id === cand.p.id)) return;
            let da = cand.ang - target;
            while (da <= -Math.PI) da += Math.PI * 2;
            while (da > Math.PI) da -= Math.PI * 2;
            const err = Math.abs(da);
            if (err < bestErr) {
              bestErr = err;
              best = cand;
            }
          });
          if (!best || bestErr > 0.22) {
            ok = false;
            break;
          }
          errSum += bestErr;
          seq.push(best);
        }
        if (!ok) continue;
        // Equal chord lengths
        const chords = [];
        for (let i = 0; i < n; i += 1) {
          chords.push(distance3(seq[i].p.center, seq[(i + 1) % n].p.center));
        }
        const mean = chords.reduce((s, v) => s + v, 0) / n;
        const chordErr = chords.reduce((s, v) => s + Math.abs(v - mean), 0) / (n * mean);
        if (chordErr > 0.08) continue;
        const key = seq
          .map((s) => s.p.id)
          .sort()
          .join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        const meanAngErr = errSum / n;
        out.push({
          id: `${type}-${out.length + 1}`,
          type,
          title: out.length === 0 ? titleBase : `${titleBase} #${out.length + 1}`,
          confidence: confFromErr(meanAngErr + chordErr, 0.3),
          reasoning: `Regular ${n}-gon with side ≈ ${mean.toFixed(4)}.`,
          objectIds: seq.map((s) => s.p.id),
          payload: { n, vertices: seq.map((s) => s.p.id), side: mean, origin: { ...origin } },
        });
        break;
      }
    });
  });
  return out;
}

function detectRegularPolygons(graph) {
  // n = 5,7,8 (4 and 6 covered by square/hexagon)
  return [
    ...detectRegularN(graph, 5, DISCOVERY_TYPES.REGULAR_POLYGON, "Regular Pentagon"),
    ...detectRegularN(graph, 7, DISCOVERY_TYPES.REGULAR_POLYGON, "Regular Heptagon"),
    ...detectRegularN(graph, 8, DISCOVERY_TYPES.REGULAR_POLYGON, "Regular Octagon"),
  ];
}

function detectHexagons(graph) {
  return detectRegularN(graph, 6, DISCOVERY_TYPES.HEXAGON, "Hexagon");
}

function detectVesica(graph) {
  const radials = radialNodes(graph);
  const out = [];
  for (let i = 0; i < radials.length; i += 1) {
    for (let j = i + 1; j < radials.length; j += 1) {
      const a = radials[i];
      const b = radials[j];
      if (!close(a.radius, b.radius)) continue;
      const d = distance3(a.center, b.center);
      const r = (a.radius + b.radius) / 2;
      if (d < r * 0.15 || d > r * 1.85) continue;
      const err = Math.abs(d - r) / r;
      if (err > 0.12) continue;
      out.push({
        id: `vesica-${out.length + 1}`,
        type: DISCOVERY_TYPES.VESICA_PISCIS,
        title: `Vesica Piscis #${out.length + 1}`,
        confidence: confFromErr(err, 0.12),
        reasoning: `Equal-radius objects with center distance ≈ radius (${d.toFixed(4)} ≈ ${r.toFixed(4)}).`,
        objectIds: [a.id, b.id],
        payload: { a: a.id, b: b.id, distance: d, radius: r, centers: [a.center, b.center] },
      });
    }
  }
  return out;
}

function detectReflectionSymmetry(graph) {
  const pts = pointNodes(graph);
  const out = [];
  if (pts.length < 3) return out;
  const origin = graph.origin;
  const scored = [];
  for (let k = 0; k < 12; k += 1) {
    const theta = (k * Math.PI) / 12;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    let errSum = 0;
    let n = 0;
    const pairs = [];
    pts.forEach((p) => {
      const dx = p.center.x - origin.x;
      const dy = p.center.y - origin.y;
      const proj = dx * ux + dy * uy;
      const mx = origin.x + 2 * proj * ux - dx;
      const my = origin.y + 2 * proj * uy - dy;
      let best = null;
      let bestD = Infinity;
      pts.forEach((q) => {
        const d = Math.hypot(q.center.x - mx, q.center.y - my);
        if (d < bestD) {
          bestD = d;
          best = q;
        }
      });
      const tol = Math.max(graph.data?.radius ?? 1, 0.5) * 0.08;
      errSum += bestD / tol;
      n += 1;
      if (best) pairs.push(p.id, best.id);
    });
    const mean = errSum / Math.max(n, 1);
    if (mean <= 1.0) scored.push({ theta, mean, pairs: [...new Set(pairs)] });
  }
  scored.sort((a, b) => a.mean - b.mean);
  const kept = [];
  scored.forEach((s) => {
    if (kept.some((k) => Math.abs(((k.theta - s.theta + Math.PI) % Math.PI) - Math.PI / 2) > 10)) {
      // dedup similar axes
    }
    if (kept.some((k) => Math.abs(Math.sin(2 * (k.theta - s.theta))) < 0.15)) return;
    kept.push(s);
  });
  kept.slice(0, 6).forEach((s, i) => {
    out.push({
      id: `refl-${i + 1}`,
      type: DISCOVERY_TYPES.REFLECTION_SYMMETRY,
      title: i === 0 ? "Reflection Symmetry" : `Reflection Symmetry #${i + 1}`,
      confidence: confFromErr(s.mean, 1),
      reasoning: `Reflection across angle ${((s.theta * 180) / Math.PI).toFixed(1)}° maps points onto points.`,
      objectIds: s.pairs,
      payload: {
        origin: { ...origin },
        angle: s.theta,
        axisLength: Math.max(...pts.map((p) => distance3(p.center, origin)), 1) * 2.4,
      },
    });
  });
  return out;
}

function detectRotationalSymmetry(graph) {
  const pts = pointNodes(graph);
  const out = [];
  if (pts.length < 3) return out;
  const origin = graph.origin;
  [2, 3, 4, 5, 6, 8, 12].forEach((order) => {
    const ang = (Math.PI * 2) / order;
    let total = 0;
    let checks = 0;
    const ids = [];
    pts.forEach((p) => {
      const dx = p.center.x - origin.x;
      const dy = p.center.y - origin.y;
      if (Math.hypot(dx, dy) < EPS) return;
      const rx = origin.x + dx * Math.cos(ang) - dy * Math.sin(ang);
      const ry = origin.y + dx * Math.sin(ang) + dy * Math.cos(ang);
      let bestD = Infinity;
      pts.forEach((q) => {
        const d = Math.hypot(q.center.x - rx, q.center.y - ry);
        if (d < bestD) bestD = d;
      });
      const tol = Math.max(graph.data?.radius ?? 1, 0.5) * 0.08;
      total += bestD / tol;
      checks += 1;
      ids.push(p.id);
    });
    if (checks < order) return;
    const mean = total / checks;
    if (mean > 1.2) return;
    // Prefer highest fold: still report all strong ones; UI groups by type
    out.push({
      id: `rot-${order}`,
      type: DISCOVERY_TYPES.ROTATIONAL_SYMMETRY,
      title: `Rotational Symmetry C${order}`,
      confidence: confFromErr(mean, 1.2),
      reasoning: `Rotation by ${360 / order}° about origin maps points onto points.`,
      objectIds: [...new Set(ids)],
      payload: { order, origin: { ...origin }, angle: ang },
    });
  });
  return out;
}

function detectEqualLengthGroups(graph) {
  const edges = graph.nodesOfType(NODE_TYPES.EDGE);
  const buckets = new Map();
  edges.forEach((e) => {
    if (!(e.length > EPS)) return;
    const key = e.length.toFixed(3);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(e);
  });
  const out = [];
  buckets.forEach((group, key) => {
    if (group.length < 2) return;
    out.push({
      id: `elen-${out.length + 1}`,
      type: DISCOVERY_TYPES.EQUAL_LENGTH_GROUP,
      title: `Equal-Length Group #${out.length + 1}`,
      confidence: 0.95,
      reasoning: `${group.length} edges share length ≈ ${Number(key).toFixed(4)}.`,
      objectIds: group.map((e) => e.id),
      payload: { length: Number(key), count: group.length },
    });
  });
  return out;
}

function detectEqualRadiusGroups(graph) {
  const radials = radialNodes(graph);
  const buckets = new Map();
  radials.forEach((r) => {
    const key = r.radius.toFixed(3);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  });
  const out = [];
  buckets.forEach((group, key) => {
    if (group.length < 2) return;
    out.push({
      id: `erad-${out.length + 1}`,
      type: DISCOVERY_TYPES.EQUAL_RADIUS_GROUP,
      title: `Equal-Radius Group #${out.length + 1}`,
      confidence: 0.95,
      reasoning: `${group.length} circles/spheres share radius ≈ ${Number(key).toFixed(4)}.`,
      objectIds: group.map((r) => r.id),
      payload: { radius: Number(key), count: group.length },
    });
  });
  return out;
}

function detectGoldenRatio(graph) {
  const pts = pointNodes(graph);
  const dists = [];
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      const d = distance3(pts[i].center, pts[j].center);
      if (d > EPS) dists.push({ d, a: pts[i], b: pts[j] });
    }
  }
  dists.sort((a, b) => a.d - b.d);
  const out = [];
  for (let i = 0; i < dists.length; i += 1) {
    for (let j = i + 1; j < dists.length; j += 1) {
      const ratio = dists[j].d / dists[i].d;
      const err = Math.abs(ratio - PHI) / PHI;
      if (err > 0.04) continue;
      out.push({
        id: `phi-${out.length + 1}`,
        type: DISCOVERY_TYPES.GOLDEN_RATIO,
        title: `Golden Ratio #${out.length + 1}`,
        confidence: confFromErr(err, 0.04),
        reasoning: `Distance ratio ${ratio.toFixed(4)} ≈ φ (${PHI.toFixed(4)}).`,
        objectIds: [dists[i].a.id, dists[i].b.id, dists[j].a.id, dists[j].b.id],
        payload: {
          short: dists[i],
          long: dists[j],
          ratio,
          phi: PHI,
        },
      });
      if (out.length >= 10) return out;
    }
  }
  return out;
}
