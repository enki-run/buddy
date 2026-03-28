import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import { Layout } from "./layout";

const GRAPH_SCRIPT = raw(`<script>
(function(){
  var TYPE_COLORS = {
    concept: '#4a7a9b',
    fact: '#7a4a9b',
    decision: '#9b7a4a',
    template: '#4a9b7a',
    secret: '#9b4a4a',
    config: '#6b7a9b',
    project: '#4a7a4a',
    task: '#9b9b4a'
  };
  var NODE_RADIUS = 14;
  var sim = null;
  var graphData = null;

  function escapeText(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function init() {
    var container = document.getElementById('graph-container');
    var svgEl = document.getElementById('graph-svg');
    var tooltip = document.getElementById('graph-tooltip');
    if (!container || !svgEl || !tooltip) return;

    fetch('/api/graph', { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        graphData = data;
        renderGraph(container, svgEl, tooltip);
      })
      .catch(function() {
        var msg = document.createElement('p');
        msg.style.cssText = 'padding:2rem;color:var(--color-subtle);text-align:center;';
        msg.textContent = 'Graph konnte nicht geladen werden.';
        container.appendChild(msg);
      });
  }

  function setTooltipContent(tip, parts) {
    while (tip.firstChild) tip.removeChild(tip.firstChild);
    parts.forEach(function(p) {
      var el = document.createElement('div');
      el.style.cssText = p.style || '';
      el.textContent = p.text;
      tip.appendChild(el);
    });
  }

  function renderGraph(container, svgEl, tooltip) {
    if (sim) { sim.stop(); sim = null; }
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

    var W = container.clientWidth || 800;
    var H = container.clientHeight || 600;
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var nodes = graphData.nodes.map(function(n) { return Object.assign({}, n); });
    var edges = graphData.edges.map(function(e) { return Object.assign({}, e); });

    if (nodes.length === 0) {
      var msg = document.createElement('p');
      msg.style.cssText = 'padding:2rem;color:var(--color-subtle);text-align:center;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;';
      msg.textContent = 'Keine Daten vorhanden.';
      container.appendChild(msg);
      return;
    }

    var NS = 'http://www.w3.org/2000/svg';
    var r = NODE_RADIUS;

    // --- Arrowhead marker ---
    var defs = document.createElementNS(NS, 'defs');
    var marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('viewBox', '0 0 10 7');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto');
    var arrowPath = document.createElementNS(NS, 'path');
    arrowPath.setAttribute('d', 'M 0 0 L 10 3.5 L 0 7 z');
    arrowPath.setAttribute('fill', 'var(--color-subtle)');
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svgEl.appendChild(defs);

    // --- Root group for zoom/pan ---
    var rootG = document.createElementNS(NS, 'g');
    rootG.setAttribute('id', 'graph-root');
    svgEl.appendChild(rootG);

    // --- Force simulation ---
    var area = W * H;
    var linkDist = Math.max(80, Math.min(180, Math.sqrt(area / nodes.length) * 0.7));
    var chargeStr = Math.max(-600, Math.min(-200, -area / (nodes.length * 2.5)));

    sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id(function(d) { return d.id; }).distance(linkDist))
      .force('charge', d3.forceManyBody().strength(chargeStr))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide().radius(r + 8))
      .force('x', d3.forceX(W / 2).strength(0.04))
      .force('y', d3.forceY(H / 2).strength(0.04));

    // --- Edge lines ---
    var edgeGroup = document.createElementNS(NS, 'g');
    var lineEls = edges.map(function(e) {
      var line = document.createElementNS(NS, 'line');
      line.setAttribute('stroke', 'var(--color-subtle)');
      line.setAttribute('stroke-width', '1.2');
      line.setAttribute('stroke-opacity', '0.4');
      line.setAttribute('marker-end', 'url(#arrowhead)');
      line.style.cursor = 'default';
      line.addEventListener('mouseenter', function(evt) {
        line.setAttribute('stroke-opacity', '1');
        line.setAttribute('stroke-width', '2.5');
        var parts = [{ text: e.relation.replace(/_/g, ' '), style: 'font-weight:600;margin-bottom:2px;' }];
        if (e.note) parts.push({ text: e.note, style: 'font-size:0.69rem;color:var(--color-subtle);' });
        setTooltipContent(tooltip, parts);
        tooltip.style.display = 'block';
        positionTooltip(evt, tooltip, container);
      });
      line.addEventListener('mousemove', function(evt) { positionTooltip(evt, tooltip, container); });
      line.addEventListener('mouseleave', function() {
        line.setAttribute('stroke-opacity', '0.4');
        line.setAttribute('stroke-width', '1.2');
        tooltip.style.display = 'none';
      });
      edgeGroup.appendChild(line);
      return line;
    });
    rootG.appendChild(edgeGroup);

    // --- Edge labels ---
    var edgeLabelGroup = document.createElementNS(NS, 'g');
    var edgeLabelEls = edges.map(function(e) {
      var label = document.createElementNS(NS, 'text');
      label.setAttribute('font-size', '7');
      label.setAttribute('fill', 'var(--color-light)');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('pointer-events', 'none');
      label.setAttribute('opacity', '0.5');
      label.textContent = e.relation.replace(/_/g, ' ');
      edgeLabelGroup.appendChild(label);
      return label;
    });
    rootG.appendChild(edgeLabelGroup);

    // --- Node groups ---
    var nodeGroup = document.createElementNS(NS, 'g');
    var dragBehavior = d3.drag()
      .on('start', function(event, d) {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', function(event, d) {
        d.fx = event.x; d.fy = event.y;
      })
      .on('end', function(event, d) {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null; d.fy = null;
      });

    var nodeEls = nodes.map(function(n) {
      var g = document.createElementNS(NS, 'g');
      g.style.cursor = 'pointer';
      var color = TYPE_COLORS[n.type] || '#888';

      // Hover halo
      var halo = document.createElementNS(NS, 'circle');
      halo.setAttribute('r', String(r + 4));
      halo.setAttribute('fill', 'transparent');
      halo.setAttribute('stroke', color);
      halo.setAttribute('stroke-width', '0');
      halo.setAttribute('opacity', '0.3');
      g.appendChild(halo);

      // Main circle
      var circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('r', String(r));
      circle.setAttribute('fill', color + '22');
      circle.setAttribute('stroke', color);
      circle.setAttribute('stroke-width', '2');
      g.appendChild(circle);

      // Type initial in center
      var initials = { concept: 'C', fact: 'F', decision: 'D', template: 'T', secret: 'S', config: 'G', project: 'P', task: 'K' };
      var initial = document.createElementNS(NS, 'text');
      initial.setAttribute('text-anchor', 'middle');
      initial.setAttribute('dominant-baseline', 'central');
      initial.setAttribute('font-size', '11');
      initial.setAttribute('font-weight', '700');
      initial.setAttribute('fill', color);
      initial.setAttribute('pointer-events', 'none');
      initial.textContent = initials[n.type] || '?';
      g.appendChild(initial);

      // Label below
      var label = document.createElementNS(NS, 'text');
      var maxLen = 22;
      var displayName = n.title.length > maxLen ? n.title.slice(0, maxLen) + '\\u2026' : n.title;
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'hanging');
      label.setAttribute('y', String(r + 5));
      label.setAttribute('font-size', '10');
      label.setAttribute('fill', 'var(--color-muted)');
      label.setAttribute('pointer-events', 'none');
      label.textContent = displayName;
      g.appendChild(label);

      // Click
      g.addEventListener('click', function() {
        if (n.type === 'project') window.location.href = '/project/' + n.id;
        else window.location.href = '/nodes/' + n.id;
      });

      // Hover
      g.addEventListener('mouseenter', function(evt) {
        halo.setAttribute('stroke-width', '3');
        circle.setAttribute('stroke-width', '3');
        var parts = [
          { text: n.title, style: 'font-weight:600;margin-bottom:4px;' },
          { text: n.type + (n.status !== 'active' ? ' \\u00B7 ' + n.status : ''), style: 'font-family:var(--font-mono);font-size:0.69rem;color:' + color + ';text-transform:uppercase;' }
        ];
        if (n.context) parts.push({ text: n.context, style: 'margin-top:2px;font-size:0.69rem;color:var(--color-subtle);' });
        setTooltipContent(tooltip, parts);
        tooltip.style.display = 'block';
        positionTooltip(evt, tooltip, container);
      });
      g.addEventListener('mousemove', function(evt) { positionTooltip(evt, tooltip, container); });
      g.addEventListener('mouseleave', function() {
        halo.setAttribute('stroke-width', '0');
        circle.setAttribute('stroke-width', '2');
        tooltip.style.display = 'none';
      });

      d3.select(g).call(dragBehavior);
      nodeGroup.appendChild(g);
      return g;
    });
    rootG.appendChild(nodeGroup);

    // --- Zoom & Pan via d3.zoom ---
    var zoom = d3.zoom()
      .scaleExtent([0.3, 4])
      .on('zoom', function(event) {
        rootG.setAttribute('transform', event.transform);
      });
    d3.select(svgEl).call(zoom);

    // --- Tick: lines end at circle edge ---
    sim.on('tick', function() {
      edges.forEach(function(e, i) {
        var dx = e.target.x - e.source.x;
        var dy = e.target.y - e.source.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var srcOff = r + 2;
        var tgtOff = r + 8;
        var x1 = e.source.x + (dx / dist) * srcOff;
        var y1 = e.source.y + (dy / dist) * srcOff;
        var x2 = e.target.x - (dx / dist) * tgtOff;
        var y2 = e.target.y - (dy / dist) * tgtOff;
        lineEls[i].setAttribute('x1', String(x1));
        lineEls[i].setAttribute('y1', String(y1));
        lineEls[i].setAttribute('x2', String(x2));
        lineEls[i].setAttribute('y2', String(y2));
        edgeLabelEls[i].setAttribute('x', String((x1 + x2) / 2));
        edgeLabelEls[i].setAttribute('y', String((y1 + y2) / 2 - 5));
      });
      nodes.forEach(function(n, i) {
        nodeEls[i].setAttribute('transform', 'translate(' + n.x + ',' + n.y + ')');
      });
    });
  }

  function positionTooltip(evt, tip, container) {
    var rect = container.getBoundingClientRect();
    var x = evt.clientX - rect.left + 14;
    var y = evt.clientY - rect.top - 10;
    var tw = tip.offsetWidth || 200;
    var th = tip.offsetHeight || 80;
    if (x + tw > rect.width) x = x - tw - 28;
    if (y + th > rect.height) y = y - th;
    if (y < 0) y = 4;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      if (graphData) {
        var c = document.getElementById('graph-container');
        var s = document.getElementById('graph-svg');
        var t = document.getElementById('graph-tooltip');
        if (c && s && t) renderGraph(c, s, t);
      }
    }, 300);
  });

  if (typeof d3 !== 'undefined') { init(); }
  else { document.getElementById('d3-script').addEventListener('load', init); }
})();
</script>`);

