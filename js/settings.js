// 設定・クレジット画面
import { CONFIG } from "./config.js";
import { exportAll, importAll, getAll, put, del, setArchived, clearAll } from "./db.js";
import { applyTheme } from "./ui-state.js";
import { showToast } from "./toast.js";
import { showConfirmDialog } from "./confirm-dialog.js";
import { escapeHtml } from "./utils.js";
import { groupArchivedItems } from "./settings-logic.js";
import { cascadeDeleteTeamBuildIds, removeBuildIdFromTeam } from "./party-logic.js";

const STORE_BY_TYPE = { build: "builds", team: "teams", enemyTeam: "enemyTeams" };

function downloadPayload(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function archivedItemHtml(item) {
  return `
    <li class="archived-item">
      <span>${escapeHtml(item.name)}</span>
      <span class="archived-item__actions">
        <button type="button" class="btn btn-ghost btn-restore-archived" data-type="${item.type}" data-id="${escapeHtml(item.id)}">復元</button>
        <button type="button" class="btn btn-danger btn-delete-archived" data-type="${item.type}" data-id="${escapeHtml(item.id)}">完全削除</button>
      </span>
    </li>
  `;
}

function archivedGroupHtml(title, items) {
  const body =
    items.length === 0
      ? `<p class="placeholder">アーカイブ済みの項目はありません</p>`
      : `<ul class="archived-list">${items.map(archivedItemHtml).join("")}</ul>`;
  return `<div class="archived-group"><h3>${escapeHtml(title)}</h3>${body}</div>`;
}

export async function renderSettings(el) {
  const c = CONFIG.links.credits;
  const [allBuilds, allTeams, allEnemyTeams] = await Promise.all([
    getAll("builds"),
    getAll("teams"),
    getAll("enemyTeams"),
  ]);
  const grouped = groupArchivedItems(allBuilds, allTeams, allEnemyTeams);

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
    </section>
    <section class="card">
      <h2>アーカイブ済み管理</h2>
      ${archivedGroupHtml("構築", grouped.teams)}
      ${archivedGroupHtml("ポケモン", grouped.builds)}
      ${archivedGroupHtml("仮想敵構築", grouped.enemyTeams)}
    </section>
    <section class="card">
      <h2>全データ削除</h2>
      <p class="placeholder">構築・ポケモン・仮想敵データをすべて削除します。エクスポートでのバックアップを推奨します。</p>
      <button class="btn btn-danger" id="btn-clear-all">全データ削除</button>
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

  el.querySelectorAll(".btn-restore-archived").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { type, id } = btn.dataset;
      await setArchived(STORE_BY_TYPE[type], id, false);
      showToast("復元しました", { type: "success" });
      renderSettings(el);
    });
  });

  el.querySelectorAll(".btn-delete-archived").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { type, id } = btn.dataset;

      if (type === "team") {
        const team = allTeams.find((t) => t.id === id);
        if (!team) return;
        const buildIds = cascadeDeleteTeamBuildIds(allBuilds, team.id);
        const ok = await showConfirmDialog({
          message: `この構築を完全に削除します。所属する構築メンバー${buildIds.length}件も同時に削除されます。この操作は取り消せません。よろしいですか？`,
          danger: true,
        });
        if (!ok) return;
        for (const buildId of buildIds) await del("builds", buildId);
        await del("teams", team.id);
      } else if (type === "build") {
        const build = allBuilds.find((b) => b.id === id);
        if (!build) return;
        const ok = await showConfirmDialog({
          message: "このポケモンを完全に削除します。この操作は取り消せません。よろしいですか？",
          danger: true,
        });
        if (!ok) return;
        const owningTeam = allTeams.find((t) => t.id === build.teamId);
        if (owningTeam) {
          const updatedTeam = removeBuildIdFromTeam(owningTeam, build.id);
          await put("teams", { ...updatedTeam, updatedAt: new Date().toISOString() });
        }
        await del("builds", build.id);
      } else {
        const ok = await showConfirmDialog({
          message: "この仮想敵構築を完全に削除します。この操作は取り消せません。よろしいですか？",
          danger: true,
        });
        if (!ok) return;
        await del("enemyTeams", id);
      }

      showToast("完全に削除しました", { type: "success" });
      renderSettings(el);
    });
  });

  el.querySelector("#btn-clear-all").addEventListener("click", async () => {
    const ok = await showConfirmDialog({
      title: "全データ削除",
      message:
        "すべての構築・ポケモン・仮想敵データを完全に削除します。この操作は取り消せません。事前にエクスポートでバックアップを取ることを強く推奨します。よろしいですか？",
      danger: true,
    });
    if (!ok) return;
    await clearAll();
    showToast("全データを削除しました", { type: "success" });
    location.reload();
  });
}
