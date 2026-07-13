// 設定・クレジット画面
import { CONFIG } from "./config.js";
import { exportAll, importAll } from "./db.js";
import { applyTheme } from "./ui-state.js";
import { showToast } from "./toast.js";
import { showConfirmDialog } from "./confirm-dialog.js";

function downloadPayload(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

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
    downloadPayload(payload, `pkmn-build-lab-backup-${payload.exportedAt.slice(0, 10)}.json`);
  });

  el.querySelector("#input-import").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const backup = await exportAll();
      downloadPayload(backup, `pkmn-build-lab-before-import-${backup.exportedAt.slice(0, 10)}.json`);
      const ok = await showConfirmDialog({ message: "反映前バックアップを保存しました。差分を反映しますか？" });
      if (!ok) return;
      await importAll(JSON.parse(await file.text()));
      showToast("インポートが完了しました", { type: "success" });
      location.reload();
    } catch (err) {
      showToast(`インポートに失敗しました: ${err.message}`, { type: "error" });
    }
  });
}
