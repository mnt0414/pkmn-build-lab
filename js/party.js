// パーティ編成画面（Phase 3で本実装）。現状は3エリアの骨格のみ。
import { getAll } from "./db.js";

export async function renderParty(el) {
  const builds = await getAll("builds");
  el.innerHTML = `
    <section class="card">
      <h2>選出6匹</h2>
      <p class="placeholder">TODO(Phase 3): タイプ・実数値（性格・努力値反映）・技4つ＋技タイプ表示</p>
    </section>
    <section class="card">
      <h2>候補ポケモン（${builds.length}件）</h2>
      <p class="placeholder">TODO(Phase 3): 検索（名前・ニックネーム・タグ）・アーカイブ・learnset技フィルタ</p>
    </section>
    <section class="card">
      <h2>素早さ比較</h2>
      <p class="placeholder">TODO(Phase 4): 仮想敵反映・スカーフ自動反映・おいかぜトグル・全選択／全解除</p>
    </section>
  `;
}
