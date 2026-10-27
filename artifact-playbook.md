# ns-explain artifact playbook

Fetched on demand by `ns-explain.ts playbook` — read it fully before writing a
manifest. The exported HTML document comes from a **fixed template**
(`scripts/template.html`): the renderer injects a JSON manifest you write; you
never author the HTML shell, its CSS, or its wiring. The diagram viewer and the
page runtime are TypeScript. `render` builds them and packs the bundle into the
HTML, so the export is one file. This is what keeps every export structurally
identical — only the content varies.

## Workflow

1. Write `.ns-explain/<short-kebab-name>.json` under the current working
   directory (schema below), reusing the chat content — one-liner, feature
   tree, plain terms, the three lenses, the pseudocode flows, the graph model.
   Do not re-derive it from the diff.
2. `node <this skill's dir>/scripts/ns-explain.ts render .ns-explain/<name>.json`
   — builds the TypeScript viewer, writes one `.ns-explain/<name>.html` with
   that bundle inlined, and embeds every referenced file's body into the file
   store. Read its stderr and re-render until it is clean: `warning:` lines
   cover broken graph references (duplicate ids, dangling edge/flow targets),
   `.ref` contract violations (missing `data-desc`, non-numeric `data-line`, a
   label that looks like a path), a bare `<code>identifier</code>` that should
   be a `.ref`, and identifier leaks into features-only fields (`featureTree`,
   `plainTerms`); `missing file` lines mean a referenced file could not be read.
   Render needs `bun` on PATH to build the viewer.
3. `node <this skill's dir>/scripts/ns-explain.ts serve .ns-explain/<name>.html`
   as a background process — serves the directory and opens the browser. Give
   the user the URL it prints. Stop it when the session ends. No polling.
4. When the user pastes review comments back (see "Review comments"), apply
   each to the manifest and run step 2 again.

## Review comments

Every export includes a comment layer; it needs no manifest field. The reader
hovers a block (or selects text) and clicks the comment icon, writes a note, and
copies all notes with the bottom-right button. Comments can also be made inside a
feature's diff popover, a reference popover, and the "View file" dialog. The
pasted block looks like:

```
# Review comments on "<title>"
Report: .ns-explain/<name>.html (manifest: .ns-explain/<name>.json)
2 comments. Apply each one to the manifest, then render again.

## 1. <section> › <position>
Block: "<excerpt of the block>"
Selected: "<quoted text, when the comment was made on a selection>"
Files: <path:line, ...>
Comment: <the reader's note>
```

Find the manifest field from the section: `Tóm tắt`/`Summary` is `oneLiner`,
the feature section is `featureTree`, plain terms is `plainTerms`, the three
lens sections are `lenses.*`, `Sơ đồ`/`Diagram` is `graph`, and flows are
`pseudocode`. Match the paragraph by its `Block` excerpt, since `Paragraph N`
counts only the commentable paragraphs in that section.

Comments made inside a box are marked by their position text:

- `<feature path> › <file>:<line>` is one hunk of that feature's popover. Change
  that `hunks[].diff` or `hunks[].explain` in `featureTree`.
- `Giải thích chi tiết: <name>` / `Detail popover: <name>` is the popover of a
  component. Change the `data-desc` of that `.ref` span, or the `desc` of that
  graph node or edge.
- `Xem file › <path>:<line>` / `File view › <path>:<line>` is a line of the
  embedded source. The file is not part of the manifest: the comment is about
  the code itself, or about which line a `.ref` should point at (`data-line`).

Do not edit the rendered HTML; change the manifest and render again.

## Manifest schema

