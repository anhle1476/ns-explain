#!/usr/bin/env node
// ns-explain artifact renderer — the HTML shell is fixed (template.html); the
// agent writes only a JSON manifest and this CLI injects it. On render it
// builds the TypeScript viewer and page runtime and packs that bundle into
// the HTML, so the export is one file.
//
// Usage:
//   node ns-explain.ts                  terse index
//   node ns-explain.ts playbook         manifest schema + authoring rules
//   node ns-explain.ts render <file.json>   -> .ns-explain/<name>.html
//   node ns-explain.ts serve <file.html>    serve + open (same as serve.ts)

import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, dirname, join, basename } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { GraphModel } from "./src/types.ts";

interface Copy {
  features: string;
  plain: string;
  diagram: string;
  flows: string;
  viewFile: string;
  groups: Record<string, string>;
}
interface TestCopy {
  title: string; notRun: string; passed: string; skipped: string;
  scope: string; scopes: Record<string, string>; command: string;
  failedHead: string; failedNone: string; earlier: string; cause: string;
  changesHead: string; specDesc: string; kinds: Record<string, string>;
}
interface TestFailure { name?: string; message?: string }
interface TestRun {
  label?: string; cause?: string;
  passed?: number; total?: number; skipped?: number; failed?: TestFailure[];
}
interface TestCase { kind?: string; name?: string; line?: number; behavior?: string }
interface TestFile { path?: string; line?: number; desc?: string; tests?: TestCase[] }
interface TestResults extends TestRun {
  notRun?: string; command?: string; scope?: string; scopeNote?: string;
  environment?: string; earlier?: TestRun[]; files?: TestFile[];
}
interface FeatureHunk { path: string; line?: number; diff: string; explain: string }
interface FeatureChange { kind?: string; text?: string; old?: string; new?: string; hunks: FeatureHunk[] }
interface FeatureNode { label: string; children: FeatureNode[]; changes: FeatureChange[] }
interface LegacyGroup { group?: string; items?: unknown[] }
interface Concept { term?: string; explain?: string }
interface Manifest {
  name?: string;
  lang?: string;
  title?: string;
  oneLiner?: string;
  featureTree?: unknown[];
  plainTerms?: string;
  lenses?: { creational?: string; structural?: string; behavioral?: string };
  pseudocode?: { title?: string; code?: string }[];
  concepts?: Concept[];
  graph?: GraphModel;
  theme?: string;
  extraHead?: string;
  testResults?: TestResults;
  files?: string[];
}

const DIR = dirname(fileURLToPath(import.meta.url)); // scripts/
const SELF = join(DIR, "ns-explain.ts");
const cmd = process.argv[2];
const rest = process.argv.slice(3);

const HELP = `ns-explain artifact renderer — fixed HTML shell, manifest-driven.

commands:
  playbook                 manifest schema + authoring rules (read before writing one)
  render <manifest.json>   build the viewer and pack it into .ns-explain/<name>.html
  serve <file.html>        serve the file's dir over HTTP and open the browser
  help                     this index

manifest[12]{field,required}:
  name*        kebab-case output name (default: manifest filename stem)
  lang         "vi" (default) | "en" — drives section labels + diagram legend
  title*       document title
  oneLiner*    one-sentence summary (HTML fragment, may hold .ref spans)
  featureTree  nested [{label, children, changes:[{kind, text|old, new, hunks:[{path, line, diff, explain}]}]}] — see playbook
  plainTerms   HTML paragraphs (features only, no identifiers)
  lenses       {creational, structural, behavioral} — HTML fragments
  pseudocode   [{title, code}] — one per flow; code is plain text
  concepts     [{term, explain}] — plain popovers on words the user asked about
  graph*       lens-diagram JSON DSL (labels, nodes, edges, flows)
  theme        "system" (default) or a daisyui theme name
  extraHead    optional HTML for <head> — project fonts, tokens
  files        extra repo-relative paths to embed beyond auto-detected refs
  testResults  {command, scope: full|package|related, scopeNote, passed, total, skipped, failed:[{name, message}], earlier:[run], files:[{path, line, tests:[{kind: added|modified, name, behavior}]}]} | {notRun: "reason", files} — LAST section; only when the change added or edited tests; numbers from a run that really happened

* required. workflow: playbook -> write .ns-explain/<name>.json -> render -> serve (background)`;

