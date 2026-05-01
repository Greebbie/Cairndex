import { join } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type { Config } from "./config.js";
import { vaultPath } from "./paths.js";

export interface WatcherInput {
  repoRoot: string;
  cfg: Config;
  debounceMs?: number;
  onChange?: (path: string) => void | Promise<void>;
  onAdd?: (path: string) => void | Promise<void>;
  onUnlink?: (path: string) => void | Promise<void>;
  onRename?: (oldPath: string, newPath: string) => void | Promise<void>;
}

export interface Watcher {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createWatcher(input: WatcherInput): Watcher {
  const debounceMs = input.debounceMs ?? 250;
  const debounce = new Map<string, NodeJS.Timeout>();
  let fsw: FSWatcher | null = null;

  function fire(path: string, fn: ((p: string) => void | Promise<void>) | undefined) {
    if (!fn) return;
    const key = `${fn.name}:${path}`;
    const prev = debounce.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      debounce.delete(key);
      void fn(path);
    }, debounceMs);
    debounce.set(key, t);
  }

  return {
    async start() {
      if (fsw) return;
      const root = vaultPath(input.repoRoot);
      fsw = chokidar.watch(root, {
        ignored: [
          /(^|[\\/])\.sync-conflicts/,
          /(^|[\\/])\.sync-baseline\.json$/,
          // Derived layer is written by the cascade; ignoring here prevents the
          // chokidar→watcherActions→regen loop from firing in the first place.
          /[\\/]\.cairndex[\\/]indexes(?:[\\/]|$)/,
        ],
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
      });
      fsw.on("add", (p) => {
        fire(p, input.onAdd);
        // Also fire onChange so consumers receive a single event stream regardless of
        // whether a write created a new file or modified an existing one.
        fire(p, input.onChange);
      });
      fsw.on("change", (p) => fire(p, input.onChange));
      fsw.on("unlink", (p) => fire(p, input.onUnlink));
      // chokidar does not natively emit rename; consumers detect via add+unlink within a window.
      await new Promise<void>((resolve, reject) => {
        if (!fsw) return resolve();
        fsw.once("ready", () => resolve());
        fsw.once("error", reject);
      });
      // Reference unused to silence linter
      void join;
    },
    async stop() {
      if (!fsw) return;
      for (const t of debounce.values()) clearTimeout(t);
      debounce.clear();
      await fsw.close();
      fsw = null;
    },
  };
}
