import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginsRoot = join(root, "src", "plugins");

for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }
  const script = join(pluginsRoot, entry.name, "scripts", "build.mjs");
  if (!existsSync(script)) {
    continue;
  }
  console.log(`plugin build: ${entry.name}`);
  execFileSync(process.execPath, [script], {
    cwd: root,
    stdio: "inherit",
  });
}