const L10N = {
  vi: {
    features: "Tính năng bị ảnh hưởng", plain: "Nói cho dễ hiểu",
    tests: {
      title: "Kết quả test", notRun: "Chưa chạy test", passed: "đạt", skipped: "bỏ qua",
      scope: "Phạm vi", scopes: { full: "Toàn bộ repo", package: "Cả package", related: "Chỉ spec liên quan" },
      command: "Lệnh chạy", failedHead: "Test lỗi", failedNone: "Không có test nào lỗi.",
      earlier: "Lần chạy trước đó", cause: "Nguyên nhân",
      changesHead: "Test thêm hoặc sửa trong change này",
      specDesc: "File spec có test thêm hoặc sửa trong change này.",
      kinds: { added: "Thêm", modified: "Sửa" },
    },
    diagram: "Sơ đồ", flows: "Luồng chạy", viewFile: "Xem file",
    groups: { added: "Thêm", modified: "Sửa", removed: "Xóa" },
    comments: {
      comment: "Bình luận", placeholder: "Viết bình luận…", hint: "Ctrl+Enter để lưu",
      save: "Lưu", cancel: "Hủy", edit: "Sửa", remove: "Xóa",
      copy: "Sao chép bình luận", copied: "Đã sao chép", copyFailed: "Không sao chép được",
      copyEmpty: "Chưa có bình luận. Rê chuột vào một đoạn, hoặc bôi đen chữ, để thêm.",
      list: "Bình luận", jump: "Đến chỗ này", clear: "Xóa tất cả",
      clearConfirm: "Bấm lại để xóa hết", close: "Đóng",
      selected: "Đoạn đã chọn", locTitle: "Tiêu đề", locSummary: "Tóm tắt",
      locParagraph: "Đoạn", locItem: "Mục", locDiagram: "Sơ đồ",
      locPopover: "Giải thích chi tiết", locFile: "Xem file",
    },
  },
  en: {
    tests: {
      title: "Test results", notRun: "Tests not run", passed: "passed", skipped: "skipped",
      scope: "Scope", scopes: { full: "Whole repo", package: "Whole package", related: "Related specs only" },
      command: "Command", failedHead: "Failed tests", failedNone: "No test failed.",
      earlier: "Earlier run", cause: "Cause",
      changesHead: "Tests added or edited in this change",
      specDesc: "Spec file with tests added or edited in this change.",
      kinds: { added: "Added", modified: "Modified" },
    },
    features: "Features affected", plain: "In plain terms",
    diagram: "Diagram", flows: "Flows", viewFile: "View file",
    groups: { added: "Added", modified: "Modified", removed: "Removed" },
    comments: {
      comment: "Comment", placeholder: "Write a comment…", hint: "Ctrl+Enter to save",
      save: "Save", cancel: "Cancel", edit: "Edit", remove: "Delete",
      copy: "Copy comments", copied: "Copied", copyFailed: "Copy failed",
      copyEmpty: "No comments yet. Hover a block, or select text, to add one.",
      list: "Comments", jump: "Jump to", clear: "Clear all",
      clearConfirm: "Click again to clear", close: "Close",
      selected: "Selected text", locTitle: "Title", locSummary: "Summary",
      locParagraph: "Paragraph", locItem: "Item", locDiagram: "Diagram",
      locPopover: "Detail popover", locFile: "File view",
    },
  },
};

const SYSTEM_THEME_SCRIPT = `<script>
  const themeQuery = matchMedia("(prefers-color-scheme: dark)");
  const applySystemTheme = () =>
    (document.documentElement.dataset.theme = themeQuery.matches ? "dark" : "light");
  applySystemTheme();
  themeQuery.addEventListener("change", applySystemTheme);
</script>`;

const escHtml = (s: unknown) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Safe inside a <script type="application/json"> block — a file body or graph
// label can never break out of the script tag.
// `<` becomes \u003c, which JSON.parse reads back as `<`. Escaping only `</` is not enough: an embedded file
// holding `<!--` followed by `<script` puts the HTML parser in the "double escaped" state, where `</script>`
// no longer ends the block and everything after it, bundle included, is swallowed.
const escJson = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");

const FT_CLASS: Record<string, string> = { added: "ft-added", modified: "ft-modified", removed: "ft-removed" };
const FT_KINDS = new Set(["added", "modified", "removed"]);

// A concept span inside the feature button would be a second button. Keep the
// mark so the word still counts, and let the row button take the click.
function inertTerms(html: string): string {
  return html.replaceAll(
    ` role="button" tabindex="0" aria-expanded="false" aria-controls="ref-popover"`,
    "",
  );
}

function cleanHunk(raw: unknown, where: string, warnings: string[]): FeatureHunk | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push(`featureTree: ${where} hunk is not an object`);
    return null;
  }
  const rec = raw as { path?: unknown; line?: unknown; diff?: unknown; explain?: unknown };
  const path = String(rec.path ?? "").trim();
  const diff = rec.diff == null ? "" : String(rec.diff).replace(/\n$/, "");
  if (!path || !diff) {
    warnings.push(`featureTree: ${where} hunk needs a path and a diff`);
    return null;
  }
  let line: number | undefined;
  if (rec.line != null && rec.line !== "") {
    const n = Number(rec.line);
    if (!Number.isInteger(n) || n < 1)
      warnings.push(`featureTree: ${where} hunk line "${rec.line}" is not a line number`);
    else line = n;
  }
  const explain = String(rec.explain ?? "").replace(/\s+/g, " ").trim();
  if (!explain)
    warnings.push(
      `featureTree: ${where} hunk has no plain explanation — say what this diff does in a sentence a reader understands`,
    );
  return { path, line, diff, explain };
}

function cleanHunks(raw: unknown, where: string, warnings: string[]): FeatureHunk[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    warnings.push(
      `featureTree: ${where} change has no source hunks — put the diff lines that implement it in hunks`,
    );
    return [];
  }
  const hunks = raw
    .map((hunk, i) => cleanHunk(hunk, `${where} hunks[${i}]`, warnings))
    .filter((hunk): hunk is FeatureHunk => hunk != null);
  if (!hunks.length)
    warnings.push(
      `featureTree: ${where} change has no source hunks — put the diff lines that implement it in hunks`,
    );
  return hunks;
}

function cleanChange(raw: unknown, where: string, warnings: string[]): FeatureChange | null {
  if (!raw || typeof raw !== "object") {
    warnings.push(`featureTree: ${where} change is not an object`);
    return null;
  }
  const rec = raw as { kind?: unknown; text?: unknown; old?: unknown; new?: unknown; hunks?: unknown };
  const text = rec.text != null ? String(rec.text) : undefined;
  const old = rec.old != null ? String(rec.old) : undefined;
  const neu = rec.new != null ? String(rec.new) : undefined;
  let kind = String(rec.kind ?? "").trim();
  if (!kind && (old != null || neu != null)) kind = "modified";
  if (!FT_KINDS.has(kind)) {
    warnings.push(`featureTree: ${where} change needs kind added, modified, or removed`);
    return null;
  }
  if (kind === "modified" && (old == null || neu == null)) {
    warnings.push(`featureTree: ${where} modified change needs old and new`);
    return null;
  }
  if (kind !== "modified" && text == null && old == null && neu == null) {
    warnings.push(`featureTree: ${where} change needs text`);
    return null;
  }
  return { kind, text, old, new: neu, hunks: cleanHunks(rec.hunks, where, warnings) };
}

