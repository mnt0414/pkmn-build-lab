// data/dist/{pokedex,moves,learnsets}.json の取得結果をモジュールスコープでキャッシュする。
// db.js の openDB() と同じパターン: Promiseをキャッシュし、失敗時はキャッシュを捨てて再試行可能にする。

let pokedexPromise = null;
let movesPromise = null;
let learnsetsPromise = null;

async function fetchEnvelopeData(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} の取得に失敗しました（status: ${res.status}）`);
  const json = await res.json();
  return json.data;
}

export async function getPokedex() {
  if (!pokedexPromise) {
    pokedexPromise = fetchEnvelopeData("data/dist/pokedex.json").catch((err) => {
      pokedexPromise = null;
      throw err;
    });
  }
  return pokedexPromise;
}

export async function getMoves() {
  if (!movesPromise) {
    movesPromise = fetchEnvelopeData("data/dist/moves.json").catch((err) => {
      movesPromise = null;
      throw err;
    });
  }
  return movesPromise;
}

export async function getLearnsets() {
  if (!learnsetsPromise) {
    learnsetsPromise = fetchEnvelopeData("data/dist/learnsets.json").catch((err) => {
      learnsetsPromise = null;
      throw err;
    });
  }
  return learnsetsPromise;
}
