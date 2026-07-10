// 設定・クレジット画面
import { CONFIG } from "./config.js";
import { exportAll, importAll } from "./db.js";
import { applyTheme } from "./ui-state.js";

export async function renderSettings(el) {
  const c = CONFIG.links.credits;
  el.innerHTML = `
    <section class="card">
      <h2>テーマ</h2>
      <button class="btn" id="btn-theme-light">ライト</button>
      <button class="btn" id="btn-theme-dark">ダーク</button>
    </section>
    <section class="card">
      <h2>データ管理</h2>
      <button class="btn" id="btn-export">エクスポート</button>
      <label class="btn">インポート<input type="file" id="input-import" accept=".json,application/json" hidden></label>
      <p class="placeholder">TODO(Phase 6): アーカイブ一括管理・全データ削除</p>
    </section>
    <section class="card">
      <h2>クレジット</h2>
      <ul>
        <li>Data: <a href="${c.showdown}" target="_blank" rel="noopener">Pokémon Showdown</a> / <a href="${c.pkmnProject}" target="_blank" rel="noopener">@pkmn project</a>（MIT）</li>
        <li>Data verification: <a href="${c.pokeapi}" target="_blank" rel="noopener">PokeAPI</a></li>
        <li>Special thanks: <a href="${c.yakkun}" target="_blank" rel="noopener">ポケモン徹底攻略</a></li>
      </ul>
    </section>
  `;

  el.querySelector("#btn-theme-light").addEventListener("click", () => applyTheme("light"));
  el.querySelector("#btn-theme-dark").addEventListener("click", () => applyTheme("dark"));

  el.querySelector("#btn-export").addEventListener("click", async () => {
    const payload = await exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pkmn-build-lab-backup-${payload.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  el.querySelector("#input-import").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      await importAll(JSON.parse(await file.text()));
      alert("インポートが完了しました");
      location.reload();
    } catch (err) {
      alert(`インポートに失敗しました: ${err.message}`);
    }
  });
}