function normalizeNode(raw: unknown, warnings: string[], path: string): FeatureNode | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push(`featureTree: ${path} is not a {label, children, changes} node`);
    return null;
  }
  const rec = raw as FeatureNode & LegacyGroup & { items?: unknown };
  const label = String(rec.label ?? "").trim();
  if (!label) {
    warnings.push(`featureTree: ${path} is missing a label`);
    return null;
  }
  const children = (Array.isArray(rec.children) ? rec.children : [])
    .map((child, i) => normalizeNode(child, warnings, `${path}.children[${i}]`))
    .filter((child): child is FeatureNode => child != null);
  const changes = (Array.isArray(rec.changes) ? rec.changes : [])
    .map((change, i) => cleanChange(change, `${path} "${label}"`, warnings))
    .filter((change): change is FeatureChange => change != null);
  return { label, children, changes };
}

function legacyNode(group: LegacyGroup, t: Copy, warnings: string[]): FeatureNode | null {
  const kind = String(group.group ?? "").trim();
  const label = t.groups[kind] ?? kind;
  if (!label) return null;
  const children = (group.items ?? []).map((item, i) => {
    const path = `featureTree ${label}[${i}]`;
    if (typeof item === "string") {
      const change = cleanChange({ kind, text: item }, path, warnings);
      return { label: item, children: [], changes: change ? [change] : [] };
    }
    if (item && typeof item === "object") {
      const rec = item as FeatureChange;
      if (rec.old != null || rec.new != null) {
        const change = cleanChange({ kind: "modified", old: rec.old, new: rec.new }, path, warnings);
        const face = String(rec.new ?? rec.old ?? "").trim();
        return { label: face || label, children: [], changes: change ? [change] : [] };
      }
    }
    warnings.push(`featureTree: ${path} is not a feature string or {old, new}`);
    return null;
  }).filter((node): node is FeatureNode => node != null && node.label.trim() !== "");
  return { label, children, changes: [] };
}

function isLegacyTree(raw: unknown[]): boolean {
  return raw.length > 0 && raw.every((node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    const rec = node as LegacyGroup & { label?: unknown; children?: unknown };
    return "group" in rec && "items" in rec && rec.label == null && rec.children == null;
  });
}

function normalizeTree(raw: unknown, t: Copy, warnings: string[]): { nodes: FeatureNode[]; legacy: boolean } {
  if (raw == null) return { nodes: [], legacy: false };
  if (!Array.isArray(raw)) {
    warnings.push("featureTree: expected a list of nested features");
    return { nodes: [], legacy: false };
  }
  if (isLegacyTree(raw)) {
    const nodes = raw
      .map((group) => legacyNode(group as LegacyGroup, t, warnings))
      .filter((node): node is FeatureNode => node != null && node.children.length > 0);
    return { nodes, legacy: true };
  }
  const nodes = raw
    .map((node, i) => normalizeNode(node, warnings, `featureTree[${i}]`))
    .filter((node): node is FeatureNode => node != null);
  return { nodes, legacy: false };
}

interface ShownHunk extends FeatureHunk { where: string }

function sourceHunks(node: FeatureNode, prefix: string): ShownHunk[] {
  const own = node.changes.flatMap((change) =>
    change.hunks.map((hunk) => ({ ...hunk, where: prefix })));
  const nested = node.children.flatMap((child) =>
    sourceHunks(child, prefix ? `${prefix} / ${child.label}` : child.label));
  return [...own, ...nested];
}

// The row already shows this node's own description. The popover lists the
// source hunks that implement it and the features under it.
function relativeHunks(node: FeatureNode): ShownHunk[] {
  const own = node.changes.flatMap((change) =>
    change.hunks.map((hunk) => ({ ...hunk, where: "" })));
  const nested = node.children.flatMap((child) => sourceHunks(child, child.label));
  return [...own, ...nested];
}

function nestedKinds(node: FeatureNode): string[] {
  return node.children.flatMap((child) => [
    ...child.changes.map((change) => change.kind ?? ""),
    ...nestedKinds(child),
  ]);
}

