// Tests for the render CLI. Each case runs the real `ns-explain.ts render` in a scratch directory, because
// render writes `.ns-explain/<name>.html` under the working directory and the CLI runs on import, so there
// is no function to call directly. Run with `bun test` (bun is already required to render).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "ns-explain.ts");

let work = "";
let n = 0;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "nsx-test-"));
});
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

interface Rendered {
  warnings: string[];
  missing: string[];
  html: string;
  exitCode: number;
}

/** Minimal manifest that renders without warnings; tests override or add fields. */
function manifest(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "T",
    oneLiner: "One line.",
    graph: { nodes: [], edges: [], flows: [] },
    ...extra,
  };
}

function render(m: Record<string, unknown>, files: Record<string, string> = {}): Rendered {
  const dir = join(work, `case-${++n}`);
  mkdirSync(join(dir, ".ns-explain"), { recursive: true });
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  writeFileSync(join(dir, ".ns-explain", "r.json"), JSON.stringify(m));
  const run = Bun.spawnSync(["bun", CLI, "render", ".ns-explain/r.json"], { cwd: dir, stderr: "pipe", stdout: "pipe" });
  const err = run.stderr.toString().split(/\r?\n/);
  return {
    warnings: err.filter((l) => l.startsWith("warning: ")).map((l) => l.slice("warning: ".length)),
    missing: err.filter((l) => l.startsWith("missing file")),
    html: run.exitCode === 0 ? readFileSync(join(dir, ".ns-explain", "r.html"), "utf8") : "",
    exitCode: run.exitCode ?? -1,
  };
}

/** Script elements as an HTML parser sees them (`HTMLRewriter` is Bun's streaming HTML parser), in document order. */
async function scriptsAsParsed(html: string): Promise<{ id: string; length: number }[]> {
  const seen: { id: string; length: number }[] = [];
  let current: { id: string; length: number } | null = null;
  await new HTMLRewriter()
    .on("script", {
      element(el) {
        current = { id: el.getAttribute("id") ?? (el.getAttribute("src") ? "src" : "inline"), length: 0 };
        seen.push(current);
      },
      text(chunk) {
        if (current) current.length += chunk.text.length;
      },
    })
    .transform(new Response(html))
    .text();
  return seen;
}

/** The `<script>` that holds the bundle is the last plain one, and must be the last thing before </body>. */
function bundleTag(html: string): string {
  const at = html.lastIndexOf("<script>");
  return at < 0 ? "" : html.slice(at);
}

/** What a browser reads back from a JSON block: the text between the tags, parsed. */
function jsonBlock(html: string, id: string): unknown {
  const m = html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)</script>`));
  if (!m) throw new Error(`no #${id} block`);
  return JSON.parse(m[1]);
}

const passingRun = {
  command: "bun test",
  scope: "package",
  scopeNote: "The whole package suite.",
  passed: 10,
  total: 10,
  failed: [],
};
const goodTest = { kind: "added", name: "does a thing", behavior: "Checks that the thing happens." };