```json
{
  "name": "order-page-size",
  "lang": "vi",
  "title": "Phân trang đơn hàng tăng lên 50",
  "oneLiner": "Change này tăng giới hạn mỗi trang từ 10 lên 50.",
  "featureTree": [
    {
      "label": "trang đơn hàng",
      "children": [
        {
          "label": "phân trang",
          "children": [
            {
              "label": "số dòng mỗi trang",
              "changes": [{
                "kind": "modified",
                "old": "giới hạn 10",
                "new": "giới hạn 50 mỗi trang",
                "hunks": [{
                  "path": "internal/orders/filter.go",
                  "line": 42,
                  "diff": "- const pageSize = 10\n+ const pageSize = 50",
                  "explain": "Mỗi trang liệt kê 50 đơn thay vì 10."
                }]
              }]
            }
          ]
        },
        {
          "label": "bộ lọc",
          "children": [
            {
              "label": "lọc theo ngày",
              "changes": [{
                "kind": "added",
                "text": "lọc đơn hàng theo ngày",
                "hunks": [{
                  "path": "internal/orders/filter.go",
                  "line": 58,
                  "diff": "+ if (from != null) keep(order)",
                  "explain": "Chỉ giữ đơn từ ngày đã chọn."
                }]
              }]
            }
          ]
        },
        {
          "label": "xuất file",
          "children": [
            {
              "label": "nút xuất CSV",
              "changes": [{
                "kind": "removed",
                "text": "nút xuất CSV cũ",
                "hunks": [{
                  "path": "internal/orders/export.go",
                  "line": 12,
                  "diff": "- button Export CSV",
                  "explain": "Bỏ nút xuất file cũ."
                }]
              }]
            }
          ]
        }
      ]
    }
  ],
  "plainTerms": "<p>Ai đó mở trang đơn hàng…</p><p>Họ thấy…</p>",
  "lenses": {
    "creational": "<p><span class=\"ref\" …>OrderFilter</span> được tạo…</p>",
    "structural": "<p>…</p>",
    "behavioral": "<p>…</p>"
  },
  "pseudocode": [
    { "title": "Lọc thành công", "code": "khi request đến:\n  nếu pageSize <= 50…" }
  ],
  "concepts": [
    { "term": "timeout", "explain": "Một cái đồng hồ đếm ngược. Hết giờ mà chưa xong thì dừng." }
  ],
  "testResults": {
    "command": "go test ./internal/orders/...",
    "environment": "go 1.22, linux",
    "scope": "package",
    "scopeNote": "Chạy toàn bộ test của package orders, không phải toàn repo.",
    "passed": 31, "total": 31, "skipped": 0, "failed": [],
    "earlier": [{
      "label": "Lần chạy đầu, trước khi sửa spec.",
      "passed": 29, "total": 31,
      "cause": "Test cũ còn giả định mỗi trang 10 dòng.",
      "failed": [{ "name": "TestPageSize/default", "message": "expected 10, got 50" }]
    }],
    "files": [{
      "path": "internal/orders/filter_test.go", "line": 12,
      "desc": "Test của bộ lọc đơn hàng.",
      "tests": [
        { "kind": "modified", "name": "TestPageSize/default", "line": 20, "behavior": "Trang đầu trả về 50 đơn thay vì 10." },
        { "kind": "added", "name": "TestFilterByDate", "behavior": "Chỉ giữ các đơn từ ngày đã chọn trở đi." }
      ]
    }]
  },
  "graph": { "labels": {}, "nodes": [], "edges": [], "flows": [] },
  "theme": "system",
  "extraHead": "",
  "files": []
}
```

Fields:

- `name` — output file name; defaults to the manifest filename stem.
- `lang` — `"vi"` (default) or `"en"`; drives section labels, the diagram
  legend, and the feature-tree group labels (Thêm/Sửa/Xóa vs
  Added/Modified/Removed).
