// Interactive Cytoscape diagram. Compounds stay open. A drag with the left or
// the wheel (middle) button pans, including one that starts on a node, edge,
// or package. A package click clears focus and does not open the popover. The
// canvas button opens the diagram in a dialog that fills the browser tab.
import { cytoscapeLib } from "./cytoscape.ts";
import type { CyCore, CyElement, CyEvent, CyStyleBlock } from "./cytoscape.ts";
import { DIAGRAM_CSS } from "./diagram-css.ts";
import type { ChangeKind, GraphEdge, GraphFlow, GraphModel, GraphNode } from "./types.ts";

const KINDS = ["added", "modified", "removed", "same"] as const;
const PLAY_MS = 1600;
const FONT = "ui-sans-serif, system-ui, -apple-system, sans-serif";

interface Tone { fill: string; line: string }
interface Paint {
  ink: string;
  parentFill: string;
  parentLine: string;
  parentInk: string;
  plate: string;
  plateLine: string;
  tone: Record<ChangeKind, Tone>;
}

interface Labels {
  added: string;
  modified: string;
  removed: string;
  same: string;
  prev: string;
  play: string;
  next: string;
  flow: string;
  enterFs: string;
  exitFs: string;
}

const LABELS: Record<"vi" | "en", Labels> = {
  vi: { added: "Thêm", modified: "Sửa", removed: "Xóa", same: "Giữ nguyên",
        prev: "Bước trước", play: "Phát", next: "Bước sau", flow: "Flow",
        enterFs: "Toàn màn hình", exitFs: "Thoát toàn màn hình" },
  en: { added: "Added", modified: "Modified", removed: "Removed", same: "Unchanged",
        prev: "Previous step", play: "Play", next: "Next step", flow: "Flow",
        enterFs: "Full screen", exitFs: "Exit full screen" },
};

