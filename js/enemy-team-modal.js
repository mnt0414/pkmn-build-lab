// ユーザー仮想敵構築の登録・編集モーダル（Phase 4.1）。
// スコープ方針: この画面は「仮想敵のメモ」であり、自分のbuild編集ほどリッチにしない。
// 必須項目はポケモン名(speciesId)のみ。特性・技は自由入力+datalistサジェスト（learnset厳密フィルタはしない）。
import { put } from "./db.js";
import {
  NATURES,
  STAT_KEYS,
  SP_MAX_PER_STAT,
  SP_MAX_TOTAL,
  validateStatPoints,
  createEnemyPokemon,
  createEnemyTeam,
} from "./models.js";
import { escapeHtml, safeHttpsUrl } from "./utils.js";
import { CONFIG } from "./config.js";
import { openSpeciesPicker } from "./species-picker.js";
import { getPokedex, getMoves, getLearnsets } from "./static-data.js";
import { showToast } from "./toast.js";
import { showConfirmDialog } from "./confirm-dialog.js";

const POKEMON_SLOT_COUNT = 6;
const MOVE_SLOT_COUNT = 4;
const STAT_LABELS = { hp: "HP", atk: "こうげき", def: "ぼうぎょ", spa: "とくこう", spd: "とくぼう", spe: "すばやさ" };

let dialogEl = null;
let currentCancelHandler = null;

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

// レギュレーションは任意項目のため先頭に「未設定」(value="")を用意する。
// selectedがCONFIG.regulationsに存在しない値（自由入力時代の旧データ）の場合、
// 「(旧値: ○○)」optionを末尾に追加し選択状態にする。選び直さない限り保存時もそのまま維持される。
function regulationOptionsHtml(selected) {
  const value = selected ?? "";
  const options = [`<option value="" ${value === "" ? "selected" : ""}>未設定</option>`];
  for (const r of CONFIG.regulations) {
    options.push(`<option value="${escapeHtml(r.id)}" ${value === r.id ? "selected" : ""}>${escapeHtml(r.label)}</option>`);
  }
  const isKnown = value === "" || CONFIG.regulations.some((r) => r.id === value);
  if (!isKnown) {
    options.push(`<option value="${escapeHtml(value)}" selected>(旧値: ${escapeHtml(value)})</option>`);
  }
  return options.join("");
}

function natureOptionsHtml(selected) {
  const options = ['<option value="">未設定</option>'];
  for (const name of Object.keys(NATURES)) {
    options.push(`<option value="${escapeHtml(name)}" ${selected === name ? "selected" : ""}>${escapeHtml(name)}</option>`);
  }
  return options.join("");
}

// 特性のサジェスト（種族データの3枠：通常0/1・夢特性H）。自由入力を妨げないためselectではなくdatalistで提供する。
function abilityDatalistOptions(speciesData) {
  if (!speciesData?.abilities) return "";
  const seen = new Set();
  const opts = [];
  for (const slot of ["0", "1", "H"]) {
    const en = speciesData.abilities[slot];
    if (!en || seen.has(en)) continue;
    seen.add(en);
    const ja = speciesData.abilitiesJa?.[slot] ?? en;
    opts.push(`<option value="${escapeHtml(ja)}"></option>`);
  }
  return opts.join("");
}

// 技のサジェスト（種族選択済みの場合のみlearnsetから提示。手入力強行も常に許可する）。
function moveDatalistOptions(speciesId, learnsetsData, movesData) {
  const ids = speciesId ? learnsetsData[speciesId] ?? [] : [];
  return ids
    .map((id) => {
      const m = movesData[id];
      const label = m ? m.nameJa ?? m.name : id;
      return `<option value="${escapeHtml(label)}"></option>`;
    })
    .join("");
}

