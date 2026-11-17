import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { rcedit } from "rcedit";

const executable = resolve("dist/win-unpacked/独去闲工具箱.exe");
const icon = resolve("resources/icon.ico");

await Promise.all([access(executable), access(icon)]);
await rcedit(executable, {
  icon,
  "file-version": "1.0.0.0",
  "product-version": "1.0.0",
  "version-string": {
    CompanyName: "duquxian",
    FileDescription: "Windows 个人截图与工具箱",
    ProductName: "独去闲工具箱",
    LegalCopyright: `Copyright © ${new Date().getFullYear()} duquxian`,
    InternalName: "duquxian-toolbox",
    OriginalFilename: "独去闲工具箱.exe",
  },
});

console.log(`已写入应用图标：${executable}`);