function renderTree(raw: unknown, t: Copy, concepts: Concept[], warnings: string[]): string {
  const { nodes, legacy } = normalizeTree(raw, t, warnings);
  if (!nodes.length) return "";
  if (legacy)
    warnings.push(
      "featureTree: grouped by added/modified/removed — nest by what the user sees, and split each feature down to the smallest behavior",
    );
  else if (nodes.length > 1 && nodes.every((node) => node.children.length === 0))
    warnings.push(
      "featureTree: flat list — nest features under what the user sees and split each one down to the smallest behavior",
    );
  const bare: string[] = [];
  const findBare = (list: FeatureNode[]) => {
    for (const node of list) {
      if (!node.children.length && !node.changes.length) bare.push(node.label);
      else findBare(node.children);
    }
  };
  findBare(nodes);
  for (const label of bare)
    warnings.push(
      `featureTree: "${label}" has no changes — put the added, modified, or removed behavior on the smallest node`,
    );

  const textOf = (value: string) => wrapConcepts(escHtml(value), concepts);
  let seq = 0;
  const hunkBody = (change: FeatureChange) => {
    if (change.old != null || change.new != null) {
      const old = change.old != null ? `<del class="ft-old">${textOf(change.old)}</del>` : "";
      const sep = old && change.new != null ? `<span class="ft-sep"> → </span>` : "";
      const neu = change.new != null ? `<span class="ft-new">${textOf(change.new)}</span>` : "";
      return `${old}${sep}${neu}`;
    }
    const text = textOf(change.text ?? "");
    if (change.kind === "removed") return `<del>${text}</del>`;
    if (change.kind === "added") return `<span class="ft-new">${text}</span>`;
    return text;
  };
  const diffHtml = (diff: string) =>
    diff.replaceAll("\r\n", "\n").split("\n").map((line) => {
      const cls = line.startsWith("+") && !line.startsWith("+++")
        ? "ft-add"
        : line.startsWith("-") && !line.startsWith("---")
          ? "ft-del"
          : "ft-ctx";
      return `<span class="${cls}">${escHtml(line)}</span>`;
    }).join("\n");
  const hunkHtml = (hunk: ShownHunk) => {
    const where = hunk.where ? `<p class="ft-where">${textOf(hunk.where)}</p>` : "";
    const explain = hunk.explain ? `<p class="ft-explain">${textOf(hunk.explain)}</p>` : "";
    const at = hunk.line != null ? `${hunk.path}:${hunk.line}` : hunk.path;
    return `<li class="ft-hunk">${where}${explain}<p class="ft-path">${escHtml(at)}</p><pre class="ft-diff">${diffHtml(hunk.diff)}</pre></li>`;
  };
  const renderNode = (node: FeatureNode): string => {
    const hunks = relativeHunks(node);
    const kids = node.children.length
      ? `<ul>${node.children.map(renderNode).join("")}</ul>`
      : "";
    const toneSource = node.changes.length
      ? node.changes.map((change) => change.kind ?? "")
      : nestedKinds(node);
    const kinds = new Set(toneSource.filter(Boolean));
    const tone = kinds.size === 1 ? (FT_CLASS[[...kinds][0] ?? ""] ?? "") : "";
    const desc = node.changes.map(hunkBody).join(" ");
    const face = desc ? `${textOf(node.label)} ${desc}` : textOf(node.label);
    if (!hunks.length)
      return `<li class="ft-item"><div class="ft-row"><span class="${["ft-label", tone].filter(Boolean).join(" ")}">${inertTerms(face)}</span></div>${kids}</li>`;
    const n = ++seq;
    return `<li class="ft-item"><div class="ft-row">` +
      `<button type="button" class="${["ft-trigger", tone].filter(Boolean).join(" ")}" id="ftb-${n}" popovertarget="ftc-${n}" aria-expanded="false" aria-controls="ftc-${n}">${inertTerms(face)}</button>` +
      `<div id="ftc-${n}" class="ft-changes" popover aria-labelledby="ftb-${n}"><ul>${hunks.map(hunkHtml).join("")}</ul></div>` +
      `</div>${kids}</li>`;
  };
  return `<div class="ftree-scroll"><ul class="ftree">${nodes.map(renderNode).join("")}</ul></div>`;
}

// Tokens that mean "code", not "what the user sees" — features-only fields
// (featureTree, plainTerms) must describe behavior, never name identifiers.
const IDENT_LIKE = [
  { re: /[\w-]+\.(ts|tsx|js|jsx|mjs|cjs|go|rs|py|java|kt|kts|swift|rb|php|cs|cpp|c|h|vue|svelte|proto|sql|css|scss|less|ya?ml|toml|sh|md)\b/, why: "file name" },
  { re: /\b[\w-]+\/[\w-]+\/[\w/-]+/, why: "path" },
  { re: /\b\w+\(\)/, why: "call" },
  { re: /\b[a-z]{2,}[A-Z][A-Za-z]*[a-z]\b/, why: "camelCase identifier" },
  { re: /\b[a-z]+_[a-z0-9_]+\b/, why: "snake_case identifier" },
  { re: /\b[a-z]+(-[a-z0-9]+){2,}\b/, why: "kebab-case identifier" },
];

function checkFeaturesOnly(field: string, texts: unknown[], warnings: string[]) {
  for (const text of texts.filter(Boolean)) {
    for (const { re, why } of IDENT_LIKE) {
      const m = String(text).match(re);
      if (m)
        warnings.push(
          `${field}: "${m[0]}" looks like a ${why} — features-only prose names no identifiers/paths`,
        );
    }
  }
}

const stripTags = (html: string) => String(html).replace(/<[^>]+>/g, " ");

