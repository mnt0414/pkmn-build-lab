// IndexedDBラッパー。本データはすべてここを経由する（UI状態のみlocalStorage可）。
const DB_NAME = "pkmn-build-lab";
export const SCHEMA_VERSION = 1;

const STORES = ["builds", "teams", "enemyTeams", "meta"];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      // 将来のマイグレーション（テラス解禁・ダブル対応等）は e.oldVersion で分岐して追記する
      if (e.oldVersion < 1) {
        const builds = db.createObjectStore("builds", { keyPath: "id" });
        builds.createIndex("speciesId", "speciesId", { unique: false });
        db.createObjectStore("teams", { keyPath: "id" });
        db.createObjectStore("enemyTeams", { keyPath: "id" });
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null; // 失敗を永続キャッシュしない（次回呼び出しで再試行）
      reject(req.error);
    };
  });
  return dbPromise;
}

async function withStore(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const put = (store, value) => withStore(store, "readwrite", (s) => s.put(value));
export const del = (store, id) => withStore(store, "readwrite", (s) => s.delete(id));
export const get = (store, id) => withStore(store, "readonly", (s) => s.get(id));
export const getAll = (store) => withStore(store, "readonly", (s) => s.getAll());

export async function setArchived(store, id, archived = true) {
  const row = await get(store, id);
  if (!row) throw new Error(`${store}にid=${id}のレコードが見つかりません`);
  const updated = { ...row, archived, updatedAt: new Date().toISOString() };
  await put(store, updated);
  return updated;
}

export async function exportAll() {
  const data = {};
  for (const name of STORES) data[name] = await getAll(name);
  return {
    app: "pkmn-build-lab",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export async function importAll(payload) {
  if (!payload || payload.app !== "pkmn-build-lab") {
    throw new Error("インポートファイルの形式が不正です");
  }
  if (payload.schemaVersion > SCHEMA_VERSION) {
    throw new Error("より新しいバージョンのデータです。アプリを更新してください");
  }
  for (const name of STORES) {
    const rows = payload.data?.[name] ?? [];
    await withStore(name, "readwrite", (s) => {
      s.clear();
      for (const row of rows) s.put(row);
      return null;
    });
  }
}
