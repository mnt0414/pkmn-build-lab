// PokeAPI(静的ミラー優先・ライブAPIフォールバック)から日本語名を取得するための共通処理。
// scripts/fetch-move-names-ja.mjs / scripts/fetch-ability-names-ja.mjs で共有する。
import { toId } from "./to-id.mjs";

const RETRY_BASE_MS = 300;

// 指数バックオフ付きfetch。retries回リトライ後も失敗したら例外を投げる。
export async function fetchJson(url, { timeoutMs = 10000, retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * 2 ** attempt));
      }
    }
  }
  throw lastErr;
}

// PokeAPIのnames配列からja優先・ja-hrktフォールバックで日本語名を取り出す。
export function pickJaName(names) {
  if (!Array.isArray(names)) return null;
  const ja = names.find((n) => n.language?.name === "ja");
  if (ja) return ja.name;
  const jaHrkt = names.find((n) => n.language?.name === "ja-hrkt");
  return jaHrkt ? jaHrkt.name : null;
}

// 静的ミラーのindex.json(失敗時はライブAPI)からリソース一覧を取得し、
// toId(スラッグ) -> { slug, numericId } のMapを作る。
export async function fetchSlugMap(resource) {
  const staticUrl = `https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2/${resource}/index.json`;
  const liveUrl = `https://pokeapi.co/api/v2/${resource}?limit=2000`;

  let results;
  try {
    results = (await fetchJson(staticUrl, { retries: 1 })).results;
  } catch {
    console.warn(`[pokeapi-ja] 静的ミラーの${resource}一覧取得に失敗、ライブAPIにフォールバック`);
    results = (await fetchJson(liveUrl, { retries: 2 })).results;
  }

  const map = new Map();
  for (const { name: slug, url } of results) {
    const m = url.match(/\/(\d+)\/?$/);
    if (!m) continue;
    map.set(toId(slug), { slug, numericId: m[1] });
  }
  return map;
}

// 並行数concurrency・リクエスト間隔delayMsでidsを処理する(節度あるアクセスのため)。
export async function runWithConcurrency(ids, worker, { concurrency = 4, delayMs = 120, onItemDone } = {}) {
  const queue = [...ids];
  async function runner() {
    while (queue.length > 0) {
      const id = queue.shift();
      await worker(id);
      if (onItemDone) await onItemDone(id);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
}