const escAttr = (s: string) => escHtml(s).replace(/"/g, "&quot;");

// Whole word, case-insensitive, including letters outside ASCII. Longer terms
// are tried first so "page size" wins over "page".
function conceptPattern(concepts: Concept[]): RegExp | null {
  const terms = concepts
    .map((c) => c.term?.trim() ?? "")
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!terms.length) return null;
  const alts = terms.map((term) => term.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"));
  return new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${alts.join("|")})(?![\\p{L}\\p{N}_])`,
    "giu",
  );
}

function normalizeConcepts(raw: Concept[] | undefined, warnings: string[]): Concept[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    warnings.push("concepts: expected a list of {term, explain}");
    return [];
  }
  const seen = new Set<string>();
  const out: Concept[] = [];
  for (const item of raw) {
    const term = String(item?.term ?? "").trim();
    const explain = String(item?.explain ?? "").replace(/\s+/g, " ").trim();
    if (!term || !explain) {
      warnings.push(`concepts: "${term || "?"}" needs both term and a plain explanation`);
      continue;
    }
    const key = term.toLowerCase();
    if (seen.has(key)) {
      warnings.push(`concepts: "${term}" is listed twice — the first explanation is kept`);
      continue;
    }
    seen.add(key);
    out.push({ term, explain });
  }
  return out;
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "source", "track", "wbr",
]);

// Quote-aware. A `>` inside data-desc="Promise<boolean>" stays inside the tag.
function splitTags(html: string): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i < html.length) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      const j = end === -1 ? html.length : end + 3;
      parts.push(html.slice(i, j));
      i = j;
      continue;
    }
    if (html[i] === "<" && /^<\/?[a-zA-Z!]/.test(html.slice(i))) {
      let j = i + 1;
      let quote = "";
      while (j < html.length) {
        const ch = html[j];
        if (quote) {
          if (ch === quote) quote = "";
        } else if (ch === "\"" || ch === "'") quote = ch;
        else if (ch === ">") { j++; break; }
        j++;
      }
      parts.push(html.slice(i, j));
      i = j;
      continue;
    }
    const next = html.indexOf("<", i + (html[i] === "<" ? 1 : 0));
    const end = next === -1 ? html.length : next;
    parts.push(html.slice(i, end));
    i = end;
  }
  return parts;
}

function isSkipElement(name: string, tag: string): boolean {
  if (name === "code" || name === "pre" || name === "script" || name === "style") return true;
  if (name !== "span") return false;
  const cls = /\bclass\s*=\s*["']([^"']*)["']/.exec(tag)?.[1] ?? "";
  const tokens = cls.split(/\s+/);
  return tokens.includes("term") || tokens.includes("ref");
}

// Wrap concept words in prose. Skip code, pre, and existing .ref / .term
// spans so a component name is not wrapped a second time.
function wrapConcepts(html: string, concepts: Concept[]): string {
  const re = conceptPattern(concepts);
  if (!re || !html) return html;
  const byTerm = new Map(concepts.map((c) => [c.term?.trim().toLowerCase() ?? "", c.term?.trim() ?? ""]));
  let skip = 0;
  return splitTags(html).map((part) => {
    if (part.startsWith("<") || part.startsWith("<!--")) {
      const named = /^<\s*(\/?)\s*([a-zA-Z][\w:-]*)/.exec(part);
      if (!named) return part;
      const closing = named[1] === "/";
      const name = named[2].toLowerCase();
      const selfClose = /\/>\s*$/.test(part) || VOID_TAGS.has(name);
      if (closing) {
        if (skip > 0) skip--;
      } else if (!selfClose && (skip > 0 || isSkipElement(name, part))) {
        skip++;
      }
      return part;
    }
    if (skip > 0) return part;
    re.lastIndex = 0;
    return part.replace(re, (match) => {
      const term = byTerm.get(match.toLowerCase());
      if (!term) return match;
      return `<span class="term" role="button" tabindex="0" aria-expanded="false" aria-controls="ref-popover" data-term="${escAttr(term)}">${match}</span>`;
    });
  }).join("");
}

// A term is present when render wrapped it, or a .ref / diagram label is exactly
// that word (those popovers gain the explanation without a second span).
function conceptIsPresent(term: string, wrapped: string[], labels: string[]): boolean {
  const attr = `data-term="${escAttr(term)}"`;
  if (wrapped.some((html) => html.includes(attr))) return true;
  const key = term.toLowerCase();
  return labels.some((label) => label.trim().toLowerCase() === key);
}

function treeTexts(nodes: unknown): unknown[] {
  const out: unknown[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") { out.push(value); return; }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    const rec = value as Record<string, unknown>;
    for (const key of ["label", "text", "old", "new", "explain"]) if (key in rec) out.push(rec[key]);
    if (Array.isArray(rec.items)) rec.items.forEach(walk);
    if (Array.isArray(rec.children)) rec.children.forEach(walk);
    if (Array.isArray(rec.changes)) rec.changes.forEach(walk);
    if (Array.isArray(rec.hunks)) rec.hunks.forEach(walk);
  };
  walk(nodes);
  return out;
}

// Parse `.ref` spans; attrs may hold `>` inside quoted values (e.g.
// data-desc="Promise<boolean>"), so the attr scan is quote-aware.
const REF_RE =
  /<span class="ref"((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/span>/g;
const ATTR_RE = /([\w-]+)=["']([^"']*)["']/g;

function checkRefs(fragments: unknown[], warnings: string[]) {
  for (const frag of fragments) {
    for (const m of String(frag).matchAll(REF_RE)) {
      const attrs = Object.fromEntries(
        [...m[1].matchAll(ATTR_RE)].map((a) => [a[1], a[2]]),
      );
      const label = m[2].replace(/<[^>]+>/g, "").trim();
      const at = `ref "${label || "?"}"`;
      if (!attrs["data-path"])
        warnings.push(
          `${at}: missing data-path — every popover needs a file; point platform APIs at the closest repo call site`,
        );
      if (!attrs["data-desc"]) warnings.push(`${at}: missing data-desc`);
      if (attrs["data-line"] != null && !/^\d+$/.test(attrs["data-line"]))
        warnings.push(`${at}: data-line "${attrs["data-line"]}" is not a line number`);
      if (/:\d+$/.test(label) || /[\w-]+\/[\w/-]+/.test(label))
        warnings.push(
          `${at}: label looks like a path — the label shows only the component name; the location lives in the popover`,
        );
    }
  }
}

// A bare `<code>foo</code>` in the lenses names a component without giving it
// a popover — every mentioned variable/function/class/interface/constant must
// be a `.ref` span instead.
const CODE_RE = /<code[^>]*>([^<]*)<\/code>/g;
const BARE_IDENT = /^[a-zA-Z_$][\w$.]*$|^[\w$.]+\([^()]*\)$/;
const CODE_LITERALS = new Set([
  "null", "true", "false", "undefined", "this", "self", "void",
]);

function checkBareCode(fragments: [string, unknown][], warnings: string[]) {
  for (const [field, frag] of fragments) {
    const s = String(frag || "");
    // <code> inside a .ref label is already referenced — skip those ranges.
    const refRanges = [...s.matchAll(REF_RE)].map((m) => [
      m.index,
      m.index + m[0].length,
    ]);
    for (const m of s.matchAll(CODE_RE)) {
      if (refRanges.some(([a, b]) => m.index >= a && m.index < b)) continue;
      const t = m[1].trim();
      if (BARE_IDENT.test(t) && !CODE_LITERALS.has(t))
        warnings.push(
          `${field}: \`${t}\` is plain <code> — every named component must be a .ref span so it gets the popover`,
        );
    }
  }
}

