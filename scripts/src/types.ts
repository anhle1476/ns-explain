/** Graph JSON embedded in an exported page. The renderer adds `lang`. */

export type ChangeKind = "added" | "removed" | "modified" | "same";

export interface GraphNode {
  id: string;
  label: string;
  kind?: string;
  parent?: string;
  change?: ChangeKind | string;
  desc?: string;
  path?: string;
  line?: number;
  lens?: string[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  decides?: string;
  path?: string;
  line?: number;
  change?: ChangeKind | string;
  lens?: string[];
}

export interface GraphStep {
  target: string;
  note: string;
}

export interface GraphFlow {
  id: string;
  title: string;
  steps?: GraphStep[];
}

export interface GraphModel {
  lang?: string;
  labels?: Record<string, string>;
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  flows?: GraphFlow[];
}

export interface RefData {
  id?: string;
  label?: string;
  desc?: string;
  path?: string;
  line?: number | string;
  x?: number;
  y?: number;
}

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  h: number;
}
