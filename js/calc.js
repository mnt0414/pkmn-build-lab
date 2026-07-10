// ダメージ計算画面。
// Phase 5でBATTLEREC（mnt0414/pkmn-buttledata）の@smogon/calcベース実装をコピーして統合する。
// 注意: ダメ計のバグを修正した場合はBATTLEREC側にも反映すること（要件定義書3.2参照）。
export async function renderCalc(el) {
  el.innerHTML = `
    <section class="card">
      <h2>ダメージ計算</h2>
      <p class="placeholder">TODO(Phase 5): BATTLERECから流用。パーティ・仮想敵からの呼び出しに対応</p>
    </section>
  `;
}