function validateGraph(graph: GraphModel | undefined): string[] {
  const warnings = [];
  if (!graph || typeof graph !== "object") return ["graph is missing"];
  const ids = new Set();
  for (const n of graph.nodes || []) {
    if (!n.id) warnings.push("node without id");
    else if (ids.has(n.id)) warnings.push(`duplicate node id "${n.id}"`);
    else ids.add(n.id);
  }
  for (const e of graph.edges || []) {
    if (e.id) {
      if (ids.has(e.id)) warnings.push(`duplicate element id "${e.id}"`);
      else ids.add(e.id);
    }
    for (const end of ["source", "target"] as const) {
      const id = e[end];
      if (id && !(graph.nodes || []).some((n) => n.id === id))
        warnings.push(`edge "${e.id ?? "?"}" ${end} "${id}" is not a node`);
    }
    if (!e.path)
      warnings.push(`edge "${e.id ?? "?"}": missing path — every popover needs a file; use the call site (source's file/line)`);
  }
  for (const n of graph.nodes || []) {
    if (!n.path)
      warnings.push(`node "${n.id}": missing path — every popover needs a file (packages may point at package.json)`);
  }
  for (const f of graph.flows || []) {
    if (!f.steps?.length)
      warnings.push(`flow "${f.id ?? "?"}": no steps — the viewer skips empty flows`);
    for (const s of f.steps || []) {
      if (s.target && !ids.has(s.target))
        warnings.push(`flow "${f.id ?? "?"}" step target "${s.target}" not found`);
    }
  }
  return warnings;
}

const TR_SCOPES = new Set(["full", "package", "related"]);
const TR_KINDS = new Set(["added", "modified"]);
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

function testFiles(tr: TestResults | undefined): TestFile[] {
  return Array.isArray(tr?.files) ? tr.files : [];
}

function checkTestRun(run: TestRun, where: string, warnings: string[]) {
  const failed = Array.isArray(run.failed) ? run.failed : [];
  if (!isCount(run.passed) || !isCount(run.total)) {
    warnings.push(`${where}: needs integer passed and total counts`);
    return;
  }
  if (run.skipped != null && !isCount(run.skipped))
    warnings.push(`${where}: skipped "${run.skipped}" is not a count`);
  if (run.passed > run.total)
    warnings.push(`${where}: passed (${run.passed}) is more than total (${run.total})`);
  if (failed.length && run.passed + (run.skipped ?? 0) >= run.total)
    warnings.push(`${where}: lists ${failed.length} failed test(s) but the counts say every test passed`);
  for (const f of failed)
    if (!String(f?.name ?? "").trim() || !String(f?.message ?? "").trim())
      warnings.push(`${where}: every failed test needs a name and its failure message`);
}

function checkTestResults(tr: TestResults | undefined, warnings: string[]) {
  if (tr == null) return;
  if (typeof tr !== "object" || Array.isArray(tr)) {
    warnings.push("testResults: expected an object");
    return;
  }
  if (tr.notRun != null) {
    if (!String(tr.notRun).trim()) warnings.push("testResults: notRun needs a reason");
  } else {
    if (!String(tr.command ?? "").trim())
      warnings.push("testResults: missing command — show the exact command that ran");
    if (!TR_SCOPES.has(String(tr.scope)))
      warnings.push(`testResults: scope must be full, package, or related (got "${tr.scope ?? ""}")`);
    if (!String(tr.scopeNote ?? "").trim())
      warnings.push("testResults: missing scopeNote — say in plain words what the run covered");
    checkTestRun(tr, "testResults", warnings);
    (Array.isArray(tr.earlier) ? tr.earlier : []).forEach((run, i) =>
      checkTestRun(run, `testResults.earlier[${i}]`, warnings));
  }
  for (const [i, file] of testFiles(tr).entries()) {
    const at = `testResults.files[${i}] "${file?.path ?? "?"}"`;
    if (!String(file?.path ?? "").trim()) warnings.push(`${at}: missing path`);
    if (file?.line != null && !(Number.isInteger(file.line) && file.line >= 1))
      warnings.push(`${at}: line "${file.line}" is not a line number`);
    if (!Array.isArray(file?.tests) || !file.tests.length)
      warnings.push(`${at}: lists no tests`);
    for (const test of file?.tests ?? []) {
      const name = String(test?.name ?? "").trim();
      if (!name) warnings.push(`${at}: a test has no name`);
      if (!TR_KINDS.has(String(test?.kind)))
        warnings.push(`${at}: test "${name}" needs kind added or modified`);
      if (!String(test?.behavior ?? "").trim())
        warnings.push(`${at}: test "${name}" has no behavior — say what it checks in a sentence, not a restatement of the name`);
      if (test?.line != null && !(Number.isInteger(test.line) && test.line >= 1))
        warnings.push(`${at}: test "${name}" line "${test.line}" is not a line number`);
    }
  }
}

