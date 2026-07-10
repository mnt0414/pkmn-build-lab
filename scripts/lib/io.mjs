import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }
  return value;
}

export async function readJson(path) {
  const text = await readFile(path, "utf8");
  return JSON.parse(text);
}

export async function writeJson(path, obj) {
  await mkdir(dirname(path), { recursive: true });
  const sorted = sortKeysDeep(obj);
  await writeFile(path, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}
