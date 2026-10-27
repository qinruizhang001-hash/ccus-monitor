#!/usr/bin/env node
// 依赖许可证审计。
//
// 这个项目会把 Next.js 打包产物放到值班室的机器上跑。强 copyleft（AGPL / GPL / SSPL）
// 一旦进入运行时依赖，分发这个产物就有义务开源自家的服务端代码 —— 而这件事
// 在 `npm install` 的时候不会报错，也不会出现在任何一次构建日志里。
//
// 所以这里把 461 个包的 license 字段读一遍，分三档：
//   block   —— 强 copyleft，退出码 1
//   review  —— 弱 copyleft 或没有 license 字段，列出来但不算失败（附包数）
//   ok      —— 其余
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modules = path.join(root, "node_modules");

const BLOCK = /(^|[^L])GPL|AGPL|SSPL|Commons Clause|CC-BY-NC|BUSL/i;
const REVIEW = /LGPL|MPL|EPL|CC-BY|Unlicense|WTFPL/i;

function readLicense(dir) {
  try {
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
    const value = typeof pkg.license === "string" ? pkg.license : pkg.license?.type;
    return { name: pkg.name ?? path.basename(dir), version: pkg.version ?? "?", license: value ?? null };
  } catch {
    return null;
  }
}

function collect() {
  const found = [];
  let entries = [];
  try {
    entries = readdirSync(modules, { withFileTypes: true });
  } catch {
    console.error("没有 node_modules —— 先 npm install，否则这次审计什么都没查。");
    process.exit(1);
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@")) {
      let scoped = [];
      try {
        scoped = readdirSync(path.join(modules, entry.name), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const inner of scoped) {
        if (!inner.isDirectory() && !inner.isSymbolicLink()) continue;
        const info = readLicense(path.join(modules, entry.name, inner.name));
        if (info) found.push(info);
      }
      continue;
    }
    const info = readLicense(path.join(modules, entry.name));
    if (info) found.push(info);
  }
  return found;
}

const packages = collect();
const blocked = packages.filter((pkg) => pkg.license && BLOCK.test(pkg.license) && !REVIEW.test(pkg.license));
const review = packages.filter(
  (pkg) => !blocked.includes(pkg) && (!pkg.license || REVIEW.test(pkg.license)),
);
const unknown = review.filter((pkg) => !pkg.license);

console.log(`依赖总数 ${packages.length}`);
console.log(`  强 copyleft（阻断） ${blocked.length}`);
console.log(`  需人工确认 ${review.length}（其中没有 license 字段 ${unknown.length}）`);

if (review.length > 0) {
  console.log("\n需人工确认：");
  for (const pkg of review.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  ${pkg.name}@${pkg.version}  ${pkg.license ?? "（无 license 字段）"}`);
  }
}

if (blocked.length > 0) {
  console.error("\n发现强 copyleft 依赖，不能随打包产物分发：");
  for (const pkg of blocked.sort((a, b) => a.name.localeCompare(b.name))) {
    console.error(`  ${pkg.name}@${pkg.version}  ${pkg.license}`);
  }
  console.error("\n处理方式三选一：换掉这个包、买商业授权、或把它隔离到不分发的服务侧。");
  process.exit(1);
}

console.log("\n没有强 copyleft 依赖。");