function renderTestResults(tr: TestResults | undefined, t: TestCopy): string {
  if (tr == null || typeof tr !== "object" || Array.isArray(tr)) return "";
  const chip = (tone: string, text: string) => `<span class="tr-chip tr-${tone}">${escHtml(text)}</span>`;
  const ref = (path: string, line: number | undefined, desc: string, label: string) =>
    `<span class="ref" tabindex="0" data-path="${escAttr(path)}"${line != null ? ` data-line="${line}"` : ""} data-desc="${escAttr(desc)}">${escHtml(label)}</span>`;
  const failList = (failed: TestFailure[] | undefined) => {
    const items = (Array.isArray(failed) ? failed : []).map((f) =>
      `<li><span class="tr-name">${escHtml(f?.name ?? "")}</span> <span class="tr-msg">${escHtml(f?.message ?? "")}</span></li>`);
    return items.length ? `<ul class="tr-list">${items.join("")}</ul>` : "";
  };
  const counts = (run: TestRun) => {
    const passed = Number(run.passed), total = Number(run.total);
    const failed = Array.isArray(run.failed) ? run.failed.length : 0;
    const skipped = Number(run.skipped ?? 0);
    const bad = failed > 0 || passed + skipped < total;
    return chip(bad ? "fail" : "pass", `${passed}/${total} ${t.passed}`) +
      (skipped > 0 ? chip("warn", `${skipped} ${t.skipped}`) : "");
  };

  const parts: string[] = [];
  if (tr.notRun != null) {
    parts.push(`<p>${chip("info", t.notRun)} ${escHtml(tr.notRun)}</p>`);
  } else {
    const scope = String(tr.scope);
    parts.push(`<p>${counts(tr)}</p>`);
    parts.push(
      `<p><span class="tr-sub">${t.scope}:</span> ${chip(scope === "full" ? "pass" : "info", t.scopes[scope] ?? scope)} ${escHtml(tr.scopeNote ?? "")}</p>`,
    );
    const env = tr.environment ? ` <span class="opacity-70">(${escHtml(tr.environment)})</span>` : "";
    parts.push(`<p><span class="tr-sub">${t.command}:</span> <code class="tr-cmd">${escHtml(tr.command ?? "")}</code>${env}</p>`);
    const failures = failList(tr.failed);
    parts.push(failures ? `<p class="tr-sub">${t.failedHead}</p>${failures}` : `<p>${t.failedNone}</p>`);
    for (const run of Array.isArray(tr.earlier) ? tr.earlier : []) {
      parts.push(
        `<p><span class="tr-sub">${t.earlier}:</span> ${counts(run)} ${escHtml(run.label ?? "")}</p>` +
        (run.cause ? `<p><span class="tr-sub">${t.cause}:</span> ${escHtml(run.cause)}</p>` : "") +
        failList(run.failed),
      );
    }
  }

  const files = testFiles(tr).filter((f) => f?.path && Array.isArray(f.tests) && f.tests.length);
  if (files.length) {
    parts.push(`<p class="tr-sub">${t.changesHead}</p>`);
    for (const file of files) {
      const path = String(file.path);
      parts.push(`<p class="tr-file">${ref(path, file.line, file.desc || t.specDesc, path)}</p>`);
      const items = (file.tests ?? []).map((test) => {
        const kind = TR_KINDS.has(String(test.kind)) ? String(test.kind) : "modified";
        const name = test.line != null
          ? ref(path, test.line, test.behavior ?? "", test.name ?? "")
          : escHtml(test.name ?? "");
        return `<li><span class="ftree-badge ft-${kind}">${t.kinds[kind]}</span> <span class="tr-name">${name}</span> ${escHtml(test.behavior ?? "")}</li>`;
      });
      parts.push(`<ul class="tr-list">${items.join("")}</ul>`);
    }
  }
  return `<section class="rounded-box bg-base-100 p-6 shadow-sm space-y-2"><h2 class="text-xl font-semibold mb-3">${t.title}</h2>${parts.join("")}</section>`;
}

