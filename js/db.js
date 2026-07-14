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
      // 将来のマイグレーション（テラス解禁・レギュ変更等）は e.oldVersion で分岐して追記する
      if (e.oldVersion < 1) {
        const builds = db.createObjectStore("builds", { keyPath: "id" });
        builds.createIndex("speciesId", "speciesId", { unique: false });
        builds.createIndex("teamId", "teamId", { unique: false });
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

function validateImport(payload) {
  if (!payload || payload.app !== "pkmn-build-lab" || !payload.data) {
    throw new Error("インポートファイルの形式が不正です");
  }
  if (payload.schemaVersion > SCHEMA_VERSION) {
    throw new Error("より新しいバージョンのデータです。アプリを更新してください");
  }
  for (const name of STORES) {
    if (payload.data[name] != null && !Array.isArray(payload.data[name])) {
      throw new Error(`${name} が配列ではありません`);
    }
  }
}

function isImportedNewer(imported, current) {
  if (!current) return true;
  const importedTime = Date.parse(imported.updatedAt || "") || 0;
  const currentTime = Date.parse(current.updatedAt || "") || 0;
  return importedTime > currentTime;
}

// 全ストアを1トランザクションでクリアする（全データ削除）。
export async function clearAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, "readwrite");
    for (const name of STORES) tx.objectStore(name).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// 全ストアを1トランザクションで差分マージする。
// 途中で1件でも失敗した場合はトランザクション全体がロールバックされる。
export async function importAll(payload) {
  validateImport(payload);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, "readwrite");
    let aborted = false;
    for (const name of STORES) {
      if (aborted) break; // abort後にtx.objectStore()を呼ぶと「トランザクション終了済み」例外になるため、外側のループも止める
      const store = tx.objectStore(name);
      for (const row of payload.data[name] ?? []) {
        const key = row.id ?? row.key;
        if (key == null) {
          tx.abort();
          aborted = true;
          break;
        }
        const req = store.get(key);
        req.onsuccess = () => {
          if (isImportedNewer(row, req.result)) store.put(row);
        };
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("インポートを中止し、変更をロールバックしました"));
  });
}
