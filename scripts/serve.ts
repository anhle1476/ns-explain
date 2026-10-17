#!/usr/bin/env node
// Serve an ns-explain HTML artifact over a local HTTP server and open it in the
// browser. The file's directory is the web root, so sibling assets such as
// images still resolve. The diagram viewer is already inside the HTML.
//
// Usage: node serve.ts <html-file> [--port <n>] [--no-open]

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { execFile } from "node:child_process";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const args = process.argv.slice(2);
let file = null;
let port = 0; // 0 = pick a free port
let openBrowser = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port") port = Number(args[++i]);
  else if (args[i] === "--no-open") openBrowser = false;
  else if (!args[i].startsWith("-")) file = args[i];
}

if (!file) {
  console.error("usage: node serve.ts <html-file> [--port <n>] [--no-open]");
  process.exit(2);
}

const abs = resolve(file);
const root = resolve(abs, "..");
const baseName = abs.slice(root.length + 1);

const server = createServer(async (req, res) => {
  // A malformed %escape or odd URL must fail this request, not crash the server.
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  } catch {
    res.writeHead(400).end("bad request");
    return;
  }
  const target = normalize(join(root, pathname === "/" ? baseName : pathname));

  if (target !== root && !target.startsWith(root + sep)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  try {
    const body = await readFile(target);
    res.writeHead(200, {
      "content-type": MIME[extname(target)] ?? "application/octet-stream",
      // Artifacts get edited and re-rendered; never let the browser show a stale copy.
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  const addr = server.address();
  const bound = typeof addr === "object" && addr ? addr.port : port;
  const url = `http://127.0.0.1:${bound}/${encodeURIComponent(baseName)}`;
  console.log(`serving ${root}`);
  console.log(url);
  if (openBrowser) {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const cmdArgs = process.platform === "win32" ? ["/c", "start", url] : [url];
    execFile(cmd, cmdArgs, () => {});
  }
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