async function render(manifestPath: string) {
  const mp = resolve(manifestPath);
  const manifest = JSON.parse(await readFile(mp, "utf8")) as Manifest;
  const name = (manifest.name || basename(mp).replace(/\.[^.]+$/, ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const lang = manifest.lang === "en" ? "en" : "vi";
  const t = L10N[lang];

  for (const field of ["title", "oneLiner", "graph"] as const) {
    if (manifest[field] == null) {
      console.error(`manifest: missing required field "${field}"`);
      process.exit(2);
    }
  }
  const graphModel = manifest.graph;
  if (!graphModel) process.exit(2);

  const warnings: string[] = [...validateGraph(manifest.graph)];
  const concepts = normalizeConcepts(manifest.concepts, warnings);

  // Collect every file a reference points at: .ref spans in fragments, graph
  // node paths, plus anything listed explicitly in `files`.
  const paths = new Set(manifest.files || []);
  const fragments = [
    manifest.oneLiner, manifest.plainTerms,
    manifest.lenses?.creational, manifest.lenses?.structural,
    manifest.lenses?.behavioral,
  ].filter(Boolean);
  for (const frag of fragments) {
    for (const m of String(frag).matchAll(/data-path=["']([^"']+)["']/g))
      paths.add(m[1]);
  }
  for (const n of graphModel.nodes || []) if (n.path) paths.add(n.path);
  for (const e of graphModel.edges || []) if (e.path) paths.add(e.path);
  for (const f of testFiles(manifest.testResults))
    if (f?.path) paths.add(String(f.path));

  const store: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of [...paths].sort()) {
    try {
      store[p] = await readFile(resolve(p), "utf8");
    } catch {
      missing.push(p);
    }
  }
  for (const f of testFiles(manifest.testResults))
    if (f?.path && missing.includes(String(f.path)))
      warnings.push(`testResults: spec "${f.path}" cannot be read from the current directory — run render from the repo root`);
  checkTestResults(manifest.testResults, warnings);

  const graph = { lang, ...graphModel };
  // Normalize indentation: tabs → 2 spaces, strip the common leading indent.
  const dedent = (code: string) => {
    const lines = String(code).replace(/\t/g, "  ").split("\n");
    const indents = lines
      .filter((l) => l.trim())
      .map((l) => l.match(/^ */)?.[0].length ?? 0);
    const min = indents.length ? Math.min(...indents) : 0;
    return lines.map((l) => l.slice(min)).join("\n").trim();
  };
  const pseudocode = (manifest.pseudocode || [])
    .map(
      (f) =>
        `<figure class="space-y-1"><figcaption class="font-medium">${escHtml(f.title ?? "")}</figcaption>` +
        `<pre class="mockup-code pcode bg-base-300 text-base-content p-4 rounded-box overflow-x-auto text-sm"><code class="language-nspseudo">${escHtml(dedent(f.code ?? ""))}</code></pre></figure>`,
    )
    .join("\n");
  const flowsSection = pseudocode
    ? `<section class="rounded-box bg-base-100 p-6 shadow-sm space-y-4"><h2 class="text-xl font-semibold mb-3">${t.flows}</h2>${pseudocode}</section>`
    : "";

  const theme = manifest.theme;
  const fixedTheme = theme && theme !== "system";
  const map: Record<string, string> = {
    LANG: lang,
    TITLE: manifest.title ?? "",
    ONELINER: wrapConcepts(manifest.oneLiner ?? "", concepts),
    THEME_ATTR: fixedTheme ? ` data-theme="${escHtml(theme)}"` : "",
    THEME_SCRIPT: fixedTheme ? "" : SYSTEM_THEME_SCRIPT,
    EXTRA_HEAD: manifest.extraHead || "",
    L_FEATURES: t.features,
    FEATURE_TREE: renderTree(manifest.featureTree, t, concepts, warnings),
    L_PLAIN: t.plain,
    PLAIN: wrapConcepts(manifest.plainTerms || "", concepts),
    CREATIONAL: wrapConcepts(manifest.lenses?.creational || "", concepts),
    STRUCTURAL: wrapConcepts(manifest.lenses?.structural || "", concepts),
    BEHAVIORAL: wrapConcepts(manifest.lenses?.behavioral || "", concepts),
    L_DIAGRAM: t.diagram,
    GRAPH: escJson(graph),
    FLOWS_SECTION: flowsSection,
    TESTS_SECTION: renderTestResults(manifest.testResults, t.tests),
    FILE_STORE: escJson(store),
    CONCEPTS: escJson(concepts),
    UI: escJson({ viewFile: t.viewFile, plain: t.plain, name, title: manifest.title ?? "", comments: t.comments }),
  };

  const bundle = await clientBundle();
  // Split the raw template at the bundle marker first. An embedded file (the renderer's own source, say) can
  // carry the same marker text, so a later search for it could hit the file store instead of this spot.
  // The bundle is joined in last, so a minified `@@` or `$&` inside it is never read as a token or pattern.
  const raw = await readFile(join(DIR, "template.html"), "utf8");
  const at = raw.indexOf("@@NSX_BUNDLE@@");
  if (at < 0) throw new Error("template.html has no @@NSX_BUNDLE@@ marker");
  const fill = (part: string) =>
    part.replace(/@@NSX_([A-Z_]+)@@/g, (_token: string, k: string) => map[k] ?? "");
  const tpl =
    fill(raw.slice(0, at)) + `<script>\n${bundle}\n</script>` + fill(raw.slice(at + "@@NSX_BUNDLE@@".length));

  const outDir = resolve(".ns-explain");
  await mkdir(outDir, { recursive: true });
  const out = join(outDir, `${name}.html`);
  await writeFile(out, tpl);

  checkFeaturesOnly("featureTree", treeTexts(manifest.featureTree), warnings);
  checkFeaturesOnly("plainTerms", [stripTags(manifest.plainTerms || "")], warnings);
  if (/class="ref"/.test(manifest.plainTerms || ""))
    warnings.push(
      `plainTerms: .ref spans are technical naming — plain terms stay features-only; move refs to the lenses`,
    );
  if (fragments.some((frag) => /class\s*=\s*["'][^"']*\bterm\b/.test(String(frag))))
    warnings.push(
      `hand-written .term span — list the word in concepts and let render wrap it`,
    );
  const labels: string[] = [];
  for (const frag of fragments) {
    for (const m of String(frag).matchAll(REF_RE))
      labels.push(m[2].replace(/<[^>]+>/g, "").trim());
  }
  for (const n of graphModel.nodes || []) if (n.label) labels.push(n.label);
  for (const e of graphModel.edges || [])
    labels.push(e.decides ? `${e.label ?? ""} — ${e.decides}` : (e.label ?? ""));
  const wrappedProse = [
    map.ONELINER, map.FEATURE_TREE, map.PLAIN,
    map.CREATIONAL, map.STRUCTURAL, map.BEHAVIORAL,
  ];
  for (const concept of concepts) {
    const term = concept.term?.trim() ?? "";
    if (!term || conceptIsPresent(term, wrappedProse, labels)) continue;
    warnings.push(
      `concept "${term}": not in the prose — use the word in the one-liner, feature tree, plain terms, or a lens so the popover has a place`,
    );
  }
  checkRefs(fragments, warnings);
  checkBareCode(
    [
      ["oneLiner", manifest.oneLiner],
      ["lenses.creational", manifest.lenses?.creational],
      ["lenses.structural", manifest.lenses?.structural],
      ["lenses.behavioral", manifest.lenses?.behavioral],
    ],
    warnings,
  );

  for (const w of warnings) console.error(`warning: ${w}`);
  for (const p of missing)
    console.error(`missing file (referenced but unreadable): ${p}`);
  console.log(
    JSON.stringify({
      html: out,
      filesEmbedded: Object.keys(store).length,
      serve: `node ${SELF} serve ${out}`,
    }),
  );
}

// Build src/main.ts (diagram viewer + page runtime) to one IIFE and make it
// safe to drop inside <script>.
async function clientBundle(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "nsx-"));
  const outfile = join(dir, "viewer.js");
  const built = spawnSync("bun", [
    "build",
    join(DIR, "src/main.ts"),
    "--format=iife",
    "--target=browser",
    `--outfile=${outfile}`,
  ], { encoding: "utf8" });
  if (built.status !== 0) {
    const detail = (built.stderr || built.stdout || "bun build failed").trim();
    throw new Error(`could not build the viewer (bun is required): ${detail}`);
  }
  try {
    const js = await readFile(outfile, "utf8");
    return js.replace(/<\/(script)/gi, "<\\/$1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function serve(file: string): Promise<void> {
  const child = spawn(process.execPath, [join(DIR, "serve.ts"), file, ...rest.slice(1)], {
    stdio: "inherit",
  });
  for (const sig of ["SIGINT", "SIGTERM"])
    process.on(sig, () => child.kill(sig));
  child.on("exit", (code) => process.exit(code ?? 0));
  return new Promise(() => {});
}

try {
  if (cmd === "render") {
    if (!rest[0]) throw new Error("usage: render <manifest.json>");
    await render(rest[0]);
  } else if (cmd === "serve") {
    if (!rest[0]) throw new Error("usage: serve <file.html>");
    await serve(rest[0]);
  } else if (cmd === "playbook") {
    process.stdout.write(
      await readFile(join(DIR, "..", "artifact-playbook.md"), "utf8"),
    );
  } else {
    console.log(HELP);
    if (cmd && cmd !== "help" && cmd !== "--help" && cmd !== "-h")
      process.exitCode = 2;
  }
} catch (e) {
  console.error(`ns-explain: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
}