// Cytoscape paints on a canvas, so it cannot use the CSS tokens directly.
// Sample the computed color (light-dark and daisyUI already resolved).
function asRgb(color: string): string {
  if (/^rgba?\(/.test(color)) return color;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return color;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  if (a >= 255) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

function readPaint(probe: HTMLElement): Paint {
  const color = (token: string): string => {
    probe.style.backgroundColor = "transparent";
    probe.style.backgroundColor = `var(${token})`;
    const raw = getComputedStyle(probe).backgroundColor;
    probe.style.backgroundColor = "";
    if (!raw || raw === "transparent" || raw === "rgba(0, 0, 0, 0)")
      return "rgb(100, 116, 139)";
    return asRgb(raw);
  };
  const tone = (kind: ChangeKind): Tone => ({
    fill: color(`--cy-${kind}-fill`),
    line: color(`--cy-${kind}-line`),
  });
  return {
    ink: color("--cy-ink"),
    parentFill: color("--cy-parent-fill"),
    parentLine: color("--cy-parent-line"),
    parentInk: color("--cy-parent-ink"),
    plate: color("--cy-plate"),
    plateLine: color("--cy-plate-line"),
    tone: {
      added: tone("added"),
      modified: tone("modified"),
      removed: tone("removed"),
      same: tone("same"),
    },
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function toneOf(paint: Paint, kind: string | undefined): Tone {
  if (kind === "added" || kind === "removed" || kind === "modified") return paint.tone[kind];
  return paint.tone.same;
}

function toElements(model: GraphModel, paint: Paint): unknown[] {
  const nodes = (model.nodes ?? []).map((n: GraphNode) => ({
    group: "nodes",
    data: {
      id: n.id, label: n.label, parent: n.parent,
      change: n.change || "same",
      desc: n.desc, path: n.path, line: n.line,
      _color: toneOf(paint, n.change).line,
      _bg: toneOf(paint, n.change).fill,
    },
  }));
  const edges = (model.edges ?? []).map((e: GraphEdge) => ({
    group: "edges",
    data: {
      id: e.id, source: e.source, target: e.target,
      label: e.decides ? `${e.label} — ${e.decides}` : e.label,
      desc: e.decides, path: e.path, line: e.line,
      change: e.change || "same",
      _color: toneOf(paint, e.change).line,
    },
  }));
  return [...nodes, ...edges];
}

function graphStyle(paint: Paint): CyStyleBlock[] {
  return [
    { selector: "node", style: {
        label: "data(label)",
        "font-family": FONT, "font-size": 12, "font-weight": 500,
        "text-valign": "center", "text-halign": "center",
        "text-wrap": "wrap", "text-max-width": "160px",
        "background-color": "data(_bg)",
        "border-width": 1.5, "border-color": "data(_color)",
        color: paint.ink,
        width: "label", height: "label", padding: "11px",
        shape: "round-rectangle", "corner-radius": "8px",
        "transition-property": "background-color border-color color opacity overlay-color overlay-opacity overlay-padding underlay-color underlay-opacity underlay-padding",
        "transition-duration": "0.3s", "transition-timing-function": "ease-out",
      } },
    { selector: "node:parent", style: {
        "text-valign": "top", "text-halign": "center", "text-margin-y": 12,
        "text-max-width": "220px", "font-size": 12, "font-weight": 600,
        "background-color": paint.parentFill, "background-opacity": 1,
        "border-width": 1, "border-style": "solid", "border-color": paint.parentLine,
        color: paint.parentInk, padding: "22px", "corner-radius": "12px",
      } },
    { selector: "node[change='removed']", style: { opacity: 0.55, "border-style": "dashed" } },
    { selector: "edge", style: {
        label: "data(label)", "font-family": FONT, "font-size": 11, "font-weight": 500,
        "text-rotation": "none", "text-wrap": "wrap", "text-max-width": "150px",
        "text-margin-y": -10,
        "text-background-color": paint.plate, "text-background-opacity": 1,
        "text-background-padding": "4px", "text-background-shape": "roundrectangle",
        "text-border-width": 1, "text-border-color": paint.plateLine, "text-border-opacity": 1,
        color: paint.ink,
        "curve-style": "bezier", "target-arrow-shape": "triangle",
        "target-arrow-color": "data(_color)", "line-color": "data(_color)",
        "line-cap": "round", width: 1.75, "arrow-scale": 0.9,
        "z-compound-depth": "top", "z-index": 5,
        "transition-property": "line-color target-arrow-color color opacity text-background-color text-border-color overlay-color overlay-opacity overlay-padding underlay-color underlay-opacity underlay-padding",
        "transition-duration": "0.3s", "transition-timing-function": "ease-out",
      } },
    { selector: "edge[change='removed']", style: { "line-style": "dashed", opacity: 0.5 } },
    { selector: ".flow-member", style: {
        "overlay-color": "#7c3aed", "overlay-opacity": 0.1, "overlay-padding": 6,
      } },
    { selector: "edge.flow-member", style: {
        "underlay-color": "#7c3aed", "underlay-opacity": 0.28, "underlay-padding": 3,
      } },
    { selector: "node.step-active", style: {
        "background-color": "#7c3aed", "border-color": "#ede9fe",
        color: "#ffffff", opacity: 1,
        "overlay-opacity": 0,
        "underlay-color": "#c4b5fd", "underlay-opacity": 1, "underlay-padding": 10,
        "z-index": 99,
      } },
    { selector: "edge.step-active", style: {
        "line-color": "#5b21b6", "target-arrow-color": "#5b21b6",
        color: "#ffffff", opacity: 1,
        "text-background-color": "#7c3aed", "text-background-opacity": 1,
        "text-border-color": "#ede9fe",
        "underlay-color": "#c4b5fd", "underlay-opacity": 1, "underlay-padding": 7,
        "overlay-opacity": 0,
        "z-index": 20,
      } },
    { selector: "node.el-hover", style: {
        "background-color": paint.ink, "border-color": paint.plate,
        color: paint.plate, opacity: 1,
        "overlay-opacity": 0,
        "underlay-color": paint.ink, "underlay-opacity": 0.4, "underlay-padding": 10,
        "z-index": 100,
      } },
    { selector: "edge.el-hover", style: {
        "line-color": paint.ink, "target-arrow-color": paint.ink,
        color: paint.plate, opacity: 1,
        "text-background-color": paint.ink, "text-background-opacity": 1,
        "text-border-color": paint.plate,
        "underlay-color": paint.ink, "underlay-opacity": 0.85, "underlay-padding": 7,
        "overlay-opacity": 0,
        "z-index": 100,
      } },
  ];
}

function isCyElement(target: CyEvent["target"], cy: CyCore): target is CyElement {
  return target !== cy;
}

function svgIcon(cls: string, d: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

function mount(container: HTMLElement, cyFactory: ReturnType<typeof cytoscapeLib>): void {
  if (!cyFactory) return;
  const modelEl = container.querySelector("script.graph-model");
  if (!modelEl?.textContent) return;
  const model = JSON.parse(modelEl.textContent) as GraphModel;
  const UI = model.lang === "en" ? LABELS.en : LABELS.vi;

  const canvas = el("div", "cy-canvas");
  const legend = el("div", "cy-legend");
  for (const k of KINDS) {
    const item = el("span");
    const sw = el("i");
    sw.dataset.k = k;
    item.append(sw, document.createTextNode(UI[k]));
    legend.append(item);
  }
  const flowBar = el("div", "cy-flow");
  const flowDd = el("div", "cy-flow-dd");
  const flowBtn = el("button", "cy-flow-trigger");
  flowBtn.type = "button";
  flowBtn.setAttribute("aria-haspopup", "listbox");
  flowBtn.setAttribute("aria-expanded", "false");
  flowBtn.setAttribute("aria-label", UI.flow);
  const flowLabel = el("span", "cy-flow-trigger-label", "—");
  const flowCaret = el("span", "cy-flow-caret");
  flowCaret.setAttribute("aria-hidden", "true");
  flowBtn.append(flowLabel, flowCaret);
  const flowMenu = el("div", "cy-flow-menu");
  const flowMenuId = "cy-flow-" + Math.random().toString(36).slice(2, 8);
  flowMenu.id = flowMenuId;
  flowMenu.setAttribute("popover", "auto");
  flowMenu.setAttribute("role", "listbox");
  flowMenu.setAttribute("aria-label", UI.flow);
  flowBtn.setAttribute("popovertarget", flowMenuId);
  flowBtn.setAttribute("aria-controls", flowMenuId);
  flowDd.append(flowBtn, flowMenu);
  const prevB = el("button", "lens-btn");
  prevB.type = "button";
  prevB.setAttribute("aria-label", UI.prev);
  prevB.append(svgIcon("icon-prev", "M10.75 3.75 5.25 8l5.5 4.25"));
  const playB = el("button", "lens-btn");
  playB.type = "button";
  playB.setAttribute("aria-label", UI.play);
  playB.setAttribute("aria-pressed", "false");
  playB.append(
    svgIcon("icon-play", "M6.25 3.75 11.75 8 6.25 12.25Z"),
    svgIcon("icon-pause", "M6 4.25v7.5M10 4.25v7.5"),
  );
  const nextB = el("button", "lens-btn");
  nextB.type = "button";
  nextB.setAttribute("aria-label", UI.next);
  nextB.append(svgIcon("icon-next", "M5.25 3.75 10.75 8l-5.5 4.25"));
  const stepNote = el("span", "cy-step-note");
  flowBar.append(flowDd, prevB, playB, nextB, stepNote);
  const stepsList = el("div", "cy-steps");
  const flowPanel = el("div", "cy-flow-panel");
  flowPanel.append(flowBar, stepsList);
  const fsDialog = el("dialog", "cy-fs-dialog");
  fsDialog.id = "cy-fs-" + Math.random().toString(36).slice(2, 8);
  fsDialog.setAttribute("aria-label", UI.enterFs);
  document.body.append(fsDialog);
  const fsBtn = el("button", "cy-fullscreen");
  fsBtn.type = "button";
  fsBtn.setAttribute("aria-haspopup", "dialog");
  fsBtn.setAttribute("aria-controls", fsDialog.id);
  fsBtn.setAttribute("aria-expanded", "false");
  fsBtn.setAttribute("aria-label", UI.enterFs);
  fsBtn.append(
    svgIcon("icon-enter", "M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"),
    svgIcon("icon-exit", "M6 2v4H2M14 6V2h-4M10 14v-4h4M2 10h4v4"),
  );
  const stage = el("div", "cy-stage");
  stage.append(canvas, legend, fsBtn);
  container.append(stage, flowPanel);

  const probe = el("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;inline-size:0;block-size:0;overflow:hidden;pointer-events:none";
  container.append(probe);
  const paint = readPaint(probe);
  const cy = cyFactory({
    container: canvas,
    elements: toElements(model, paint),
    userZoomingEnabled: false,
    userPanningEnabled: false,
    boxSelectionEnabled: false,
    autoungrabify: true,
    style: graphStyle(paint),
    layout: { name: "preset" },
  });

  container.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const target = e.target;
    if (!(target instanceof Node) || !canvas.contains(target)) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    cy.zoom({
      level: cy.zoom() * (e.deltaY < 0 ? 1.15 : 1 / 1.15),
      renderedPosition: { x: e.clientX - r.left, y: e.clientY - r.top },
    });
  }, { passive: false });

  // Movement under Cytoscape's 4px tap threshold stays a click.
  let panDrag: { x: number; y: number; panning: boolean; button: number } | null = null;
  // Only the button that started the drag ends it: releasing another button mid-drag must not drop the pan.
  const endPanDrag = (ev?: MouseEvent): void => {
    if (!panDrag) return;
    if (ev && ev.button !== panDrag.button) return;
    panDrag = null;
    canvas.classList.remove("is-panning");
    window.removeEventListener("mousemove", movePanDrag);
    window.removeEventListener("mouseup", endPanDrag);
  };
  const movePanDrag = (ev: MouseEvent): void => {
    if (!panDrag) return;
    const dx = ev.clientX - panDrag.x;
    const dy = ev.clientY - panDrag.y;
    if (!panDrag.panning) {
      if (Math.hypot(dx, dy) < 4) return;
      panDrag.panning = true;
      canvas.classList.add("is-panning");
    }
    panDrag.x = ev.clientX;
    panDrag.y = ev.clientY;
    cy.panBy({ x: dx, y: dy });
  };
  // Left button and wheel button (middle) both pan. Right button stays free for the context menu.
  const beginPan = (oe: MouseEvent): void => {
    if ((oe.button !== 0 && oe.button !== 1) || panDrag) return;
    // A wheel-button press would otherwise start the browser's auto-scroll (Windows) or paste (Linux).
    if (oe.button === 1) oe.preventDefault();
    panDrag = { x: oe.clientX, y: oe.clientY, panning: false, button: oe.button };
    window.addEventListener("mousemove", movePanDrag);
    window.addEventListener("mouseup", endPanDrag);
  };
  cy.on("mousedown", "node, edge", (e) => {
    const oe = e.originalEvent;
    if (!oe) return;
    endPanDrag();
    beginPan(oe);
  });
  canvas.addEventListener("mousedown", beginPan);

  let clamping = false;
  function containDelta(bb: { x1: number; y1: number; x2: number; y2: number; w: number; h: number }, dx: number, dy: number) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || !Number.isFinite(bb.x1) || !Number.isFinite(bb.y1)) return { dx: 0, dy: 0 };
    const pad = Math.min(30, w / 4, h / 4);
    const x1 = bb.x1 + dx, x2 = bb.x2 + dx, y1 = bb.y1 + dy, y2 = bb.y2 + dy;
    let cx = dx, ny = dy;
    if (bb.w <= w - pad * 2) {
      if (x1 < pad) cx += pad - x1;
      else if (x2 > w - pad) cx += w - pad - x2;
    } else if (x1 > pad) cx += pad - x1;
    else if (x2 < w - pad) cx += w - pad - x2;
    if (bb.h <= h - pad * 2) {
      if (y1 < pad) ny += pad - y1;
      else if (y2 > h - pad) ny += h - pad - y2;
    } else if (y1 > pad) ny += pad - y1;
    else if (y2 < h - pad) ny += h - pad - y2;
    return { dx: cx, dy: ny };
  }
  function clampPan(): void {
    if (clamping) return;
    const fix = containDelta(cy.elements().renderedBoundingBox({ includeOverlays: false }), 0, 0);
    if (!fix.dx && !fix.dy) return;
    clamping = true;
    const p = cy.pan();
    cy.pan({ x: p.x + fix.dx, y: p.y + fix.dy });
    clamping = false;
  }
  cy.on("pan zoom", clampPan);

  function focusInView(target: CyElement): void {
    if (!target || target.empty()) return;
    const bb = target.renderedBoundingBox({ includeLabels: true, includeOverlays: false });
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || !Number.isFinite(bb.x1)) return;
    const pad = Math.min(48, w / 5, h / 5);
    let dx = 0, dy = 0;
    if (bb.w >= w - pad * 2) dx = w / 2 - (bb.x1 + bb.w / 2);
    else if (bb.x1 < pad) dx = pad - bb.x1;
    else if (bb.x2 > w - pad) dx = w - pad - bb.x2;
    if (bb.h >= h - pad * 2) dy = h / 2 - (bb.y1 + bb.h / 2);
    else if (bb.y1 < pad) dy = pad - bb.y1;
    else if (bb.y2 > h - pad) dy = h - pad - bb.y2;
    const fix = containDelta(cy.elements().renderedBoundingBox({ includeOverlays: false }), dx, dy);
    if (Math.abs(fix.dx) < 0.5 && Math.abs(fix.dy) < 0.5) return;
    const p = cy.pan();
    const next = { x: p.x + fix.dx, y: p.y + fix.dy };
    const motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!motion) { cy.pan(next); return; }
    cy.animate({ pan: next, duration: 280, easing: "ease-out-cubic", queue: false });
  }

  const showPopover = (e: CyEvent, node: CyElement): void => {
    if (node.hasClass("el-hover")) {
      document.dispatchEvent(new CustomEvent("ns:hide-ref"));
      return;
    }
    const d = node.data();
    const oe = e.originalEvent;
    document.dispatchEvent(new CustomEvent("ns:show-ref", { detail: {
      id: node.id(), label: d.label, desc: d.desc, path: d.path, line: d.line,
      x: oe?.clientX ?? 0, y: oe?.clientY ?? 0,
    }}));
  };
  cy.on("tap", "node", (e) => {
    if (!isCyElement(e.target, cy)) return;
    if (e.target.isParent()) {
      document.dispatchEvent(new CustomEvent("ns:hide-ref"));
      clearFlowFocus();
      return;
    }
    showPopover(e, e.target);
  });
  cy.on("tap", "edge", (e) => {
    if (isCyElement(e.target, cy)) showPopover(e, e.target);
  });
  cy.on("tap", (e) => {
    if (e.target === cy) document.dispatchEvent(new CustomEvent("ns:hide-ref"));
  });
  document.addEventListener("ns:hover-el", (e) => {
    cy.elements().removeClass("el-hover");
    const detail = (e as CustomEvent<{ id?: string }>).detail;
    const t = cy.getElementById(detail.id ?? "");
    if (t.nonempty()) t.addClass("el-hover");
  });
  document.addEventListener("ns:unhover-el", () => {
    cy.elements().removeClass("el-hover");
  });

  const retint = (): void => {
    const next = readPaint(probe);
    cy.elements().forEach((node) => {
      const kind = node.data().change;
      const tone = toneOf(next, typeof kind === "string" ? kind : undefined);
      node.data("_color", tone.line);
      node.data("_bg", tone.fill);
    });
    cy.style()
      .selector("node").style({ color: next.ink })
      .selector("node:parent").style({
        "background-color": next.parentFill,
        "border-color": next.parentLine,
        color: next.parentInk,
      })
      .selector("edge").style({
        color: next.ink,
        "text-background-color": next.plate,
        "text-border-color": next.plateLine,
      })
      .selector("node.el-hover").style({
        "background-color": next.ink, "border-color": next.plate,
        color: next.plate, "underlay-color": next.ink,
      })
      .selector("edge.el-hover").style({
        "line-color": next.ink, "target-arrow-color": next.ink,
        color: next.plate,
        "text-background-color": next.ink, "text-border-color": next.plate,
        "underlay-color": next.ink,
      })
      .update();
  };
  new MutationObserver(retint).observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-theme", "class", "style"],
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", retint);

  function relayout(animate = true, fit = true): Promise<void> {
    const motion = animate && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const layout = cy.layout({
      name: "dagre",
      rankDir: "LR",
      nodeSep: 60,
      rankSep: 180,
      edgeSep: 40,
      animate: motion,
      animationDuration: motion ? 280 : 0,
      animationEasing: "ease-out-cubic",
      fit,
      padding: 30,
    });
    const done = new Promise<void>((resolve) => layout.one("layoutstop", resolve));
    layout.run();
    return done;
  }
  new ResizeObserver(() => {
    cy.resize();
    cy.fit(undefined, 30);
  }).observe(canvas);

  let popoverHome: { parent: Node; next: ChildNode | null } | null = null;
  let diagramHome: { parent: Node; next: ChildNode | null } | null = null;
  function placePopover(inside: boolean): void {
    const pop = document.getElementById("ref-popover");
    if (!pop) return;
    if (inside) {
      if (pop.parentElement === fsDialog) return;
      if (pop.parentNode) popoverHome = { parent: pop.parentNode, next: pop.nextSibling };
      fsDialog.appendChild(pop);
      return;
    }
    if (pop.parentElement !== fsDialog || !popoverHome) return;
    popoverHome.parent.insertBefore(pop, popoverHome.next);
    popoverHome = null;
  }
  function syncFullscreen(): void {
    const on = fsDialog.open;
    fsBtn.setAttribute("aria-expanded", on ? "true" : "false");
    fsBtn.setAttribute("aria-label", on ? UI.exitFs : UI.enterFs);
  }
  function refit(): void {
    cy.resize();
    cy.fit(undefined, 30);
  }
  function openDiagram(): void {
    if (flowMenu.matches(":popover-open")) flowMenu.hidePopover();
    document.dispatchEvent(new CustomEvent("ns:hide-ref"));
    if (container.parentNode) diagramHome = { parent: container.parentNode, next: container.nextSibling };
    if (!fsDialog.open) fsDialog.showModal();
    fsDialog.append(container);
    placePopover(true);
    syncFullscreen();
    requestAnimationFrame(refit);
  }
  function closeDiagram(): void {
    if (fsDialog.open) fsDialog.close();
  }
  fsDialog.addEventListener("cancel", (e) => {
    const pop = document.getElementById("ref-popover");
    const popOpen = pop != null && pop.style.display !== "none";
    const menuOpen = flowMenu.matches(":popover-open");
    const file = document.getElementById("file-dialog");
    const fileOpen = file instanceof HTMLDialogElement && file.open;
    if (!popOpen && !menuOpen && !fileOpen) return;
    e.preventDefault();
    if (popOpen) document.dispatchEvent(new CustomEvent("ns:hide-ref"));
    if (menuOpen) flowMenu.hidePopover();
  });
  fsDialog.addEventListener("close", () => {
    document.dispatchEvent(new CustomEvent("ns:hide-ref"));
    placePopover(false);
    if (diagramHome?.parent && container.parentElement === fsDialog) {
      diagramHome.parent.insertBefore(container, diagramHome.next);
    }
    syncFullscreen();
    requestAnimationFrame(refit);
  });
  fsBtn.addEventListener("click", () => {
    if (fsDialog.open) closeDiagram();
    else openDiagram();
  });

  let flow: GraphFlow | null = null;
  let stepIdx = -1;
  let timer: ReturnType<typeof setInterval> | null = null;
  const flowsWithSteps = (model.flows ?? []).filter((f) => f.steps?.length);

  function optionButton(value: string, title: string): HTMLButtonElement {
    const opt = el("button", "cy-flow-option", title);
    opt.type = "button";
    opt.setAttribute("role", "option");
    opt.dataset.value = value;
    opt.tabIndex = -1;
    opt.setAttribute("aria-selected", "false");
    return opt;
  }
  function markStepRow(): void {
    stepsList.querySelectorAll(".cy-step").forEach((r) => {
      if (!(r instanceof HTMLElement)) return;
      r.classList.toggle("active", Number(r.dataset.step) === stepIdx);
    });
  }
  function revealActiveRow(): void {
    const row = stepsList.querySelector(".cy-step.active");
    if (!(row instanceof HTMLElement)) return;
    const listRect = stepsList.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < listRect.top) stepsList.scrollTop -= listRect.top - rowRect.top;
    else if (rowRect.bottom > listRect.bottom) stepsList.scrollTop += rowRect.bottom - listRect.bottom;
  }
  function paintFlowMembers(): void {
    cy.elements().removeClass("flow-member step-active");
    if (!flow?.steps) return;
    for (const s of flow.steps) {
      const t = cy.getElementById(s.target);
      if (t.nonempty()) t.addClass("flow-member");
    }
  }
  function applyFlow(): void {
    paintFlowMembers();
    stepNote.textContent = "";
    stepsList.replaceChildren();
    if (!flow?.steps) return;
    flow.steps.forEach((s, i) => {
      const row = el("button", "cy-step");
      row.type = "button";
      row.dataset.step = String(i);
      row.append(el("span", "cy-step-idx", String(i + 1)), el("span", "cy-step-text", s.note));
      row.addEventListener("click", () => {
        stopPlayback();
        stepIdx = i;
        showStep();
      });
      stepsList.appendChild(row);
    });
    markStepRow();
  }
  function markFlowOption(id: string): void {
    const value = id || "";
    const picked = flowsWithSteps.find((f) => f.id === value);
    flowLabel.textContent = picked ? picked.title : "—";
    flowBtn.setAttribute("aria-label", picked ? `${UI.flow}: ${picked.title}` : UI.flow);
    flowMenu.querySelectorAll(".cy-flow-option").forEach((opt) => {
      if (!(opt instanceof HTMLElement)) return;
      const on = opt.dataset.value === value;
      opt.setAttribute("aria-selected", on ? "true" : "false");
      opt.tabIndex = on ? 0 : -1;
    });
  }
  function showStep(): void {
    cy.elements().removeClass("step-active");
    stepNote.textContent = "";
    markStepRow();
    if (!flow?.steps || stepIdx < 0 || stepIdx >= flow.steps.length) return;
    const step = flow.steps[stepIdx];
    if (!step) return;
    paintFlowMembers();
    const target = cy.getElementById(step.target);
    if (target.nonempty()) target.addClass("step-active");
    stepNote.textContent = `${stepIdx + 1}/${flow.steps.length} — ${step.note}`;
    revealActiveRow();
    focusInView(target);
  }
  function clearFlowFocus(): void {
    stopPlayback();
    stepIdx = -1;
    cy.elements().removeClass("step-active");
    stepNote.textContent = "";
    markStepRow();
  }
  function stopPlayback(): void {
    if (timer) clearInterval(timer);
    timer = null;
    playB.setAttribute("aria-pressed", "false");
  }
  function nextStep(): void {
    if (!flow?.steps?.length) return;
    stepIdx = (stepIdx + 1) % flow.steps.length;
    showStep();
  }
  function prevStep(): void {
    if (!flow?.steps?.length) return;
    stepIdx = (stepIdx - 1 + flow.steps.length) % flow.steps.length;
    showStep();
  }
  function startPlayback(): void {
    if (!flow) return;
    stopPlayback();
    if (stepIdx < 0) nextStep();
    playB.setAttribute("aria-pressed", "true");
    timer = setInterval(nextStep, PLAY_MS);
  }
  function rebuildFlowSel(): void {
    flowMenu.replaceChildren();
    flowMenu.appendChild(optionButton("", "—"));
    for (const f of flowsWithSteps) flowMenu.appendChild(optionButton(f.id, f.title));
    flow = null;
    stepIdx = -1;
    markFlowOption("");
    applyFlow();
  }

  flowMenu.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const opt = target.closest(".cy-flow-option");
    if (!(opt instanceof HTMLElement)) return;
    flow = flowsWithSteps.find((f) => f.id === opt.dataset.value) ?? null;
    stepIdx = flow ? 0 : -1;
    stopPlayback();
    markFlowOption(flow?.id || "");
    applyFlow();
    if (flow) showStep();
    if (flowMenu.matches(":popover-open")) flowMenu.hidePopover();
  });
  flowMenu.addEventListener("toggle", () => {
    const open = flowMenu.matches(":popover-open");
    flowBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) return;
    const current = flowMenu.querySelector('[aria-selected="true"]') ||
      flowMenu.querySelector(".cy-flow-option");
    if (current instanceof HTMLElement) current.focus();
  });
  flowMenu.addEventListener("keydown", (e) => {
    const items = [...flowMenu.querySelectorAll(".cy-flow-option")].filter(
      (n): n is HTMLElement => n instanceof HTMLElement,
    );
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % items.length;
    else if (e.key === "ArrowUp") next = i < 0 ? items.length - 1 : (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    items[next]?.focus();
  });
  flowBtn.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    if (!flowMenu.matches(":popover-open")) flowBtn.click();
  });
  playB.addEventListener("click", () => {
    if (timer) { stopPlayback(); return; }
    startPlayback();
  });
  nextB.addEventListener("click", () => { stopPlayback(); nextStep(); });
  prevB.addEventListener("click", () => { stopPlayback(); prevStep(); });

  if (flowsWithSteps.length) container.classList.add("has-flows");
  rebuildFlowSel();
  void relayout(false);
}

function injectCss(): void {
  if (document.getElementById("nsx-diagram-css")) return;
  const styleEl = document.createElement("style");
  styleEl.id = "nsx-diagram-css";
  styleEl.textContent = DIAGRAM_CSS;
  document.head.appendChild(styleEl);
}

export function mountDiagrams(): void {
  const cyFactory = cytoscapeLib();
  if (!cyFactory) return;
  injectCss();
  document.querySelectorAll(".lens-diagram").forEach((node) => {
    if (node instanceof HTMLElement) mount(node, cyFactory);
  });
}
