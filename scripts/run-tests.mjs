#!/usr/bin/env node
// 收集所有 *.test.ts 并交给 node:test 跑。
//
// 不写成 `tsx --test lib/**/*.test.ts`：npm 在 Windows 上走 cmd.exe，glob 不会被展开，
// 结果是把字面量路径传给测试运行器 —— 它找不到文件，退出码却可能是 0。
// 这里自己走目录、自己打印文件清单，让 CI 日志能看出到底跑了哪些。
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEARCH = ["lib", "app", "components"];

function walk(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".data") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (/\.test\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

const files = SEARCH.flatMap((dir) => walk(path.join(root, dir))).sort();
if (files.length === 0) {
  console.error("没有找到任何测试文件 —— 这比测试失败更糟，说明收集逻辑坏了。");
  process.exit(1);
}

console.log(`发现 ${files.length} 个测试文件：`);
for (const file of files) console.log(`  ${path.relative(root, file).replaceAll("\\", "/")}`);

const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const result = spawnSync(
  process.execPath,
  [tsx, "--test", ...files.map((file) => path.relative(root, file))],
  { cwd: root, stdio: "inherit" },
);
process.exit(result.status ?? 1);
