// Review comments for the exported page. Hover a block, or select text, to get a
// comment icon; every comment stays in memory (a reload drops them) and one
// button copies them all, with where each one sits, so they can be pasted
// straight into the agent that owns the manifest.
import { COMMENTS_CSS } from "./comments-css.ts";

export interface CommentStrings {
  comment: string;
  placeholder: string;
  hint: string;
  save: string;
  cancel: string;
  edit: string;
  remove: string;
  copy: string;
  copied: string;
  copyFailed: string;
  copyEmpty: string;
  selected: string;
  locTitle: string;
  locSummary: string;
  locParagraph: string;
  locItem: string;
  locDiagram: string;
}

const DEFAULTS: CommentStrings = {
  comment: "Comment",
  placeholder: "Write a comment…",
  hint: "Ctrl+Enter to save",
  save: "Save",
  cancel: "Cancel",
  edit: "Edit",
  remove: "Delete",
  copy: "Copy comments",
  copied: "Copied",
  copyFailed: "Copy failed",
  copyEmpty: "No comments yet. Hover a block, or select text, to add one.",
  selected: "Selected text",
  locTitle: "Title",
  locSummary: "Summary",
  locParagraph: "Paragraph",
  locItem: "Item",
  locDiagram: "Diagram",
};

interface CommentUi {
  name?: string;
  title?: string;
  comments?: Partial<CommentStrings>;
}

interface ReviewComment {
  id: number;
  block: HTMLElement;
  /** Selected text the comment was made on; empty for a whole-block comment. */
  quote: string;
  text: string;
}

interface Draft {
  block: HTMLElement;
  quote: string;
}

// Blocks a comment can attach to. Content inside a popover or dialog is left out
// (those sit in the top layer, above this UI), and anything inside the diagram
// counts as the diagram itself.
const BLOCK_SELECTOR = [
  "main > header h1",
  "main > header p",
  "main > section > h2",
  "main > section p",
  "main > section li:not(.ft-item):not(.ft-hunk)",
  "main > section .ft-item > .ft-row",
  "main > section figure",
].join(",");

const ICON_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

const QUOTE_LIMIT = 500;
const EXCERPT_LIMIT = 200;
const HIDE_DELAY_MS = 180;

