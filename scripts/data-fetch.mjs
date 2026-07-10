// @pkmn/dex(gen9)から種族・技・覚える技を抽出し、data/generated/ にスナップショットとして出力する。
import { Dex } from "@pkmn/dex";
import { Generations } from "@pkmn/data";
import { createRequire } from "node:module";
import { writeJson } from "./lib/io.mjs";

const require = createRequire(import.meta.url);
const dexVersion = require("@pkmn/dex/package.json").version;

const GENERATED_DIR = "data/generated";
const ABILITY_SLOTS = ["0", "1", "H"];
const NONSTANDARD_MOVE_EXCLUDE = ["CAP", "Custom"];

function envelope(data) {
  return {
    _meta: {
      source: `@pkmn/dex@${dexVersion} (gen9)`,
      fetchedAt: new Date().toISOString(),
    },
    data,
  };
}

function extractAbilities(abilities) {
  return ABILITY_SLOTS.reduce((acc, slot) => {
    acc[slot] = abilities?.[slot] ?? null;
    return acc;
  }, {});
}

function extractPokedex(gen) {
  const pokedex = {};
  for (const species of gen.species.all()) {
    pokedex[species.id] = {
      id: species.id,
      num: species.num,
      name: species.name,
      baseSpecies: species.baseSpecies,
      forme: species.forme,
      types: species.types,
      baseStats: species.baseStats,
      abilities: extractAbilities(species.abilities),
      isNonstandard: species.isNonstandard ?? null,
      prevo: species.prevo || null,
      evos: species.evos ?? [],
    };
  }
  return pokedex;
}

function extractMoves(gen) {
  const moves = {};
  for (const move of gen.moves.all()) {
    if (NONSTANDARD_MOVE_EXCLUDE.includes(move.isNonstandard)) continue;
    moves[move.id] = {
      id: move.id,
      name: move.name,
      type: move.type,
      category: move.category,
      basePower: move.basePower,
      accuracy: move.accuracy,
      pp: move.pp,
      priority: move.priority,
      secondary: move.secondary ?? null,
    };
  }
  return moves;
}

async function extractLearnsets(gen, generations, moves) {
  const speciesAll = gen.species.all();
  const entries = await Promise.all(
    speciesAll.map(async (species) => {
      const data = await generations.learnsets.get(species.id);
      if (!data?.learnset) return null; // Mega/Gmax等battle-only formeはベースフォルムに統合済み
      // CAP種族はCAP専用のファンメイド技(moves側で除外済み)を参照するため、ここでも揃えて除外する
      const moveIds = Object.keys(data.learnset).filter((id) => id in moves);
      return [species.id, moveIds];
    })
  );
  return entries.reduce((acc, entry) => {
    if (entry) acc[entry[0]] = entry[1];
    return acc;
  }, {});
}

async function main() {
  const gen = Dex.forGen(9);
  const generations = new Generations(Dex);

  const pokedex = extractPokedex(gen);
  const moves = extractMoves(gen);
  const learnsets = await extractLearnsets(gen, generations.get(9), moves);

  await writeJson(`${GENERATED_DIR}/pokedex.json`, envelope(pokedex));
  await writeJson(`${GENERATED_DIR}/moves.json`, envelope(moves));
  await writeJson(`${GENERATED_DIR}/learnsets.json`, envelope(learnsets));

  console.log(`[data-fetch] pokedex: ${Object.keys(pokedex).length}件`);
  console.log(`[data-fetch] moves: ${Object.keys(moves).length}件`);
  console.log(`[data-fetch] learnsets: ${Object.keys(learnsets).length}件`);
}

main();
