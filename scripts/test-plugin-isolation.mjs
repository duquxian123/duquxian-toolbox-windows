import { _electron as electron, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootNodeModules = join(root, "node_modules");
const skippedRoots = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  "test-results",
  ".screenshots",
  ".trae",
  "zctemp",
]);

const scenarios = [
  { name: "without capture", removePlugin: "capture" },
  { name: "without organizer", removePlugin: "organizer" },
  { name: "without battery", removePlugin: "battery" },
  {
    name: "broken main module",
    removeFile: "src/plugins/organizer/main/index.ts",
    failedPlugin: "organizer",
    navTitle: "媒体整理",
  },
  {
    name: "renderer load failure",
    fixture: "load-failure",
    navTitle: "故障插件",
  },
  {
    name: "renderer page failure",
    fixture: "page-failure",
    navTitle: "故障插件",
  },
];

function exists(path) {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function copyProject(destination) {
  await cp(root, destination, {
    recursive: true,
    filter(source) {
      const rel = relative(root, source);
      if (!rel) {
        return true;
      }
      return !skippedRoots.has(rel.split(sep)[0]);
    },
  });
  await symlink(
    rootNodeModules,
    join(destination, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
}

function runNpmScript(project, script) {
  const command =
    process.platform === "win32"
      ? [process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `npm run ${script}`]]
      : ["npm", ["run", script]];
  execFileSync(command[0], command[1], {
    cwd: project,
    env: process.env,
    stdio: "pipe",
  });
}

async function addFixture(project, kind) {
  const pluginRoot = join(project, "src", "plugins", "broken-ui");
  await mkdir(join(pluginRoot, "main"), { recursive: true });
  await mkdir(join(pluginRoot, "renderer"), { recursive: true });
  await writeFile(
    join(pluginRoot, "plugin.ts"),
    'export const meta = { id: "broken-ui", order: 99, navTitle: "故障插件" };\n',
  );
  await writeFile(
    join(pluginRoot, "main", "index.ts"),
    "export default { setup() {} };\n",
  );
  if (kind === "load-failure") {
    await writeFile(
      join(pluginRoot, "renderer", "index.tsx"),
      [
        'throw new Error("渲染入口加载测试错误");',
        "export default {};",
        "",
      ].join("\n"),
    );
    return;
  }
  await writeFile(
    join(pluginRoot, "renderer", "index.tsx"),
    [
      "export default {",
      '  id: "broken-ui",',
      "  Icon: () => null,",
      "  Page() {",
      '    throw new Error("页面渲染测试错误");',
      "  },",
      "};",
      "",
    ].join("\n"),
  );
}

async function verifyShell(project, scenario) {
  const userData = await mkdtemp(join(tmpdir(), "toolbox-isolation-data-"));
  const markerId =
    scenario.removePlugin ?? scenario.failedPlugin ?? "broken-ui";
  const marker = join(userData, "plugins", markerId, "marker.txt");
  await mkdir(dirname(marker), { recursive: true });
  await writeFile(marker, "keep-or-delete");
  const electronApp = await electron.launch({
    args: [project],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      TOOLBOX_TEST_USER_DATA: userData,
    },
  });

  try {
    const page = await electronApp.firstWindow();
    await expect(page.locator(".sidebar")).toBeVisible();
    if (scenario.removePlugin) {
      await expect.poll(() => exists(marker)).toBe(false);
    } else {
      expect(await exists(marker)).toBe(true);
    }
    if (scenario.navTitle) {
      await page.getByRole("button", {
        name: scenario.navTitle,
        exact: true,
      }).click();
      await expect(page.locator(".plugin-error-card")).toBeVisible();
      await expect(page.getByText("重试", { exact: true })).toBeVisible();
    }
    await page.getByRole("button", {
      name: "系统设置",
      exact: true,
    }).click();
    await expect(
      page.getByRole("heading", { name: "系统设置" }),
    ).toBeVisible();
    await expect(page.getByText("所有数据只保存在本机")).toBeVisible();
  } finally {
    await electronApp.close();
    await rm(userData, { recursive: true, force: true });
  }
}

async function runScenario(scenario) {
  const tempRoot = await mkdtemp(join(tmpdir(), "toolbox-plugin-isolation-"));
  const project = join(tempRoot, "project");
  try {
    await copyProject(project);
    if (scenario.removePlugin) {
      await rm(join(project, "src", "plugins", scenario.removePlugin), {
        recursive: true,
        force: true,
      });
    }
    if (scenario.removeFile) {
      await rm(join(project, scenario.removeFile), { force: true });
    }
    if (scenario.fixture) {
      await addFixture(project, scenario.fixture);
    }
    runNpmScript(project, "typecheck");
    runNpmScript(project, "build");
    await verifyShell(project, scenario);
    console.log(`ok - ${scenario.name}`);
  } finally {
    const tempBase = await realpath(tmpdir());
    const resolvedTemp = resolve(tempRoot);
    if (resolvedTemp.startsWith(`${tempBase}${sep}`)) {
      await rm(resolvedTemp, { recursive: true, force: true });
    }
  }
}

for (const scenario of scenarios) {
  await runScenario(scenario);
}
