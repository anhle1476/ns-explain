---
name: ns-explain
description: Explain a commit, a branch, or uncommitted changes like the reader is five, through creational, structural, and behavioral lenses, with pseudocode flows in chat and an interactive Cytoscape diagram in the HTML export, replying in whatever language the user asked in (Vietnamese by default when ambiguous). Use when the user runs /ns-explain, or asks to explain or review a commit, a branch, a diff, or uncommitted changes, including eli5, explain like I'm 5, giải thích cho dễ hiểu, tiếng Việt, creational, structural, behavioral, vẽ diagram. When the user asks what a concept means (giải thích khái niệm, từ này là gì), explain it in plain language and, in the HTML export, attach a click popover to each of those words. Also use when the user additionally wants the explanation saved or shared as a file — xuất file, export html, lưu lại, tạo file để xem lại, send this as a doc. This skill does not open merge requests and is not tied to a forge; the optional HTML export is a standalone document, not a live browser review session.
---

# ns-explain

Explain a code change so a newcomer understands it. Reply simply enough for a
five-year-old, in the language the user asked in (default Vietnamese when ambiguous
or when they wrote in Vietnamese), and always include the three lenses and the
pseudocode flows.

Read the change. Do not push, commit, or open a review on a forge.

## What to read

The user names the target. If they do not, explain the uncommitted changes.

Use GitButler when `but` manages the repo. Otherwise use git.

- Uncommitted: `but diff`, or `git diff` and `git status`.
- One commit: `but show <commit>`, or `git show <commit>`.
- A branch: `but branch show <branch> -f` and `but diff <branch>`, or `git log <base>..<branch>` and `git diff <base>...<branch>`.

Read the changed files when the diff is truncated. Explain only what that diff shows. If nothing changed, say so and stop.

Learn the repo layout enough to know each component's package path (module or import path, e.g. `github.com/acme/internal/orders`, `packages/web`) and its path inside that package — use workspace manifests, package.json/go.mod names, and directory layout.

## Reply

Write every reply to the ASD-STE100 Simplified Technical English standard. When the reply language is not English (for example Vietnamese), apply the same STE writing rules to that language:

- One topic per sentence and one instruction per sentence.
- Short sentences: procedural sentences 20 words or fewer, descriptive sentences 25 words or fewer. Paragraphs of 6 sentences or fewer.
- Active voice. Use the simple tenses (present, past, future).
- Use approved, common words. Use one word for one meaning, and use the same word for the same thing every time. No synonyms for variety.
- Write instructions in the imperative ("Click Save."). Put a condition before the action ("If the token expires, open the sign-in page.").
- Use technical names and technical verbs only when they are necessary, and keep them consistent.
- No idioms, slang, jokes, or figurative language. No long noun clusters (more than 3 nouns); break them up.
- Use a vertical list for a sequence or for parallel items.

Short sentences in the reply language. Say what a person sees and does. Use the real names and numbers from the code. Do not turn the answer into a file list. Do not invent a Factory, Builder, or singleton the code does not have.

Do not abbreviate. Write every term in full — expand acronyms and shorthand in the explanation prose, even ones common in the codebase (`auth` → xác thực / authentication, `cfg` → configuration). Only code identifiers keep their exact spelling, since they are real names.

Respect ubiquitous language — both the domain's and the industry's. Words the codebase and its business use as shared vocabulary — entities, statuses, domain events, business terms — keep untranslated even when replying in another language, e.g. `Order`, `Settlement`, `PendingPayout` stay `Order`, `Settlement`, `PendingPayout`. The same holds for industry-common words — `ID`, `code`, `spinner`, `singleton`, `row`, `column`, `cache`, `token` — do not translate them either. Translate only the connective prose around them.

Whenever you name a component from the code — a type, function, class, interface, variable, endpoint, table — also name its package path, its path inside that package, and the line it is defined on when you know it, e.g. `OrderFilter` (`github.com/acme/internal/orders`, `filter.go:42`). This applies wherever a component is named in the three lenses and the diagram nodes — not in the feature tree or "Nói cho dễ hiểu", which stay features-only.

