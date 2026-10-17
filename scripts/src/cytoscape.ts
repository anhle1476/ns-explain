// The page loads cytoscape from a CDN script. This is only the surface the
// viewer calls — the library itself stays outside the bundle.
import type { Box } from "./types.ts";

export interface CyElement {
  id(): string;
  data(): Record<string, unknown>;
  data(name: string, value: string): void;
  hasClass(name: string): boolean;
  addClass(name: string): CyElement;
  removeClass(name: string): CyElement;
  nonempty(): boolean;
  empty(): boolean;
  isParent(): boolean;
  renderedBoundingBox(opts?: {
    includeOverlays?: boolean;
    includeLabels?: boolean;
  }): Box;
}

export interface CyCollection {
  removeClass(name: string): CyCollection;
  renderedBoundingBox(opts?: { includeOverlays?: boolean }): Box;
  forEach(fn: (el: CyElement) => void): void;
}

export interface CyStylesheet {
  selector(selector: string): CyStylesheet;
  style(style: Record<string, string | number>): CyStylesheet;
  update(): void;
}

export interface CyEvent {
  target: CyElement | CyCore;
  originalEvent?: MouseEvent;
}

export interface CyLayout {
  one(event: "layoutstop", handler: () => void): void;
  run(): void;
}

export interface CyLayoutOptions {
  name: string;
  rankDir?: string;
  nodeSep?: number;
  rankSep?: number;
  edgeSep?: number;
  animate?: boolean;
  animationDuration?: number;
  animationEasing?: string;
  fit?: boolean;
  padding?: number;
}

export interface CyStyleBlock {
  selector: string;
  style: Record<string, string | number>;
}

export interface CyCore {
  elements(selector?: string): CyCollection & {
    map(fn: (el: CyElement) => unknown): unknown[];
  };
  getElementById(id: string): CyElement;
  on(event: string, selector: string, handler: (e: CyEvent) => void): void;
  on(event: string, handler: (e: CyEvent) => void): void;
  pan(): { x: number; y: number };
  pan(pos: { x: number; y: number }): void;
  panBy(delta: { x: number; y: number }): void;
  zoom(): number;
  zoom(opts: { level: number; renderedPosition: { x: number; y: number } }): void;
  resize(): void;
  fit(eles: undefined, padding: number): void;
  animate(opts: {
    pan: { x: number; y: number };
    duration: number;
    easing: string;
    queue: boolean;
  }): void;
  layout(opts: CyLayoutOptions): CyLayout;
  style(): CyStylesheet;
}

export interface CyOptions {
  container: HTMLElement;
  elements: unknown[];
  userZoomingEnabled: boolean;
  userPanningEnabled: boolean;
  boxSelectionEnabled: boolean;
  autoungrabify: boolean;
  style: CyStyleBlock[];
  layout: { name: string };
}

export interface CytoscapeStatic {
  (options: CyOptions): CyCore;
  use(extension: unknown): void;
}

export function cytoscapeLib(): CytoscapeStatic | null {
  const w = window as Window & {
    cytoscape?: CytoscapeStatic;
    cytoscapeDagre?: unknown;
  };
  if (!w.cytoscape) return null;
  if (w.cytoscapeDagre) w.cytoscape.use(w.cytoscapeDagre);
  return w.cytoscape;
}