- `title`, `oneLiner`, `graph` — required.
- `featureTree` — a nested tree, not a list grouped by added/modified/removed.
  Split until each leaf is the smallest thing a person can point at. The chat
  line that shows the change becomes `changes` on that node, not an extra
  child. Each node is `{label, children, changes}`. `changes` entries are
  `{kind:"added", text, hunks}`, `{kind:"modified", old, new, hunks}`, or
  `{kind:"removed", text, hunks}`. Features only — what the user sees and does.
  **No identifiers of any kind**: a config flag becomes its user-visible
  effect (`theo cờ cấu hình dịch vụ preview: tắt thì chụp ngay trên máy`),
  never `previewService`; a file is "ảnh preview", never `preview-utils.ts`.
  Text is plain (the renderer escapes it) — `render` warns when an item looks
  like code (camelCase, snake_case, `file.ext`, `a/b/c`, `foo()`, `data-*`),
  when the tree is flat or still grouped by change type, or when a leaf has
  no `changes`.
  Each level indents by one guide, and a long description wraps under its
  own text. Each item shows its own description on the row: modified is the old
  behavior struck, then the new one; added is the new behavior; removed is
  struck. A node that has source hunks on itself or under it is a text
  button. Click opens a popover of those relative hunks only — the unified
  diff that implements this item and the smaller items under it. A hunk that
  comes from a smaller item is named by its place under this item. Each hunk
  shows a plain sentence of what that diff does, then its repo path and the
  diff. The sentence is `explain`: one or two sentences a reader understands,
  in the document language, about this hunk only — not a repeat of the row.
  The item's own description stays on the row and is not repeated in the
  popover. Hover does not open it. Escape or a click outside closes it. A
  diff line that starts with `+` is green; a line that starts with `-` is
  red. Modified description text stays red then green. Removed description
  text stays struck and red. Added description text stays green. The Sửa
  badge is a red-to-green bar, not yellow.
  `hunks` is `[{path, line, diff, explain}]`. `path` is repo-relative.
  `line` is the line in the file after the change, when the hunk still has
  one. `diff` is the unified-diff body (` `, `+`, `-` lines) for that
  behavior. `explain` is plain text. Put each hunk on the smallest feature
  it implements, so a parent popover is the union and does not repeat the
  same lines. `render` warns when a change has no hunks, and when a hunk
  has no `explain`. Path and diff are code; they are not feature prose, so
  they do not count as identifier leaks. `explain` is feature prose, so it
  does.
- `plainTerms`, `lenses.*` — **HTML fragments**. `plainTerms` stays
  features-only like the feature tree — no `.ref` spans, no identifiers;
  technical naming (components with `.ref` spans) belongs to the lenses and
  the graph. `render` warns on identifier leaks in both fields.
- `pseudocode` — one entry per flow block from the chat reply; `code` is plain
  text rendered into a `<pre>`, comments in the document language, real
  condition values and names verbatim.
- `concepts` — words the user asked about. See "Concepts the user asked about".
- `theme` — omit or `"system"` to follow `prefers-color-scheme`; set a daisyui
  theme name (`light`, `dark`, `luxury`, `nord`, …) only when the user asked
  for a fixed look or the project's design dictates one.
