// data/generated・data/patches・data/dist の整合性を検証する。
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCsv } from "./lib/csv.mjs";
import { readJson } from "./lib/io.mjs";
import { buildBaseByNum, resolveCsvRow } from "./lib/join.mjs";

const GENERATED_DIR = "data/generated";
const PATCHES_DIR = "data/patches";
const DIST_DIR = "data/dist";
const CSV_PATH = "data/sources/pokemon_list.csv";

// form-map.unresolved.md に列挙済みの「既知の未解決行」を no|name キーの集合として抽出する。
async function loadKnownUnresolved() {
  const text = await readFile(`${PATCHES_DIR}/form-map.unresolved.md`, "utf8");
  const known = new Set();
  for (const line of text.split("\n")) {
    const m = line.match(/^\|\s*\d+\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|/);
    if (m) known.add(`${m[1]}|${m[2]}`);
  }
  return known;
}

test("patch有効性: moves.patch.json", async () => {
  const movesGen = (await readJson(`${GENERATED_DIR}/moves.json`)).data;
  const patch = await readJson(`${PATCHES_DIR}/moves.patch.json`);
  for (const id of patch.remove ?? []) {
    assert.ok(id in movesGen, `remove対象がgeneratedに存在しない: ${id}`);
  }
  for (const id of Object.keys(patch.add ?? {})) {
    assert.ok(!(id in movesGen), `add対象が既にgeneratedに存在する(不要patch): ${id}`);
  }
  for (const id of Object.keys(patch.overrides ?? {})) {
    assert.ok(id in movesGen, `overrides対象がgeneratedに存在しない: ${id}`);
  }
});

test("patch有効性: learnsets.patch.json", async () => {
  const learnsetsGen = (await readJson(`${GENERATED_DIR}/learnsets.json`)).data;
  const patch = await readJson(`${PATCHES_DIR}/learnsets.patch.json`);
  for (const [speciesId, moveIds] of Object.entries(patch.remove ?? {})) {
    const current = new Set(learnsetsGen[speciesId] ?? []);
    for (const moveId of moveIds) {
      assert.ok(current.has(moveId), `remove対象がgeneratedに存在しない: ${speciesId}/${moveId}`);
    }
  }
  for (const [speciesId, moveIds] of Object.entries(patch.add ?? {})) {
    const current = new Set(learnsetsGen[speciesId] ?? []);
    for (const moveId of moveIds) {
      assert.ok(!current.has(moveId), `add対象が既にgeneratedに存在する(不要patch): ${speciesId}/${moveId}`);
    }
  }
});

test("サンプリング照合: PokeAPIとの種族値・タイプ突合", async (t) => {
  const pokedex = (await readJson(`${DIST_DIR}/pokedex.json`)).data;
  // dexId -> PokeAPI slug(通常フォルム+主要なフォルム違いを含む)
  const samples = {
    pikachu: "pikachu",
    charizard: "charizard",
    rotomwash: "rotom-wash",
    deoxysattack: "deoxys-attack",
    landorustherian: "landorus-therian",
    kyuremblack: "kyurem-black",
    ninetalesalola: "ninetales-alola",
    ogerponwellspring: "ogerpon-wellspring-mask",
    gengar: "gengar",
    garchomp: "garchomp",
  };

  let reachable = true;
  try {
    const res = await fetch("https://pokeapi.co/api/v2/pokemon/pikachu", { signal: AbortSignal.timeout(5000) });
    reachable = res.ok;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    console.warn("[data-verify] PokeAPIに到達できないためサンプリング照合をスキップします");
    return;
  }

  for (const [dexId, slug] of Object.entries(samples)) {
    await t.test(dexId, async () => {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`, { signal: AbortSignal.timeout(10000) });
      assert.ok(res.ok, `PokeAPI取得失敗: ${slug} (${res.status})`);
      const api = await res.json();
      const entry = pokedex[dexId];
      assert.ok(entry, `pokedexにエントリが存在しない: ${dexId}`);

      const apiStats = Object.fromEntries(
        api.stats.map((s) => [
          { hp: "hp", attack: "atk", defense: "def", "special-attack": "spa", "special-defense": "spd", speed: "spe" }[s.stat.name],
          s.base_stat,
        ])
      );
      for (const key of ["hp", "atk", "def", "spa", "spd", "spe"]) {
        assert.equal(entry.baseStats[key], apiStats[key], `${dexId}.baseStats.${key}が不一致`);
      }

      const apiTypes = api.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
      const entryTypes = entry.types.map((t) => t.toLowerCase());
      assert.deepEqual(entryTypes, apiTypes, `${dexId}.typesが不一致`);
    });
  }
});

test("参照整合性: learnsetsの技IDがmovesに存在する", async () => {
  const moves = (await readJson(`${DIST_DIR}/moves.json`)).data;
  const learnsets = (await readJson(`${DIST_DIR}/learnsets.json`)).data;
  const missing = [];
  for (const [speciesId, moveIds] of Object.entries(learnsets)) {
    for (const moveId of moveIds) {
      if (!(moveId in moves)) missing.push(`${speciesId}/${moveId}`);
    }
  }
  assert.deepEqual(missing, [], `movesに存在しない技IDがlearnsetsに含まれる: ${missing.join(", ")}`);
});

test("CSV⇔pokedex整合性: 全行の解決とform-mapの過不足", async () => {
  const pokedex = (await readJson(`${DIST_DIR}/pokedex.json`)).data;
  const formMap = await readJson(`${PATCHES_DIR}/form-map.json`);
  const csvText = await readFile(CSV_PATH, "utf8");
  const rows = parseCsv(csvText);
  const baseByNum = buildBaseByNum(pokedex);
  const knownUnresolved = await loadKnownUnresolved();

  const unexpectedOrphans = [];
  const expectedOrphans = [];
  for (const row of rows) {
    const resolved = resolveCsvRow(row, pokedex, formMap, baseByNum);
    if (resolved.ok) continue;
    const key = `${row.no}|${row.name}`;
    if (knownUnresolved.has(key)) {
      expectedOrphans.push(key);
    } else {
      unexpectedOrphans.push(`${key}: ${resolved.reason}`);
    }
  }
  if (expectedOrphans.length) {
    console.warn(`[data-verify] 既知の未解決行(form-map.unresolved.md記載): ${expectedOrphans.join(", ")}`);
  }
  assert.deepEqual(unexpectedOrphans, [], `未文書化の孤立CSV行を検出: ${unexpectedOrphans.join(", ")}`);

  const csvOverrides = new Set(rows.map((r) => r.sprite_override).filter(Boolean));
  const formMapKeys = new Set(Object.keys(formMap));
  const onlyInCsv = [...csvOverrides].filter((v) => !formMapKeys.has(v));
  const onlyInFormMap = [...formMapKeys].filter((v) => !csvOverrides.has(v));
  assert.deepEqual(onlyInCsv, [], `CSVのsprite_overrideのうちform-map.jsonに無いもの: ${onlyInCsv.join(", ")}`);
  assert.deepEqual(onlyInFormMap, [], `form-map.jsonのキーのうちCSVに無いもの: ${onlyInFormMap.join(", ")}`);
});
