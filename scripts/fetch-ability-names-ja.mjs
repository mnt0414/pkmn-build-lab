// PokeAPI(静的ミラー優先・ライブAPIフォールバック)からdata/generated/pokedex.jsonが参照する特性の日本語名を取得し、
// data/sources/ability_names_ja.json に保存するワンショットスクリプト(data:fetchフローとは独立)。
// 中断しても再実行で未取得idのみ再開する。
import { readJson, writeJson } from "./lib/io.mjs";
import { toId } from "./lib/to-id.mjs";
import { fetchJson, pickJaName, fetchSlugMap, runWithConcurrency } from "./lib/pokeapi-ja.mjs";

const GENERATED_POKEDEX = "data/generated/pokedex.json";
const OUTPUT_PATH = "data/sources/ability_names_ja.json";
const RESOURCE = "ability";
const ABILITY_SLOTS = ["0", "1", "H"];
const SAVE_EVERY = 50;
const SOURCE_LABEL = "PokeAPI (raw.githubusercontent.com/PokeAPI/api-data, fallback: pokeapi.co/api/v2/ability)";

// pokedexの abilities.0/1/H (Showdown表記の英語名) から、toId正規化した特性id一覧を作る。
function extractAbilityIds(pokedex) {
  const ids = new Set();
  for (const entry of Object.values(pokedex)) {
    for (const slot of ABILITY_SLOTS) {
      const name = entry.abilities?.[slot];
      if (name) ids.add(toId(name));
    }
  }
  return [...ids].sort();
}

async function loadExisting() {
  try {
    return await readJson(OUTPUT_PATH);
  } catch {
    return { _meta: { source: SOURCE_LABEL, fetchedAt: null, counts: 0, unmatched: [] }, data: {} };
  }
}

async function main() {
  const pokedexGen = await readJson(GENERATED_POKEDEX);
  const allIds = extractAbilityIds(pokedexGen.data);

  const existing = await loadExisting();
  const data = { ...existing.data };
  const unmatched = new Set(existing._meta?.unmatched ?? []);
  const targetIds = allIds.filter((id) => !(id in data));

  console.log(
    `[fetch-ability-names-ja] 対象: ${allIds.length}件 (既取得: ${allIds.length - targetIds.length}件 / 未取得: ${targetIds.length}件)`
  );

  if (targetIds.length === 0) {
    console.log("[fetch-ability-names-ja] 未取得idなし。終了します。");
    return;
  }

  console.log(`[fetch-ability-names-ja] ${RESOURCE}一覧を取得中...`);
  const slugMap = await fetchSlugMap(RESOURCE);
  console.log(`[fetch-ability-names-ja] ${RESOURCE}一覧: ${slugMap.size}件`);

  async function persist() {
    await writeJson(OUTPUT_PATH, {
      _meta: {
        source: SOURCE_LABEL,
        fetchedAt: new Date().toISOString(),
        counts: Object.keys(data).length,
        unmatched: [...unmatched].sort(),
      },
      data,
    });
  }

  let sinceSave = 0;
  await runWithConcurrency(
    targetIds,
    async (id) => {
      const entry = slugMap.get(id);
      if (!entry) {
        unmatched.add(id);
        console.warn(`[fetch-ability-names-ja] WARN: PokeAPI未対応(スラッグ不一致): ${id}`);
        return;
      }

      let names;
      try {
        const json = await fetchJson(
          `https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2/${RESOURCE}/${entry.numericId}/index.json`,
          { retries: 1 }
        );
        names = json.names;
      } catch {
        try {
          const json = await fetchJson(`https://pokeapi.co/api/v2/${RESOURCE}/${entry.slug}`, { retries: 3, timeoutMs: 10000 });
          names = json.names;
        } catch (err) {
          unmatched.add(id);
          console.warn(`[fetch-ability-names-ja] WARN: 取得失敗: ${id} (${err.message})`);
          return;
        }
      }

      const ja = pickJaName(names);
      if (ja) {
        data[id] = ja;
        unmatched.delete(id);
      } else {
        unmatched.add(id);
        console.warn(`[fetch-ability-names-ja] WARN: 日本語名なし: ${id}`);
      }
    },
    {
      concurrency: 4,
      delayMs: 120,
      onItemDone: async () => {
        sinceSave++;
        if (sinceSave >= SAVE_EVERY) {
          sinceSave = 0;
          await persist();
          console.log(`[fetch-ability-names-ja] 中間保存: ${Object.keys(data).length}/${allIds.length}件`);
        }
      },
    }
  );

  await persist();
  console.log(`[fetch-ability-names-ja] 完了: ${Object.keys(data).length}/${allIds.length}件 (未対応: ${unmatched.size}件)`);
  if (unmatched.size > 0) {
    console.warn(`[fetch-ability-names-ja] 未対応id一覧: ${[...unmatched].sort().join(", ")}`);
  }
}

main();