const LEGEND_ITEMS = [
  { type: "concept", color: "#4a7a9b", initial: "C" },
  { type: "fact", color: "#7a4a9b", initial: "F" },
  { type: "decision", color: "#9b7a4a", initial: "D" },
  { type: "template", color: "#4a9b7a", initial: "T" },
  { type: "secret", color: "#9b4a4a", initial: "S" },
  { type: "config", color: "#6b7a9b", initial: "G" },
  { type: "project", color: "#4a7a4a", initial: "P" },
  { type: "task", color: "#9b9b4a", initial: "K" },
];

const LEGEND = raw(`<div style="position:absolute;bottom:12px;left:12px;background:var(--color-page);border:1px solid var(--color-border);border-radius:0.46rem;padding:10px 14px;font-size:0.72rem;z-index:10;opacity:0.92;">
  <div style="font-family:var(--font-mono);font-weight:700;color:var(--color-subtle);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;font-size:0.62rem;">Typen</div>
  ${LEGEND_ITEMS.map(({ type, color, initial }) =>
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
      <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
      <span style="font-weight:700;color:${color};font-size:0.62rem;width:10px;">${initial}</span>
      <span style="color:var(--color-muted);">${type}</span>
    </div>`
  ).join("")}
  <div style="margin-top:8px;font-size:0.58rem;color:var(--color-light);">Scroll = Zoom &middot; Drag = Verschieben</div>
</div>`);

export const GraphPage: FC<{ csrfToken?: string }> = ({ csrfToken }) => {
  return (
    <Layout title="Graph" activePath="/graph" csrfToken={csrfToken}>
      <h1 style="font-size: 1.38rem; margin-bottom: 1rem;">Knowledge Graph</h1>
      <div id="graph-container" class="ecosystem-graph" style="position: relative;">
        <svg id="graph-svg" style="width:100%;height:100%;display:block;"></svg>
        <div id="graph-tooltip" class="graph-tooltip" style="display: none; position: absolute;"></div>
        {LEGEND}
      </div>
      {raw('<script id="d3-script" src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>')}
      {GRAPH_SCRIPT}
    </Layout>
  );
};
