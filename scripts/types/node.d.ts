// Just enough of Node's types for this CLI. The skill does not install
// @types/node; `node ns-explain.ts` type-strips these imports at runtime.
declare const process: {
  argv: string[];
  execPath: string;
  platform: string;
  exitCode?: number;
  exit(code?: number): never;
  stdout: { write(s: string): void };
  on(event: string, handler: () => void): void;
};

declare module "node:fs/promises" {
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function readFile(path: string): Promise<Uint8Array>;
  export function writeFile(path: string, data: string): Promise<void>;
  export function mkdir(path: string, opts: { recursive: boolean }): Promise<unknown>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function rm(path: string, opts: { recursive: boolean; force: boolean }): Promise<void>;
}

declare module "node:path" {
  export function resolve(...parts: string[]): string;
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
  export function basename(path: string): string;
  export function extname(path: string): string;
  export function normalize(path: string): string;
  export const sep: string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:child_process" {
  export interface SpawnSyncResult {
    status: number | null;
    stdout: string;
    stderr: string;
  }
  export function spawnSync(
    command: string,
    args: string[],
    opts: { encoding: "utf8" },
  ): SpawnSyncResult;
  export interface Child {
    kill(signal: string): void;
    on(event: "exit", handler: (code: number | null) => void): void;
  }
  export function spawn(
    command: string,
    args: string[],
    opts: { stdio: "inherit" },
  ): Child;
  export function execFile(command: string, args: string[], cb: () => void): void;
}

declare module "node:http" {
  export interface IncomingMessage {
    url?: string;
  }
  export interface ServerResponse {
    writeHead(status: number, headers?: Record<string, string>): ServerResponse;
    end(body?: string | Uint8Array): void;
  }
  export interface Server {
    listen(port: number, host: string, cb: () => void): void;
    address(): { port: number } | string | null;
  }
  export function createServer(
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  ): Server;
}