- `extraHead` — optional raw HTML appended to `<head>`: the project's font
  links, CSS variables, or design tokens when the subject project has its own
  design system (design-direction order: user request → subject project's own
  system → the template's Tailwind v4 + DaisyUI fallback, which needs nothing).
- `files` — extra repo-relative paths to embed in the file store. Paths already
  referenced by `.ref` spans or graph nodes are embedded automatically; list
  only what nothing references.
- `testResults` — optional; adds a **last** `<section>` titled "Kết quả test" /
  "Test results" after Flows. Include it only when the explained change added
  or edited tests; when absent, no section is rendered. Every number must come
  from a run that actually happened in this session.
  - Ran: `command` (verbatim), `environment` (optional), `scope` — `full` (whole
    repo/suite), `package` (the package or project holding the change), or
    `related` (only specific spec files) — plus `scopeNote`, a plain sentence
    on what the run covered. Then `passed`, `total`, optional `skipped`, and
    `failed: [{name, message}]` (empty list = none failed). The headline is the
    final run; an earlier failing run that a fix turned green goes in
    `earlier: [{label, passed, total, failed, cause}]` as history.
  - Not run: `{"notRun": "reason", "files": […]}` shows "Chưa chạy test" and the
    reason instead of numbers.
  - Changes: `files: [{path, line?, desc?, tests}]`, grouped by spec file
    (repo-relative `path`, rendered as a `.ref` that opens the file view at
    `line`). Each test is `{kind: "added"|"modified", name, line?, behavior}`:
    `name` is verbatim, `behavior` is one plain sentence of what the test checks
    (not a restatement of the name). A test with its own `line` is also a `.ref`.
    Spec files are embedded automatically.
  - Built from `h2`, `p`, `ul`/`li` only, so each part is commentable. `render`
    warns when `passed > total`, when failures are listed but counts say all
    passed, when a test has no `behavior`, and when a spec path is unreadable.

## Naming components in prose — the `.ref` contract

In fragment fields (`oneLiner`, `lenses.*`), **every named component — variable,
function, class, interface, constant, field, parameter — is a `.ref` span**,
never a bare `<code>` (the renderer warns on `<code>identifier</code>`). The
path stays out of the sentence:

```html
<span class="ref" tabindex="0"
      data-path="internal/orders/filter.go"
      data-line="42"
      data-desc="Quyết định đơn hàng nào khớp bộ lọc; dùng ở mọi nơi liệt kê đơn.">OrderFilter</span>
```

- `data-path` — path relative to the repo root (the cwd `render` runs in).
  **Required on every `.ref`** — every popover shows path + description + View
  file. Platform APIs and built-ins (`AbortController`, `setTimeout`, pdf.js
  objects) point at the closest repo call site, and `data-desc` says they are
  platform APIs.
- `data-line` — the line where the symbol is defined; set it whenever the span
  names a symbol.
- `data-desc` — the component's general job, not just its role in this change.
- The span's visible text is the component's display name **only** — never
  `file.ts:71` or `pkg/foo`. Two same-named components keep the same label
  (`withTimeout` … `withTimeout`); the popover's path disambiguates them, and
  you may name the area in plain prose outside the span ("phía portal", "phía
  renderer pdf"). A `.ref` that names a *file* itself (a spec file) keeps its
  filename as the label — that is the file's name, not a location leak.
  `render` warns when a label looks like a path.
- Click shows the popover (path + desc + "View file"). Hover does not. "View
  file" opens the file dialog syntax-highlighted, scrolled to `data-line`.
- The renderer reads every file a `data-path` or graph `path` points at and
  embeds it — write the span, never the file body.

## Concepts the user asked about — `concepts`

Only when the user asked what a word or idea means. Each `explain` is the
Concepts reply text, not a second definition. Do not hand-write popover
spans; `render` wraps the words. `render` warns on a hand-written `.term`.

```json
"concepts": [
  { "term": "timeout", "explain": "Một cái đồng hồ đếm ngược. Hết giờ mà chưa xong thì dừng." }
]
```

- `term` — the word as it should be found in the prose. Matching is
  case-insensitive and whole-word, so `timeout` also wraps `Timeout` and does
  not wrap `setTimeout`. A longer term wins over a shorter one inside it
  (`page size` before `page`).
- `explain` — plain text, one short paragraph. No file names.
- `render` wraps each match in the one-liner, the feature tree, the plain
  terms, and the three lenses. It does not wrap inside a `.ref`, a `.term`,
  `<code>`, or `<pre>`, so pseudocode stays plain.
- Click opens the popover with that explanation. Hover does not. Closing
  matches `.ref`: click the word again, click outside, or press Escape.
- A `.ref` or a diagram node or edge whose label is exactly that word keeps
  its own popover and adds this explanation under it.
- `render` warns when an entry lacks `term` or `explain`, is listed twice, or
  never appears. A code name that is already a `.ref` or diagram label counts
  as appearing — do not push it into the feature tree or the plain terms just
  to host the popover.

## `graph` — the interactive diagram DSL

Exactly one graph models the whole change; the viewer's built-in lens switcher
moves between structural, creational, and behavioral views of the *same*
elements. Never several diagrams, never Mermaid/SVG/images.

```json
{
  "labels": { "structural": "Structural", "creational": "Creational", "behavioral": "Behavioral" },
  "nodes": [
    { "id": "orderFilter", "label": "OrderFilter", "kind": "class",
      "parent": "pkgOrders", "lens": ["structural", "creational"],
      "change": "modified", "desc": "Quyết định đơn nào khớp bộ lọc.",
      "path": "internal/orders/filter.go", "line": 42 },
    { "id": "pkgOrders", "label": "internal/orders", "kind": "package" }
  ],
  "edges": [
    { "id": "e1", "source": "handler", "target": "orderFilter",
      "label": "gọi", "decides": "nhận hay bỏ đơn",
      "lens": ["structural", "behavioral"], "change": "added" }
  ],
  "flows": [
    { "id": "happy", "title": "Lọc thành công",
      "steps": [
        { "target": "e1", "note": "HTTP nhận request" },
        { "target": "orderFilter", "note": "pageSize <= 50 thì nhận" }
      ] }
  ]
}
```

- Every node is a real component, `label` is its verbatim name; `parent` groups
  nodes into package/module compounds. Compounds stay open and do not open the
  popover. `path` + `line` on a child node fill the click popover and the View
  file dialog at the symbol's definition.
- `lens` lists which lenses show the element. Structural = who talks to whom
  (edge `label` names the hop, `decides` says what it decides); creational =
  what is constructed/discarded (`kind`, creation edges like `"tạo"`/`"hủy"`);
  behavioral = one `flows` entry per outcome, `steps` replayed as an animated
  highlight with a per-step caption.
- `change` drives color: `added` green, `modified` amber, `removed` red dimmed
  + dashed (always visible — before/after in one view), `same` neutral.
- `labels`, node `desc`, edge `label`/`decides`, and flow `note`s are in the
  document language; identifiers stay verbatim. The renderer sets the legend
  language from `lang`.
- The viewer shows **one merged graph** — there is no lens switcher and no
  separate per-lens diagrams; every element is always on the canvas. (The
  `lens` field is ignored now.) A drag with the left or the wheel (middle)
  mouse button pans the graph, including one that starts on a node, edge, or
  package container. The wheel scrolls the
  page. Cmd/Ctrl + scroll zooms the graph. A fullscreen button on the canvas
  opens a dialog that fills the browser tab with this same diagram. The flow
  controls and the step list are hidden until that dialog is open, where they
  sit in a panel on the right and the graph keeps the remaining width.
  Package containers still stay open.
- Click a child node or an edge → the `.ref` popover (name, path, desc,
  **structural relations** — its incoming/outgoing hops — and View file).
  A package/module container does not open the popover. Clicking one closes
  an open popover and clears the focused node or edge: the click highlight
  and the active flow step. Hover does not open it. Click the same element
  again, or click empty canvas, to close the popover.
  A drag pans; it does not move the node. In the fullscreen dialog, the flow
  panel replays `flows` step by step.
- Child nodes and edges carry `path` + `line` so the popover is complete:
  nodes point at the symbol's definition, edges point at the **call site** —
  the source node's file/line where the hop happens. `render` warns on any
  element without one.

## Content rules (same as the chat reply)

- Reuse the chat content; do not re-derive from the diff.
- One concept per section; feature tree and plain terms name no files, no
  identifiers — the technical naming lives in the lenses and the graph.
  A change's `hunks` carry the path, the diff, and a plain `explain` of
  what that diff does. Path and diff are the one place code sits on the
  feature tree. `explain` names no files and no identifiers.
- Every flow from the reply ships as a `pseudocode` entry; the behavioral
  outcomes live in `graph.flows`.
- Test results: when the change touches tests, the last section reports the run
  honestly — real command, real counts, and whether the run was the full suite,
  the package, or only related specs. Never invent or round numbers; with no
  run, use `notRun` and say why. Each added or modified test states the
  behavior it checks, not its name again.
