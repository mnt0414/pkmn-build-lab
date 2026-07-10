// 構築(team)管理モーダル（ネイティブdialog要素）。作成・名称変更・アーカイブ切替・完全削除を提供する。
import { createTeam } from "./models.js";
import { put, del, setArchived, getAll } from "./db.js";
import { escapeHtml } from "./utils.js";
import {
  cascadeDeleteTeamBuildIds,
  defaultFormatForNewTeam,
  nextSortOrder,
  duplicateTeam,
} from "./party-logic.js";

let dialogEl = null;

function ensureDialog() {
  if (!dialogEl) {
    dialogEl = document.createElement("dialog");
    dialogEl.className = "modal";
    document.body.appendChild(dialogEl);
  }
  return dialogEl;
}

function formatOptionsHtml(selected) {
  return `
    <option value="single" ${selected === "single" ? "selected" : ""}>シングル</option>
    <option value="double" ${selected === "double" ? "selected" : ""}>ダブル</option>
  `;
}

// mode: "create" | "edit"
// teams: sortOrder算出・対戦形式初期値算出に使う全team一覧（アーカイブ済み含む）
export function openTeamModal({ mode, team = null, teams = [], onSaved, onDeleted, onDuplicated }) {
  const dialog = ensureDialog();
  const isCreate = mode === "create";
  const initialFormat = isCreate ? defaultFormatForNewTeam(teams) : team.battleFormat;

  dialog.innerHTML = `
    <form method="dialog" novalidate>
      <div class="modal-header">${isCreate ? "新しい構築を作成" : "構築を編集"}</div>
      <div class="modal-body">
        <div class="field">
          <label for="team-name">構築名</label>
          <input class="input" id="team-name" type="text" value="${escapeHtml(isCreate ? "" : team.name)}" placeholder="新しい構築">
        </div>
        <div class="field">
          <label for="team-format">対戦形式</label>
          <select class="select" id="team-format">${formatOptionsHtml(initialFormat)}</select>
        </div>
        <div class="field">
          <label for="team-regulation">レギュレーション</label>
          <input class="input" id="team-regulation" type="text" value="${escapeHtml(isCreate ? "" : team.regulation)}" placeholder="例: レギュレーションH">
        </div>
        ${
          isCreate
            ? ""
            : `
        <div class="field">
          <label>複製</label>
          <button type="button" class="btn" id="btn-duplicate">この構築を複製</button>
        </div>
        <div class="field">
          <label>アーカイブ</label>
          <button type="button" class="btn" id="btn-archive">${team.archived ? "アーカイブを解除" : "アーカイブする"}</button>
        </div>
        <div class="field">
          <label>完全削除</label>
          <button type="button" class="btn btn-danger" id="btn-delete">この構築を完全削除</button>
        </div>`
        }
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="team-btn-cancel">キャンセル</button>
        <button type="submit" class="btn btn-primary" id="team-btn-save">保存</button>
      </div>
    </form>
  `;

  const form = dialog.querySelector("form");
  const nameInput = dialog.querySelector("#team-name");
  const formatSelect = dialog.querySelector("#team-format");
  const regulationInput = dialog.querySelector("#team-regulation");

  dialog.querySelector("#team-btn-cancel").addEventListener("click", () => dialog.close());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const regulation = regulationInput.value.trim();
    if (!regulation) {
      alert("レギュレーションを入力してください");
      regulationInput.focus();
      return;
    }
    const name = nameInput.value.trim() || "新しい構築";
    const battleFormat = formatSelect.value;
    const saved = isCreate
      ? createTeam({ name, battleFormat, regulation, sortOrder: nextSortOrder(teams) })
      : { ...team, name, battleFormat, regulation, updatedAt: new Date().toISOString() };
    await put("teams", saved);
    dialog.close();
    onSaved?.(saved);
  });

  if (!isCreate) {
    dialog.querySelector("#btn-duplicate").addEventListener("click", async () => {
      const allBuilds = await getAll("builds");
      const memberIds = new Set([...team.selectedBuildIds, ...team.poolBuildIds]);
      const sourceBuilds = allBuilds.filter((b) => memberIds.has(b.id));
      const { newTeam, newBuilds } = duplicateTeam(team, sourceBuilds, teams);
      for (const build of newBuilds) await put("builds", build);
      await put("teams", newTeam);
      dialog.close();
      onDuplicated?.(newTeam);
    });

    dialog.querySelector("#btn-archive").addEventListener("click", async () => {
      const updated = await setArchived("teams", team.id, !team.archived);
      dialog.close();
      onSaved?.(updated);
    });

    dialog.querySelector("#btn-delete").addEventListener("click", async () => {
      const builds = await getAll("builds");
      const buildIds = cascadeDeleteTeamBuildIds(builds, team.id);
      const ok = confirm(
        `この構築を完全に削除します。所属する構築メンバー${buildIds.length}件も同時に削除されます。この操作は取り消せません。よろしいですか？`
      );
      if (!ok) return;
      for (const id of buildIds) await del("builds", id);
      await del("teams", team.id);
      dialog.close();
      onDeleted?.(team.id);
    });
  }

  dialog.showModal();
}