1. One sentence: what the change is.
2. **Feature tree.** A nested tree of the features this change touches. Split it until each leaf is the smallest thing a person can point at — a screen, then the part of that screen, then the control, then the behavior. Do not group the tree by Thêm / Sửa / Xóa. Talk about features only — what the user can see or do — no technical details, no file names, no identifiers. The change sits on the smallest node: strike what was removed, and for a modification write `~~old behavior~~ → new behavior`. An added leaf is the new behavior itself. Example:

   ```
   Tính năng bị ảnh hưởng
   └── trang đơn hàng
       ├── phân trang
       │   └── số dòng mỗi trang
       │       └── ~~giới hạn 10~~ → giới hạn 50 mỗi trang
       ├── bộ lọc
       │   └── lọc theo ngày
       └── xuất file
           └── ~~nút xuất CSV cũ~~
   ```

3. **In plain terms** (label this "Nói cho dễ hiểu" when replying in Vietnamese). Two or three short paragraphs. Who does something, what appears, what happens next. Features only — no technical details, no file names, no identifiers; the technical naming belongs to the lenses below.
4. **Creational.** What is constructed, who constructs it, how many, the job it is given at birth, and when it is discarded. If the change only reuses an existing object, say so and name it.
5. **Structural.** Who talks to whom after the change. Name each hop and what that hop decides.
6. **Behavioral.** One short story per outcome the code can produce. Use the thresholds from the code. Describe states when the code has timers, pending ids, or explicit states.
7. **Flows.** No diagrams in chat — no Mermaid, no ASCII diagrams, no images; the interactive diagram lives only in the exported HTML document. For each flow the change touches, write a short `pseudocode` block that walks it step by step — plain-language steps and comments in the reply language, real condition values and names from the code:
   - Structural: one pseudocode pass over the path, one line per hop and what that hop decides.
   - Behavioral: one pseudocode block per outcome the code can produce.
   - Creational: describe birth and destroy in prose; no pseudocode needed.
8. **Concepts** — only when the user asks what a word or idea means (giải thích khái niệm, từ này là gì, explain this term). Do not invent concepts they did not name. Label the block "Khái niệm" when replying in Vietnamese, "Concepts" in English. For each word, two or three short sentences a newcomer can picture: what it is, and what a person sees. Those sentences are the popover body.

If this conversation already explained the change and the user only asks for the flows, the diagram, or a concept, produce just that and do not repeat the essay.

## Optional: export as an HTML artifact

Only do this when the user also asks to save, export, or share the explanation as a file (xuất file, export html, lưu lại, tạo file, send this as a doc) — a bare "explain this commit" stays chat-only, as above.

The exported document comes from a fixed template rendered by the skill's own CLI — never hand-write the HTML document, its CSS, or its wiring; you author only a JSON manifest. This is what keeps every export structurally identical. Do not invoke any other skill for this — the export workflow lives here.

1. Run `node <this skill's dir>/scripts/ns-explain.ts playbook` and read it end to end — it prints the manifest schema, the `.ref` component-reference contract, the diagram's JSON DSL, and the render/serve commands. Follow it.
2. Write the manifest to `.ns-explain/<short-kebab-name>.json` under the current working directory, reusing the content you already produced (one-liner, feature tree, plain-terms paragraphs, the three lenses, the pseudocode flows, the graph model, and any concepts the user asked about) — do not re-derive it from the diff a second time. Put each requested concept in `concepts` as `{term, explain}` where `explain` is the reply text from the Concepts block. The playbook owns that field: render wraps the words, so do not hand-write popover spans. If an export of this explanation already exists, add the concepts to its manifest and render again. If that export has no manifest, explain in chat and leave the HTML alone.
3. Run `node <this skill's dir>/scripts/ns-explain.ts render .ns-explain/<name>.json` — it builds the TypeScript diagram viewer and page runtime, packs that bundle into `.ns-explain/<name>.html`, and embeds every referenced file's body. The export is one HTML file. Fix anything it warns about and re-render.
4. Serve it: run `node <this skill's dir>/scripts/ns-explain.ts serve .ns-explain/<name>.html` as a background process. It serves the file's directory over a local HTTP server and opens the browser. Give the user the URL it prints. Stop it when the session ends.
5. Stop there. Deliver a finished exported document — no review loop, no polling.
