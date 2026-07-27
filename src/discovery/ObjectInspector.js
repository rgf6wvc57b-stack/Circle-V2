import { REL, DISCOVERY_LABELS } from "./graph/types.js";

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(4);
}

function fmtPoint(c) {
  if (!c) return "—";
  return `(${fmt(c.x)}, ${fmt(c.y)}, ${fmt(c.z)})`;
}

function labelOf(graph, id) {
  const n = graph.getNode(id);
  return n?.label || id;
}

/**
 * Build structured inspection data for a geometry graph node.
 * Construction-independent — reads only from GeometryGraph + discovery memberships.
 */
export function inspectNode(graph, nodeId, discoveryResult = null) {
  const node = graph.getNode(nodeId);
  if (!node) return null;

  const rels = graph.relationsFor(nodeId);
  const parents = node.parentIds || [];
  const children = node.childIds || [];
  const connected = graph.neighbors(nodeId).filter(
    (id) => !parents.includes(id) && !children.includes(id)
  );

  const tangencies = rels.filter((r) => r.kind === REL.TANGENT);
  const intersections = rels.filter((r) => r.kind === REL.INTERSECTS);
  const symmetries = rels.filter(
    (r) => r.kind === REL.MIRROR_PAIR || r.kind === REL.ROTATIONAL_EQUIVALENT
  );

  const memberships = [];
  const polygonMemberships = [];
  if (discoveryResult?.discoveries) {
    discoveryResult.discoveries.forEach((d) => {
      const ids = d.nodeIds || d.objectIds || [];
      if (!ids.includes(nodeId)) return;
      const entry = {
        id: d.id,
        type: d.type,
        label: DISCOVERY_LABELS[d.type] || d.title,
        title: d.title,
      };
      memberships.push(entry);
      if (
        d.type === "equilateralTriangle" ||
        d.type === "square" ||
        d.type === "rectangle" ||
        d.type === "regularPolygon" ||
        d.type === "hexagon"
      ) {
        polygonMemberships.push(entry);
      }
    });
  }

  const measurements = {
    center: node.center ? { ...node.center } : null,
    radius: node.radius ?? null,
    length: node.length ?? null,
    step: node.constructionStep ?? node.step ?? null,
    type: node.type,
  };

  // Construction history: walk parents upward, then self
  const history = [];
  const seen = new Set();
  const walk = (id, depth) => {
    if (seen.has(id) || depth > 8) return;
    seen.add(id);
    const n = graph.getNode(id);
    if (!n) return;
    (n.parentIds || []).forEach((pid) => walk(pid, depth + 1));
    history.push({
      id,
      label: n.label || id,
      type: n.type,
      step: n.constructionStep ?? n.step ?? 1,
    });
  };
  walk(nodeId, 0);

  return {
    node,
    parents,
    children,
    connected,
    tangencies,
    intersections,
    symmetries,
    memberships,
    polygonMemberships,
    measurements,
    history,
    labels: {
      parents: parents.map((id) => labelOf(graph, id)),
      children: children.map((id) => labelOf(graph, id)),
      connected: connected.map((id) => labelOf(graph, id)),
    },
  };
}

/**
 * Render inspector HTML for the side panel / HUD.
 */
export function renderInspectorHtml(graph, inspection) {
  if (!inspection) {
    return `<p class="hint">Select an object in the scene to inspect it.</p>`;
  }
  const { node, measurements, history, labels, memberships, polygonMemberships, tangencies, intersections, symmetries } =
    inspection;

  const list = (items) =>
    items.length ? items.map((x) => `<span class="chip">${x}</span>`).join(" ") : `<span class="hint">None</span>`;

  const relList = (rels) =>
    rels.length
      ? rels
          .map((r) => {
            const other = r.a === node.id ? r.b : r.a;
            return `<div class="insp-row"><span>${r.kind}</span><strong>${labelOf(graph, other)}</strong></div>`;
          })
          .join("")
      : `<p class="hint">None</p>`;

  return `
    <div class="insp-block">
      <div class="insp-title">${node.label || node.id}</div>
      <div class="insp-meta">${node.type} · step ${measurements.step ?? "—"}</div>
    </div>
    <div class="insp-block">
      <div class="insp-heading">Measurements</div>
      <div class="insp-grid">
        <span>Center</span><strong class="meas-mono">${fmtPoint(measurements.center)}</strong>
        <span>Radius</span><strong>${measurements.radius != null ? fmt(measurements.radius) : "—"}</strong>
        <span>Length</span><strong>${measurements.length != null ? fmt(measurements.length) : "—"}</strong>
      </div>
    </div>
    <div class="insp-block">
      <div class="insp-heading">Construction history</div>
      <ol class="insp-history">
        ${history
          .map(
            (h) =>
              `<li><strong>${h.label}</strong> <span class="hint">(${h.type}, step ${h.step})</span></li>`
          )
          .join("")}
      </ol>
    </div>
    <div class="insp-block">
      <div class="insp-heading">Parents</div>
      <div class="chip-row">${list(labels.parents)}</div>
    </div>
    <div class="insp-block">
      <div class="insp-heading">Children</div>
      <div class="chip-row">${list(labels.children)}</div>
    </div>
    <div class="insp-block">
      <div class="insp-heading">Connected</div>
      <div class="chip-row">${list(labels.connected)}</div>
    </div>
    <div class="insp-block">
      <div class="insp-heading">Tangencies</div>
      ${relList(tangencies)}
    </div>
    <div class="insp-block">
      <div class="insp-heading">Intersections</div>
      ${relList(intersections)}
    </div>
    <div class="insp-block">
      <div class="insp-heading">Symmetry memberships</div>
      <div class="chip-row">${
        memberships.filter((m) => /symmetry|Symmetry/i.test(m.label) || /symmetry/i.test(m.type)).length
          ? memberships
              .filter((m) => /symmetry/i.test(m.type))
              .map((m) => `<span class="chip">${m.title}</span>`)
              .join(" ")
          : `<span class="hint">None</span>`
      }</div>
    </div>
    <div class="insp-block">
      <div class="insp-heading">Polygon memberships</div>
      <div class="chip-row">${
        polygonMemberships.length
          ? polygonMemberships.map((m) => `<span class="chip">${m.title}</span>`).join(" ")
          : `<span class="hint">None</span>`
      }</div>
    </div>
  `;
}