function readUi(): CommentUi {
  try {
    return JSON.parse(document.getElementById("nsx-ui")?.textContent ?? "{}") as CommentUi;
  } catch {
    return {};
  }
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

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function cut(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

function elementOf(node: Node | null): Element | null {
  if (!node) return null;
  return node instanceof Element ? node : node.parentElement;
}

/** The block a point in the page belongs to, or null when it cannot be commented. */
function resolveBlock(from: Node | null): HTMLElement | null {
  const start = elementOf(from);
  if (!start) return null;
  const diagram = start.closest<HTMLElement>(".lens-diagram");
  if (diagram) return diagram.closest("dialog") ? null : diagram;
  const block = start.closest<HTMLElement>(BLOCK_SELECTOR);
  if (!block || block.closest("[popover], dialog")) return null;
  return block;
}

/** The block's text without popover bodies, scripts or styles. */
function visibleText(block: HTMLElement): string {
  const copy = block.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[popover], script, style, button.ft-trigger + *").forEach((n) => n.remove());
  return squash(copy.textContent ?? "");
}

function featurePath(row: HTMLElement): string {
  const names: string[] = [];
  let item: Element | null = row.closest("li.ft-item");
  while (item) {
    const label = item.querySelector(":scope > .ft-row > .ft-trigger, :scope > .ft-row > .ft-label");
    if (label?.textContent) names.unshift(squash(label.textContent));
    item = item.parentElement?.closest("li.ft-item") ?? null;
  }
  return names.join(" › ");
}

export function mountComments(): void {
  const ui = readUi();
  const t: CommentStrings = { ...DEFAULTS, ...(ui.comments ?? {}) };
  const mainEl = document.querySelector("main");
  if (!mainEl) return;
  const main: HTMLElement = mainEl;

  if (!document.getElementById("nsx-comments-css")) {
    const style = document.createElement("style");
    style.id = "nsx-comments-css";
    style.textContent = COMMENTS_CSS;
    document.head.appendChild(style);
  }

  const comments: ReviewComment[] = [];
  let nextId = 1;
  let draft: Draft | null = null;
  let editingId: number | null = null;
  let hoverBlock: HTMLElement | null = null;
  let pendingSelection: Draft | null = null;
  let hideTimer = 0;
  const marked = new Set<HTMLElement>();

  // --- floating pieces -----------------------------------------------------

  const hoverBtn = el("button", "nsx-c-ui nsx-c-icon");
  hoverBtn.type = "button";
  hoverBtn.setAttribute("aria-label", t.comment);
  hoverBtn.title = t.comment;
  hoverBtn.innerHTML = ICON_SVG;
  const badge = el("span", "nsx-c-badge");
  hoverBtn.appendChild(badge);

  const selBtn = el("button", "nsx-c-ui nsx-c-icon nsx-c-sel");
  selBtn.type = "button";
  selBtn.setAttribute("aria-label", t.comment);
  selBtn.title = t.comment;
  selBtn.innerHTML = ICON_SVG;

  const composer = el("div", "nsx-c-ui nsx-c-composer");
  composer.setAttribute("role", "dialog");
  composer.setAttribute("aria-label", t.comment);

  const copyBtn = el("button", "nsx-c-copy");
  copyBtn.type = "button";

  document.body.append(hoverBtn, selBtn, composer, copyBtn);

  // --- helpers -------------------------------------------------------------

  const commentsOf = (block: HTMLElement) => comments.filter((c) => c.block === block);

  function describe(block: HTMLElement): { section: string; where: string } {
    const tagName = block.tagName;
    if (block.matches("main > header h1")) return { section: t.locTitle, where: "" };
    if (block.matches("main > header p")) return { section: t.locSummary, where: "" };
    const section = block.closest("section");
    const heading = squash(section?.querySelector(":scope > h2")?.textContent ?? "");
    if (block.matches("h2")) return { section: heading, where: "" };
    if (block.classList.contains("lens-diagram")) {
      return { section: heading, where: heading === t.locDiagram ? "" : t.locDiagram };
    }
    if (block.classList.contains("ft-row")) return { section: heading, where: featurePath(block) };
    if (block.matches("figure")) {
      return { section: heading, where: squash(block.querySelector("figcaption")?.textContent ?? "") };
    }
    const isItem = tagName === "LI";
    const label = isItem ? t.locItem : t.locParagraph;
    const peers = [...(section?.querySelectorAll(isItem ? "li" : "p") ?? [])].filter((n) => resolveBlock(n) === n);
    return { section: heading, where: `${label} ${peers.indexOf(block) + 1}` };
  }

  /** Labels of the diagram's components, so a diagram comment says what the diagram showed. */
  function diagramLabels(block: HTMLElement): string {
    let model: unknown;
    try {
      model = JSON.parse(block.querySelector(".graph-model")?.textContent ?? "{}");
    } catch {
      return "";
    }
    if (!model || typeof model !== "object" || !("nodes" in model) || !Array.isArray(model.nodes)) return "";
    const nodes: unknown[] = model.nodes;
    const labels: string[] = [];
    for (const n of nodes) {
      if (!n || typeof n !== "object" || !("label" in n) || typeof n.label !== "string") continue;
      if ("kind" in n && n.kind === "package") continue;
      labels.push(n.label);
    }
    return labels.join(", ");
  }

  function excerptOf(block: HTMLElement): string {
    if (block.classList.contains("lens-diagram")) return cut(`${t.locDiagram}: ${diagramLabels(block)}`, EXCERPT_LIMIT * 2);
    return cut(visibleText(block), EXCERPT_LIMIT);
  }

  function filesOf(block: HTMLElement): string[] {
    const seen = new Set<string>();
    block.querySelectorAll<HTMLElement>(".ref[data-path]").forEach((r) => {
      const path = r.dataset.path ?? "";
      if (path) seen.add(r.dataset.line ? `${path}:${r.dataset.line}` : path);
    });
    block.querySelectorAll(".ft-path").forEach((p) => {
      const path = squash(p.textContent ?? "");
      if (path) seen.add(path);
    });
    return [...seen];
  }

  function buildReport(): string {
    const ordered = [...comments].sort((a, b) =>
      a.block === b.block
        ? a.id - b.id
        : a.block.compareDocumentPosition(b.block) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    const lines = [`# Review comments on "${ui.title ?? document.title}"`];
    if (ui.name) {
      lines.push(`Report: .ns-explain/${ui.name}.html (manifest: .ns-explain/${ui.name}.json)`);
    }
    lines.push(
      `${ordered.length} comment${ordered.length === 1 ? "" : "s"}. ` +
      "Apply each one to the manifest, then render again.",
      "",
    );
    ordered.forEach((c, i) => {
      const where = describe(c.block);
      lines.push(`## ${i + 1}. ${[where.section, where.where].filter(Boolean).join(" › ")}`);
      lines.push(`Block: "${excerptOf(c.block)}"`);
      if (c.quote) lines.push(`Selected: "${c.quote}"`);
      const files = filesOf(c.block);
      if (files.length) lines.push(`Files: ${files.join(", ")}`);
      lines.push(`Comment: ${c.text.replace(/\n/g, "\n  ")}`, "");
    });
    return lines.join("\n").trimEnd() + "\n";
  }

  async function writeClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Not a secure context, or permission denied: fall back to a hidden textarea.
      const ta = el("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  function placeAt(node: HTMLElement, x: number, y: number): void {
    node.style.left = `${Math.round(x + scrollX)}px`;
    node.style.top = `${Math.round(y + scrollY)}px`;
  }

  function refresh(): void {
    const used = new Set(comments.map((c) => c.block));
    marked.forEach((b) => {
      if (used.has(b)) return;
      b.classList.remove("nsx-c-has");
      marked.delete(b);
    });
    used.forEach((b) => {
      b.classList.add("nsx-c-has");
      marked.add(b);
    });
    const n = comments.length;
    copyBtn.textContent = `${t.copy} (${n})`;
    copyBtn.disabled = n === 0;
    copyBtn.title = n === 0 ? t.copyEmpty : "";
    if (hoverBlock) badge.textContent = String(commentsOf(hoverBlock).length || "");
  }

  // --- hover icon ----------------------------------------------------------

  function hideHover(): void {
    window.clearTimeout(hideTimer);
    hoverBtn.style.display = "none";
    hoverBlock = null;
  }

  function showHover(block: HTMLElement): void {
    window.clearTimeout(hideTimer);
    if (draft) return;
    hoverBlock = block;
    const r = block.getBoundingClientRect();
    const size = 28;
    const roomRight = innerWidth - r.right >= size + 12;
    placeAt(hoverBtn, roomRight ? r.right + 8 : r.right - size - 4, r.top + 2);
    badge.textContent = String(commentsOf(block).length || "");
    hoverBtn.style.display = "flex";
  }

  function scheduleHide(): void {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hideHover, HIDE_DELAY_MS);
  }

  function onPoint(e: PointerEvent): void {
    if (draft) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".nsx-c-ui")) {
      window.clearTimeout(hideTimer);
      return;
    }
    const block = resolveBlock(target);
    if (block) showHover(block);
    else scheduleHide();
  }

  document.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "touch") onPoint(e);
  }, { passive: true });
  // Touch has no hover: a tap on a block brings the icon up instead.
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") onPoint(e);
  }, { passive: true });
  document.addEventListener("scroll", () => {
    if (!draft && hoverBlock) showHover(hoverBlock);
  }, { passive: true });

  // --- selection icon ------------------------------------------------------

  function hideSelection(): void {
    selBtn.style.display = "none";
    pendingSelection = null;
  }

  function checkSelection(): void {
    const sel = window.getSelection();
    if (draft || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
      if (!draft) hideSelection();
      return;
    }
    const range = sel.getRangeAt(0);
    const host = elementOf(range.commonAncestorContainer);
    if (!host || !main.contains(host) || host.closest(".nsx-c-ui, [popover], dialog")) {
      hideSelection();
      return;
    }
    const quote = cut(squash(sel.toString()), QUOTE_LIMIT);
    const block = resolveBlock(range.startContainer) ?? resolveBlock(range.endContainer);
    if (!quote || !block) {
      hideSelection();
      return;
    }
    const rects = range.getClientRects();
    const last = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    const above = last.top >= 40;
    placeAt(
      selBtn,
      Math.min(Math.max(last.right - 12, 8), innerWidth - 40),
      above ? last.top - 34 : last.bottom + 6,
    );
    pendingSelection = { block, quote };
    selBtn.style.display = "flex";
  }

  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (!draft && (!sel || sel.isCollapsed)) hideSelection();
  });
  document.addEventListener("pointerup", () => window.setTimeout(checkSelection, 0));
  document.addEventListener("keyup", (e) => {
    if (e.shiftKey || e.key.startsWith("Arrow")) window.setTimeout(checkSelection, 0);
  });

  // --- composer ------------------------------------------------------------

  function closeComposer(clearSelection = false): void {
    composer.style.display = "none";
    composer.replaceChildren();
    draft = null;
    editingId = null;
    if (clearSelection) window.getSelection()?.removeAllRanges();
    hideSelection();
  }

  function renderComposer(): void {
    if (!draft) return;
    const { block, quote } = draft;
    const where = describe(block);
    composer.replaceChildren();

    const head = el("div", "nsx-c-head");
    head.append(el("span", "nsx-c-where", [where.section, where.where].filter(Boolean).join(" › ")));
    const x = el("button", "nsx-c-x", "✕");
    x.type = "button";
    x.setAttribute("aria-label", t.cancel);
    x.addEventListener("click", () => closeComposer());
    head.appendChild(x);
    composer.appendChild(head);

    if (quote) {
      const q = el("blockquote", "nsx-c-quote");
      q.append(el("div", "nsx-c-kicker", t.selected), el("div", undefined, quote));
      composer.appendChild(q);
    }

    const existing = commentsOf(block);
    if (existing.length) {
      const list = el("ul", "nsx-c-list");
      existing.forEach((c) => {
        const li = el("li", c.id === editingId ? "nsx-c-item is-editing" : "nsx-c-item");
        if (c.quote) li.appendChild(el("div", "nsx-c-itemquote", c.quote));
        li.appendChild(el("div", "nsx-c-text", c.text));
        const actions = el("div", "nsx-c-itemactions");
        const edit = el("button", "nsx-c-link", t.edit);
        edit.type = "button";
        edit.addEventListener("click", () => {
          editingId = c.id;
          renderComposer();
        });
        const del = el("button", "nsx-c-link nsx-c-danger", t.remove);
        del.type = "button";
        del.addEventListener("click", () => {
          comments.splice(comments.indexOf(c), 1);
          if (editingId === c.id) editingId = null;
          refresh();
          renderComposer();
        });
        actions.append(edit, del);
        li.appendChild(actions);
        list.appendChild(li);
      });
      composer.appendChild(list);
    }

    const ta = el("textarea", "nsx-c-input");
    ta.rows = 3;
    ta.placeholder = t.placeholder;
    ta.value = comments.find((c) => c.id === editingId)?.text ?? "";
    composer.appendChild(ta);

    const foot = el("div", "nsx-c-foot");
    foot.appendChild(el("span", "nsx-c-hint", t.hint));
    const cancel = el("button", "nsx-c-btn", t.cancel);
    cancel.type = "button";
    cancel.addEventListener("click", () => closeComposer());
    const save = el("button", "nsx-c-btn nsx-c-primary", t.save);
    save.type = "button";
    foot.append(cancel, save);
    composer.appendChild(foot);

    const commit = (): void => {
      const text = ta.value.trim();
      if (!text || !draft) return;
      const current = comments.find((c) => c.id === editingId);
      if (current) current.text = text;
      else comments.push({ id: nextId++, block: draft.block, quote: draft.quote, text });
      const hadQuote = !!draft.quote;
      closeComposer(hadQuote);
      refresh();
    };
    save.addEventListener("click", commit);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeComposer();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commit();
      }
    });
    // Not yet placed on first open: a plain focus() would scroll the page to wherever the box happens to sit.
    ta.focus({ preventScroll: true });
  }

  function openComposer(next: Draft, anchor: DOMRect): void {
    hideHover();
    selBtn.style.display = "none";
    draft = next;
    editingId = null;
    composer.style.display = "block";
    renderComposer();
    const width = composer.offsetWidth;
    placeAt(composer, Math.min(Math.max(anchor.left, 8), innerWidth - width - 8), anchor.bottom + 6);
    composer.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  hoverBtn.addEventListener("click", () => {
    if (!hoverBlock) return;
    openComposer({ block: hoverBlock, quote: "" }, hoverBtn.getBoundingClientRect());
  });
  // Pressing the icon must not collapse the selection it is about to quote.
  selBtn.addEventListener("pointerdown", (e) => e.preventDefault());
  selBtn.addEventListener("click", () => {
    if (!pendingSelection) return;
    openComposer(pendingSelection, selBtn.getBoundingClientRect());
  });
  hoverBtn.addEventListener("pointerleave", scheduleHide);

  document.addEventListener("pointerdown", (e) => {
    if (!draft) return;
    const target = e.target;
    if (target instanceof Element && target.closest(".nsx-c-ui")) return;
    // A half-written comment survives a stray click; Save or Cancel ends it.
    const input = composer.querySelector<HTMLTextAreaElement>(".nsx-c-input");
    if (input && input.value.trim()) return;
    closeComposer();
  });

  // --- copy button ---------------------------------------------------------

  let copyTimer = 0;
  copyBtn.addEventListener("click", async () => {
    if (comments.length === 0) return;
    const ok = await writeClipboard(buildReport());
    copyBtn.classList.toggle("is-ok", ok);
    copyBtn.classList.toggle("is-fail", !ok);
    copyBtn.textContent = ok ? `${t.copied} (${comments.length})` : t.copyFailed;
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => {
      copyBtn.classList.remove("is-ok", "is-fail");
      refresh();
    }, 1600);
  });

  hideHover();
  hideSelection();
  composer.style.display = "none";
  refresh();
}
