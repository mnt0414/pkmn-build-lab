// data/generated + data/patches をマージし、data/sources/pokemon_list.csv とJOINして data/dist/ に書き出す。
// dist/ は都度完全再生成する(冪等)。
import { readFile } from "node:fs/promises";
import { parseCsv } from "./lib/csv.mjs";
import { readJson, writeJson } from "./lib/io.mjs";
import { buildBaseByNum, resolveCsvRow } from "./lib/join.mjs";
import { toId } from "./lib/to-id.mjs";

const GENERATED_DIR = "data/generated";
const PATCHES_DIR = "data/patches";
const DIST_DIR = "data/dist";
const SOURCES_DIR = "data/sources";
const CSV_PATH = "data/sources/pokemon_list.csv";
const ABILITY_SLOTS = ["0", "1", "H"];

function envelope(data, source, patchCount, counts) {
  return {
    _meta: {
      source,
      generatedAt: new Date().toISOString(),
      patch: patchCount,
      counts,
    },
    data,
  };
}

function applyMovesPatch(moves, patch) {
  let opCount = 0;
  const result = { ...moves };
  for (const [id, obj] of Object.entries(patch.add ?? {})) {
    result[id] = obj;
    opCount++;
  }
  for (const id of patch.remove ?? []) {
    delete result[id];
    opCount++;
  }
  for (const [id, fields] of Object.entries(patch.overrides ?? {})) {
    if (!result[id]) continue;
    result[id] = { ...result[id], ...fields };
    opCount++;
  }
  return { moves: result, opCount };
}

function applyLearnsetsPatch(learnsets, patch) {
  let opCount = 0;
  const result = { ...learnsets };
  for (const [speciesId, moveIds] of Object.entries(patch.add ?? {})) {
    const current = new Set(result[speciesId] ?? []);
    for (const m of moveIds) current.add(m);
    result[speciesId] = [...current].sort();
    opCount++;
  }
  for (const [speciesId, moveIds] of Object.entries(patch.remove ?? {})) {
    const current = new Set(result[speciesId] ?? []);
    for (const m of moveIds) current.delete(m);
    result[speciesId] = [...current].sort();
    opCount++;
  }
  for (const [speciesId, moveIds] of Object.entries(patch.overrides ?? {})) {
    result[speciesId] = [...moveIds].sort();
    opCount++;
  }
  return { learnsets: result, opCount };
}

// movesの各エントリにnameJa(patch上書き > 取得済み日本語名 > null)を追加する。
function applyMoveNamesJa(moves, namesJaData, patch) {
  const result = {};
  for (const [id, entry] of Object.entries(moves)) {
    result[id] = { ...entry, nameJa: patch[id] ?? namesJaData[id] ?? null };
  }
  return result;
}

// abilities(Showdown表記の英語名)の各スロットに対応する日本語名を引く。
function buildAbilitiesJa(abilities, namesJaData, patch) {
  const result = {};
  for (const slot of ABILITY_SLOTS) {
    const name = abilities?.[slot];
    if (!name) {
      result[slot] = null;
      continue;
    }
    const id = toId(name);
    result[slot] = patch[id] ?? namesJaData[id] ?? null;
  }
  return result;
}

// pokedexの各エントリにabilitiesJa(abilitiesと対称的な構造)を追加する。
function applyAbilitiesJa(pokedex, namesJaData, patch) {
  const result = {};
  for (const [id, entry] of Object.entries(pokedex)) {
    result[id] = { ...entry, abilitiesJa: buildAbilitiesJa(entry.abilities, namesJaData, patch) };
  }
  return result;
}

function joinPokedexWithCsv(pokedex, csvRows, formMap) {
  const warnings = [];
  const baseByNum = buildBaseByNum(pokedex);

  const result = {};
  for (const [id, entry] of Object.entries(pokedex)) {
    result[id] = {
      ...entry,
      nameJa: null,
      typesJa: null,
      spriteUrl: null,
      yakkunZukanUrl: null,
      yakkunTheoryUrl: entry.num > 0 ? `https://yakkun.com/sv/theory/p${entry.num}` : null,
    };
  }

  for (const row of csvRows) {
    const resolved = resolveCsvRow(row, pokedex, formMap, baseByNum);
    if (!resolved.ok) {
      warnings.push(`${resolved.reason} (no=${row.no} ${row.name})`);
      continue;
    }
    result[resolved.speciesId] = {
      ...result[resolved.speciesId],
      nameJa: row.name,
      typesJa: [row.type1, row.type2].filter(Boolean),
      spriteUrl: row.sprite_url,
      yakkunZukanUrl: row.yakkun_url,
    };
  }

  return { pokedex: result, warnings };
}

async function main() {
  const [
    pokedexGen,
    movesGen,
    learnsetsGen,
    movesPatch,
    learnsetsPatch,
    formMap,
    moveNamesJa,
    abilityNamesJa,
    moveNamesJaPatch,
    abilityNamesJaPatch,
  ] = await Promise.all([
    readJson(`${GENERATED_DIR}/pokedex.json`),
    readJson(`${GENERATED_DIR}/moves.json`),
    readJson(`${GENERATED_DIR}/learnsets.json`),
    readJson(`${PATCHES_DIR}/moves.patch.json`),
    readJson(`${PATCHES_DIR}/learnsets.patch.json`),
    readJson(`${PATCHES_DIR}/form-map.json`),
    readJson(`${SOURCES_DIR}/move_names_ja.json`),
    readJson(`${SOURCES_DIR}/ability_names_ja.json`),
    readJson(`${PATCHES_DIR}/move-names-ja.patch.json`),
    readJson(`${PATCHES_DIR}/ability-names-ja.patch.json`),
  ]);
  const csvText = await readFile(CSV_PATH, "utf8");
  const csvRows = parseCsv(csvText);

  const { moves: movesPatched, opCount: movesPatchCount } = applyMovesPatch(movesGen.data, movesPatch);
  const moves = applyMoveNamesJa(movesPatched, moveNamesJa.data, moveNamesJaPatch);
  const { learnsets, opCount: learnsetsPatchCount } = applyLearnsetsPatch(learnsetsGen.data, learnsetsPatch);
  const { pokedex: pokedexJoined, warnings } = joinPokedexWithCsv(pokedexGen.data, csvRows, formMap);
  const pokedex = applyAbilitiesJa(pokedexJoined, abilityNamesJa.data, abilityNamesJaPatch);

  for (const w of warnings) console.warn(`[data-build] WARN: ${w}`);

  await writeJson(
    `${DIST_DIR}/pokedex.json`,
    envelope(pokedex, `${pokedexGen._meta.source} + ${CSV_PATH} (BATTLEREC)`, 0, Object.keys(pokedex).length)
  );
  await writeJson(`${DIST_DIR}/moves.json`, envelope(moves, movesGen._meta.source, movesPatchCount, Object.keys(moves).length));
  await writeJson(
    `${DIST_DIR}/learnsets.json`,
    envelope(learnsets, learnsetsGen._meta.source, learnsetsPatchCount, Object.keys(learnsets).length)
  );

  console.log(`[data-build] pokedex: ${Object.keys(pokedex).length}件 (CSV未結合警告: ${warnings.length}件)`);
  console.log(`[data-build] moves: ${Object.keys(moves).length}件 (patch適用: ${movesPatchCount}件)`);
  console.log(`[data-build] learnsets: ${Object.keys(learnsets).length}件 (patch適用: ${learnsetsPatchCount}件)`);
}

main();
