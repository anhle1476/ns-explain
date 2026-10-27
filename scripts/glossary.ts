// Terms the agent must keep untranslated. Two layers, merged:
//   user  ~/.ns-explain/glossary.json   every repo on this machine
//   repo  .ns-explain/glossary.json     the repo the command runs in (the working directory)
// Each file is {"keep": ["toolbar", "word document"]}. The layers are added together; a
// repeat (any letter case) keeps the spelling of the first file that has it.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type GlossaryLayer = "user" | "repo";

export interface GlossarySource {
  layer: GlossaryLayer;
  path: string;
  /** Terms the file lists, before repeats across layers are dropped. */
  count: number;
}

export interface Glossary {
  terms: string[];
  /** Files that exist and were read. */
  sources: GlossarySource[];
  warnings: string[];
  /** Where each layer lives whether or not the file exists, so an empty glossary can say where to create one. */
  paths: Record<GlossaryLayer, string>;
}

const FILE = "glossary.json";

function isMissing(e: unknown): boolean {
  return e instanceof Error && "code" in e && e.code === "ENOENT";
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

function parseTerms(raw: string, path: string, warnings: string[]): string[] {
  let data: unknown;
  try {
    // A byte order mark is common in files saved by Windows editors and breaks JSON.parse.
    data = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (e) {
    warnings.push(`${path}: not valid JSON (${reason(e)})`);
    return [];
  }
  if (!data || typeof data !== "object" || !("keep" in data) || !Array.isArray(data.keep)) {
    warnings.push(`${path}: expected {"keep": ["term", ...]}`);
    return [];
  }
  const items: unknown[] = data.keep;
  const terms: string[] = [];
  for (const item of items) {
    const term = typeof item === "string" ? item.trim().replace(/\s+/g, " ") : "";
    if (term) terms.push(term);
    else warnings.push(`${path}: "keep" holds an entry that is not a non-empty string`);
  }
  return terms;
}

export async function loadGlossary(): Promise<Glossary> {
  const paths: Record<GlossaryLayer, string> = {
    user: join(homedir(), ".ns-explain", FILE),
    repo: resolve(".ns-explain", FILE),
  };
  // Run from the home directory, both layers are one file: read it once.
  const same = process.platform === "win32"
    ? paths.user.toLowerCase() === paths.repo.toLowerCase()
    : paths.user === paths.repo;
  const layers: GlossaryLayer[] = same ? ["user"] : ["user", "repo"];

  const warnings: string[] = [];
  const sources: GlossarySource[] = [];
  const seen = new Map<string, string>();
  for (const layer of layers) {
    const path = paths[layer];
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (e) {
      if (!isMissing(e)) warnings.push(`${path}: cannot read (${reason(e)})`);
      continue;
    }
    const terms = parseTerms(raw, path, warnings);
    sources.push({ layer, path, count: terms.length });
    for (const term of terms) {
      const key = term.toLowerCase();
      if (!seen.has(key)) seen.set(key, term);
    }
  }
  return { terms: [...seen.values()], sources, warnings, paths };
}

export function formatGlossary(g: Glossary): string {
  if (g.terms.length === 0) {
    return [
      "Glossary: empty. No term is pinned.",
      "To keep terms untranslated, add them to one of these files:",
      `  ${g.paths.repo}    (this repo)`,
      `  ${g.paths.user}    (every repo)`,
      'Format: {"keep": ["term", "multi word term"]}',
      "",
    ].join("\n");
  }
  return [
    "Glossary: keep these terms exactly as written. Never translate them, in the chat reply or in the manifest (titles, prose, labels, notes).",
    ...g.terms.map((t) => `- ${t}`),
    `From: ${g.sources.map((s) => `${s.layer} ${s.path} (${s.count})`).join(", ")}`,
    "",
  ].join("\n");
}
