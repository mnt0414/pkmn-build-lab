// 「＋ポケモンを追加」ダイアログ。今回は種族選択による新規build作成のみ（他構築からの呼び出しは3.6で追加）。
import { createBuild } from "./models.js";
import { put } from "./db.js";
import { openSpeciesPicker } from "./species-picker.js";
import { getPokedex } from "./static-data.js";
import { placeBuildInTeam } from "./party-logic.js";

let dialogEl = null;

function ensureDialog() {
  if (!dialogEl) {
    dialogEl = document.createElement("dialog");
    dialogEl.className = "modal";
    document.body.appendChild(dialogEl);
  }
  return dialogEl;
}

// team: 追加先の構築。onSaved({ team, build, placement }) を呼ぶ。
export function openPartyAddDialog({ team, onSaved }) {
  const dialog = ensureDialog();
  let selectedSpeciesId = null;

  dialog.innerHTML = `
    <form method="dialog" novalidate>
      <div class="modal-header">ポケモンを追加</div>
      <div class="modal-body">
        <div class="field">
          <label>種族</label>
          <button type="button" class="btn" id="btn-pick-species">種族を検索して選択</button>
        </div>
        <div class="field">
          <label for="build-nickname">ニックネーム（任意）</label>
          <input class="input" id="build-nickname" type="text" maxlength="12" placeholder="未入力可">
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="btn-cancel">キャンセル</button>
        <button type="submit" class="btn btn-primary" id="btn-save" disabled>追加</button>
      </div>
    </form>
  `;

  const pickBtn = dialog.querySelector("#btn-pick-species");
  const saveBtn = dialog.querySelector("#btn-save");
  const nicknameInput = dialog.querySelector("#build-nickname");
  const form = dialog.querySelector("form");

  dialog.querySelector("#btn-cancel").addEventListener("click", () => dialog.close());

  pickBtn.addEventListener("click", async () => {
    const speciesId = await openSpeciesPicker();
    if (!speciesId) return;
    let label = speciesId;
    try {
      const pokedex = await getPokedex();
      const entry = pokedex[speciesId];
      if (entry) label = entry.nameJa ?? entry.name;
    } catch (err) {
      console.error("[party-add-dialog] 図鑑データ読込失敗", err);
    }
    selectedSpeciesId = speciesId;
    pickBtn.textContent = label; // textContentのためescapeHtml不要
    saveBtn.disabled = false;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedSpeciesId) return;
    const nickname = nicknameInput.value.trim();
    const build = createBuild({
      speciesId: selectedSpeciesId,
      teamId: team.id,
      nickname: nickname || null,
    });
    const { team: updatedTeam, placement } = placeBuildInTeam(team, build.id);
    const savedTeam = { ...updatedTeam, updatedAt: new Date().toISOString() };
    await put("builds", build);
    await put("teams", savedTeam);
    dialog.close();
    onSaved?.({ team: savedTeam, build, placement });
  });

  dialog.showModal();
}