describe("embedded files cannot break the page", () => {
  // A file that holds `<!--` then `<script` puts the HTML parser in the "double escaped" state, where the
  // `</script>` of the file-store block no longer ends it, so the bundle after it is swallowed. render still
  // reports no warning, which is why this needs a test.
  const trap = "const a = '<!--';\nconst b = '<script>';\nconst c = '</script>';\n";

  test("a file with <!-- and <script keeps every JSON block parseable and intact", () => {
    const r = render(
      manifest({ files: ["trap.txt"] }),
      { "trap.txt": trap },
    );
    expect(r.exitCode).toBe(0);
    const store = jsonBlock(r.html, "file-store") as Record<string, string>;
    expect(store["trap.txt"]).toBe(trap);
  });

  test("an HTML parser still sees the bundle as its own script after the file store", async () => {
    // This is the failure the page showed: the parser kept reading the file store until the end of the
    // document, so no separate bundle script existed and no mounted UI ran. A string check on the file
    // cannot see that; only a parser can.
    const r = render(manifest({ files: ["trap.txt"] }), { "trap.txt": trap });
    const scripts = await scriptsAsParsed(r.html);
    const store = scripts.find((s) => s.id === "file-store");
    const bundle = scripts[scripts.length - 1];
    expect(store).toBeDefined();
    expect(bundle.id).toBe("inline");
    expect(bundle.length).toBeGreaterThan(50_000);
  });

  test("the bundle is the last script and the page closes right after it", () => {
    const r = render(manifest({ files: ["trap.txt"] }), { "trap.txt": trap });
    const tail = bundleTag(r.html);
    expect(tail.endsWith("</script>\n</body>\n</html>\n")).toBe(true);
    expect(tail).toContain("mountComments");
  });

  test("no raw < is left inside any JSON block", () => {
    const r = render(manifest({ files: ["trap.txt"] }), { "trap.txt": trap });
    for (const m of r.html.matchAll(/<script [^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
      expect(m[1]).not.toContain("<");
    }
  });

  test("a file that holds the bundle marker does not receive the bundle", () => {
    const marker = "// @@NSX_BUNDLE@@\n";
    const r = render(manifest({ files: ["marker.txt"] }), { "marker.txt": marker });
    const store = jsonBlock(r.html, "file-store") as Record<string, string>;
    expect(store["marker.txt"]).toBe(marker);
    expect(bundleTag(r.html)).toContain("mountComments");
  });
});

describe("testResults section", () => {
  const section = (html: string) => html.match(/<h2[^>]*>Kết quả test<\/h2>|<h2[^>]*>Test results<\/h2>/);

  test("is absent when the manifest has no testResults", () => {
    const r = render(manifest());
    expect(section(r.html)).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  test("renders last, after the flows section, with the counts", () => {
    const r = render(manifest({
      lang: "en",
      pseudocode: [{ title: "A flow", code: "do it" }],
      testResults: { ...passingRun, files: [] },
    }));
    expect(r.warnings).toEqual([]);
    const flows = r.html.indexOf(">Flows<");
    const tests = r.html.indexOf(">Test results<");
    expect(flows).toBeGreaterThan(-1);
    expect(tests).toBeGreaterThan(flows);
    expect(r.html).toContain("10/10 passed");
    // the last section in <main>
    const mainEnd = r.html.indexOf("</main>");
    expect(r.html.lastIndexOf("<section", mainEnd)).toBeLessThan(tests);
    expect(r.html.slice(tests, mainEnd)).not.toContain("<section");
  });

  test("uses the fail tone when a test failed", () => {
    const r = render(manifest({
      testResults: { ...passingRun, passed: 9, total: 10, failed: [{ name: "x", message: "boom" }], files: [] },
    }));
    expect(r.html).toContain('class="tr-chip tr-fail"');
    expect(r.html).toContain("boom");
  });

  test("notRun shows the reason and no counts", () => {
    const r = render(manifest({ lang: "en", testResults: { notRun: "no runner in this repo", files: [] } }));
    expect(r.warnings).toEqual([]);
    expect(r.html).toContain("no runner in this repo");
    // `.tr-pass` also appears in the template's stylesheet, so look for the chip element itself.
    expect(r.html).not.toContain('class="tr-chip tr-pass"');
    expect(r.html).toContain('class="tr-chip tr-info"');
  });

  test("escapes HTML in test names and messages", () => {
    const r = render(manifest({
      testResults: { ...passingRun, passed: 0, total: 1, failed: [{ name: "<b>n</b>", message: "<i>m</i>" }], files: [] },
    }));
    expect(r.html).toContain("&lt;b&gt;n&lt;/b&gt;");
    expect(r.html).not.toContain("<b>n</b>");
  });

  test("a spec path becomes a ref and its file is embedded", () => {
    const body = "describe('x', () => {});\n";
    const r = render(
      manifest({ testResults: { ...passingRun, files: [{ path: "a/x.spec.ts", tests: [goodTest] }] } }),
      { "a/x.spec.ts": body },
    );
    expect(r.warnings).toEqual([]);
    expect(r.html).toContain('data-path="a/x.spec.ts"');
    expect((jsonBlock(r.html, "file-store") as Record<string, string>)["a/x.spec.ts"]).toBe(body);
  });
});

describe("testResults warnings", () => {
  const warn = (tr: Record<string, unknown>, files: Record<string, string> = {}) =>
    render(manifest({ testResults: tr }), files).warnings.join("\n");

  test("passed above total", () => {
    expect(warn({ ...passingRun, passed: 11, total: 10 })).toContain("passed (11) is more than total (10)");
  });

  test("failed tests listed while the counts say all passed", () => {
    expect(warn({ ...passingRun, failed: [{ name: "x", message: "m" }] })).toContain("counts say every test passed");
  });

  test("a failed test without a message", () => {
    expect(warn({ ...passingRun, passed: 9, failed: [{ name: "x", message: "" }] })).toContain("needs a name and its failure message");
  });

  test("an unknown scope", () => {
    expect(warn({ ...passingRun, scope: "everything" })).toContain("scope must be full, package, or related");
  });

  test("missing command and scopeNote", () => {
    const w = warn({ ...passingRun, command: "", scopeNote: "" });
    expect(w).toContain("missing command");
    expect(w).toContain("missing scopeNote");
  });

  test("notRun without a reason", () => {
    expect(warn({ notRun: "  " })).toContain("notRun needs a reason");
  });

  test("a test with no behavior", () => {
    const w = warn({ ...passingRun, files: [{ path: "x.ts", tests: [{ kind: "added", name: "t", behavior: "" }] }] }, { "x.ts": "" });
    expect(w).toContain('test "t" has no behavior');
  });

  test("a test with a bad kind", () => {
    const w = warn({ ...passingRun, files: [{ path: "x.ts", tests: [{ ...goodTest, kind: "removed" }] }] }, { "x.ts": "" });
    expect(w).toContain("needs kind added or modified");
  });

  test("a spec that cannot be read", () => {
    const r = render(manifest({ testResults: { ...passingRun, files: [{ path: "gone.spec.ts", tests: [goodTest] }] } }));
    expect(r.warnings.join("\n")).toContain('spec "gone.spec.ts" cannot be read');
  });

  test("an earlier run is checked like the main run", () => {
    const w = warn({ ...passingRun, earlier: [{ label: "first", passed: 5, total: 3, failed: [] }] });
    expect(w).toContain("testResults.earlier[0]: passed (5) is more than total (3)");
  });

  test("a clean run produces no warning", () => {
    expect(warn({ ...passingRun, files: [{ path: "x.ts", tests: [goodTest] }] }, { "x.ts": "" })).toBe("");
  });
});

describe("manifest checks", () => {
  test("a missing required field exits non-zero and writes nothing", () => {
    const r = render({ title: "T", graph: { nodes: [], edges: [], flows: [] } });
    expect(r.exitCode).not.toBe(0);
    expect(r.html).toBe("");
  });

  test("the UI block carries the report name, title and comment strings for the page", () => {
    const r = render(manifest({ lang: "en", title: "My report" }));
    const ui = jsonBlock(r.html, "nsx-ui") as { name: string; title: string; comments: Record<string, string> };
    expect(ui.name).toBe("r");
    expect(ui.title).toBe("My report");
    expect(ui.comments.copy).toBe("Copy comments");
    expect(ui.comments.list).toBe("Comments");
  });

  test("Vietnamese is the default language", () => {
    const ui = jsonBlock(render(manifest()).html, "nsx-ui") as { comments: Record<string, string> };
    expect(ui.comments.copy).toBe("Sao chép bình luận");
  });
});
