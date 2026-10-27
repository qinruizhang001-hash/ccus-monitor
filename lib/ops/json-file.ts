import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export function dataFile(name: string) {
  return path.join(process.cwd(), ".data", name);
}

export function readJsonFile<T>(file: string, fallback: T): T {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