function spInputsHtml(statPoints, index) {
  return STAT_KEYS.map((key) => {
    const value = statPoints ? statPoints[key] : "";
    return `
      <div class="field">
        <label for="enemy-sp-${index}-${key}">${STAT_LABELS[key]}</label>
        <input class="input enemy-sp" id="enemy-sp-${index}-${key}" data-slot="${index}" type="number" inputmode="numeric" min="0" max="${SP_MAX_PER_STAT}" step="1" value="${value ?? ""}">
      </div>`;
  }).join("");
}

function moveInputsHtml(moves, index, movesDatalistOptions) {
  const inputs = Array.from({ length: MOVE_SLOT_COUNT }, (_, m) => {
    const value = moves?.[m] ?? "";
    return `<input class="input" id="enemy-move-${index}-${m}" list="enemy-move-list-${index}" type="text" value="${escapeHtml(value ?? "")}" placeholder="技${m + 1}（未入力可）">`;
  }).join("");
  return `${inputs}<datalist id="enemy-move-list-${index}">${movesDatalistOptions}</datalist>`;
}

function slotHtml(slot, index, pokedex, learnsetsData, movesData) {
  if (!slot.speciesId) {
    return `
      <div class="enemy-poke-slot" data-slot="${index}">
        <button type="button" class="btn slot-empty" data-action="pick" data-slot="${index}">＋ポケモンを選択（${index + 1}匹目）</button>
      </div>`;
  }
  const entry = pokedex[slot.speciesId];
  const speciesName = entry?.nameJa ?? entry?.name ?? slot.species ?? slot.speciesId;
  return `
    <div class="enemy-poke-slot" data-slot="${index}">
      <div class="enemy-poke-slot__header">
        <span class="pokemon-card__name">${escapeHtml(speciesName)}</span>
        <button type="button" class="btn btn-ghost" data-action="change" data-slot="${index}">変更</button>
        <button type="button" class="btn btn-ghost" data-action="clear" data-slot="${index}">解除</button>
      </div>
      <div class="field">
        <label for="enemy-ability-${index}">特性（任意）</label>
        <input class="input" id="enemy-ability-${index}" type="text" list="enemy-ability-list-${index}" value="${escapeHtml(slot.ability ?? "")}" placeholder="未入力可">
        <datalist id="enemy-ability-list-${index}">${abilityDatalistOptions(entry)}</datalist>
      </div>
      <div class="field">
        <label for="enemy-nature-${index}">性格（任意）</label>
        <select class="select" id="enemy-nature-${index}">${natureOptionsHtml(slot.nature)}</select>
      </div>
      <div class="field">
        <label for="enemy-item-${index}">持ち物（任意）</label>
        <input class="input" id="enemy-item-${index}" type="text" value="${escapeHtml(slot.item ?? "")}" placeholder="未入力可">
      </div>
      <div class="field">
        <label>ステータスポイント（任意・各0〜${SP_MAX_PER_STAT}・合計0〜${SP_MAX_TOTAL}）</label>
        <div class="sp-input-grid">${spInputsHtml(slot.statPoints, index)}</div>
        <div id="enemy-sp-errors-${index}"></div>
      </div>
      <div class="field">
        <label>技（任意・最大4）</label>
        <div class="enemy-move-grid">${moveInputsHtml(slot.moves, index, moveDatalistOptions(slot.speciesId, learnsetsData, movesData))}</div>
      </div>
    </div>`;
}

// mode: "create" | "edit"
export function openEnemyTeamModal({ mode, team = null, onSaved }) {
  const isCreate = mode === "create";

  Promise.all([getPokedex(), getMoves(), getLearnsets()])
    .then(([pokedex, movesData, learnsetsData]) => renderModal(pokedex, movesData, learnsetsData))
    .catch((err) => {
      console.error("[enemy-team-modal] データ読込失敗", err);
      showToast("データの読込に失敗しました", { type: "error" });
    });

  function renderModal(pokedex, movesData, learnsetsData) {
    const dialog = ensureDialog();
    let slots = Array.from({ length: POKEMON_SLOT_COUNT }, (_, i) => createEnemyPokemon(team?.pokemon?.[i] ?? {}));

    dialog.innerHTML = `
      <form method="dialog" novalidate>
        <div class="modal-header">${isCreate ? "仮想敵構築を追加" : "仮想敵構築を編集"}</div>
        <div class="modal-body">
          <div class="field">
            <label for="enemy-team-name">構築名</label>
            <input class="input" id="enemy-team-name" type="text" value="${escapeHtml(isCreate ? "" : team.name ?? "")}" placeholder="新しい仮想敵構築">
          </div>
          <div class="field">
            <label for="enemy-team-format">対戦形式</label>
            <select class="select" id="enemy-team-format">${formatOptionsHtml(isCreate ? "single" : team.battleFormat)}</select>
          </div>
          <div class="field">
            <label for="enemy-team-regulation">レギュレーション（任意）</label>
            <select class="select" id="enemy-team-regulation">${regulationOptionsHtml(isCreate ? "" : team.regulation)}</select>
          </div>
          <div class="field">
            <label for="enemy-team-url">出典URL（任意・https）</label>
            <input class="input" id="enemy-team-url" type="text" value="${escapeHtml(isCreate ? "" : team.sourceUrl ?? "")}" placeholder="https://...">
            <div class="field-error" id="enemy-url-error"></div>
          </div>
          <div class="field">
            <label>ポケモン（最大6匹・ポケモン名以外は任意）</label>
            <div id="enemy-poke-slots"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" id="enemy-team-btn-cancel">キャンセル</button>
          <button type="submit" class="btn btn-primary" id="enemy-team-btn-save">保存</button>
        </div>
      </form>
    `;

    const form = dialog.querySelector("form");
    const slotsEl = dialog.querySelector("#enemy-poke-slots");
    const urlInput = dialog.querySelector("#enemy-team-url");

    // statPointsを6入力から読み取る。全空欄はnull、一部のみ入力はpartial扱い（保存不可）。
    function readSpForSlot(index) {
      const raw = STAT_KEYS.map((key) => dialog.querySelector(`#enemy-sp-${index}-${key}`)?.value.trim() ?? "");
      const filledCount = raw.filter((v) => v !== "").length;
      if (filledCount === 0) return { statPoints: null, partial: false };
      if (filledCount < STAT_KEYS.length) return { statPoints: null, partial: true };
      const statPoints = {};
      STAT_KEYS.forEach((key, i) => {
        statPoints[key] = Number(raw[i]);
      });
      return { statPoints, partial: false };
    }

    // DOM上の現在値をslots配列へ反映する（種族変更・解除・保存・未保存確認の直前に呼ぶ）。
    // speciesId未設定のスロットは入力欄が描画されていないため読み取り対象外。
    function syncSlotsFromDom() {
      slots = slots.map((s, i) => {
        if (!s.speciesId) return s;
        const ability = dialog.querySelector(`#enemy-ability-${i}`)?.value.trim() || null;
        const nature = dialog.querySelector(`#enemy-nature-${i}`)?.value || null;
        const item = dialog.querySelector(`#enemy-item-${i}`)?.value.trim() || null;
        const { statPoints, partial } = readSpForSlot(i);
        const moves = Array.from({ length: MOVE_SLOT_COUNT }, (_, m) => dialog.querySelector(`#enemy-move-${i}-${m}`)?.value.trim() || null);
        return { ...s, ability, nature, item, statPoints: partial ? null : statPoints, moves };
      });
    }

    function renderSlots() {
      slotsEl.innerHTML = slots.map((s, i) => slotHtml(s, i, pokedex, learnsetsData, movesData)).join("");
      updateSaveButtonState();
    }

    function updateSaveButtonState() {
      const urlVal = urlInput.value.trim();
      const urlError = urlVal !== "" && !safeHttpsUrl(urlVal);
      dialog.querySelector("#enemy-url-error").textContent = urlError ? "https://で始まる有効なURLを入力してください" : "";

      let hasSpError = false;
      slots.forEach((s, i) => {
        const errEl = dialog.querySelector(`#enemy-sp-errors-${i}`);
        if (!errEl) return;
        const { statPoints, partial } = readSpForSlot(i);
        const errors = partial ? ["ステータスポイントは6つすべてに入力するか、すべて未入力にしてください"] : validateStatPoints(statPoints).errors;
        errEl.innerHTML = errors.map((msg) => `<div class="field-error">${escapeHtml(msg)}</div>`).join("");
        if (errors.length > 0) hasSpError = true;
      });

      dialog.querySelector("#enemy-team-btn-save").disabled = urlError || hasSpError;
    }

    renderSlots();

    slotsEl.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const index = Number(btn.dataset.slot);
      const action = btn.dataset.action;
      if (action === "clear") {
        syncSlotsFromDom();
        slots = slots.map((s, i) => (i === index ? createEnemyPokemon({}) : s));
        renderSlots();
        return;
      }
      // pick / change
      const picked = await openSpeciesPicker({ mode: "single" });
      if (!picked) return;
      syncSlotsFromDom();
      const entry = pokedex[picked];
      const speciesName = entry?.nameJa ?? entry?.name ?? picked;
      slots = slots.map((s, i) => (i === index ? { ...s, speciesId: picked, species: speciesName } : s));
      renderSlots();
    });

    slotsEl.addEventListener("input", (e) => {
      if (!e.target.classList.contains("enemy-sp")) return;
      updateSaveButtonState();
    });
    urlInput.addEventListener("input", updateSaveButtonState);

    function collectSnapshot() {
      syncSlotsFromDom();
      return JSON.stringify({
        name: dialog.querySelector("#enemy-team-name").value.trim(),
        battleFormat: dialog.querySelector("#enemy-team-format").value,
        regulation: dialog.querySelector("#enemy-team-regulation").value.trim(),
        sourceUrl: urlInput.value.trim(),
        slots,
      });
    }

    const initialSnapshot = collectSnapshot();

    async function confirmDiscardIfDirty() {
      if (collectSnapshot() === initialSnapshot) return true;
      return await showConfirmDialog({ message: "入力内容を保存せずに閉じます。よろしいですか？", danger: true });
    }

    dialog.querySelector("#enemy-team-btn-cancel").addEventListener("click", async () => {
      if (!(await confirmDiscardIfDirty())) return;
      dialog.close();
    });

    // dialogEl(シングルトン)は開くたびにinnerHTMLを差し替えて再利用するため、
    // "cancel"イベントリスナーは前回分を明示的に外してから貼り直す(party-build-modal.jsと同じ対策)。
    // cancel(Escキー等)はハンドラ内で同期的にpreventDefault()しないとネイティブクローズを止められないため、
    // 先にpreventDefault()してから非同期確認を行い、trueならdialog.close()を手動で呼ぶ。
    if (currentCancelHandler) dialog.removeEventListener("cancel", currentCancelHandler);
    currentCancelHandler = (e) => {
      e.preventDefault();
      confirmDiscardIfDirty().then((ok) => {
        if (ok) dialog.close();
      });
    };
    dialog.addEventListener("cancel", currentCancelHandler);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      syncSlotsFromDom();
      const urlVal = urlInput.value.trim();
      if (urlVal !== "" && !safeHttpsUrl(urlVal)) return;
      if (slots.some((s) => s.speciesId && readSpForSlot(slots.indexOf(s)).partial)) return;

      const pokemon = slots.filter((s) => s.speciesId);
      const name = dialog.querySelector("#enemy-team-name").value.trim() || "新しい仮想敵構築";
      const saved = createEnemyTeam({
        ...(isCreate ? {} : { id: team.id, registeredAt: team.registeredAt, isReflected: team.isReflected, archived: team.archived }),
        sourceType: "user",
        name,
        battleFormat: dialog.querySelector("#enemy-team-format").value,
        regulation: dialog.querySelector("#enemy-team-regulation").value.trim(),
        sourceUrl: urlVal,
        pokemon,
      });
      await put("enemyTeams", saved);
      dialog.close();
      onSaved?.(saved);
    });

    dialog.showModal();
  }
}
