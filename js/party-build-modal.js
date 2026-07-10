// build編集モーダル（基本情報：ニックネーム/特性/性格/持ち物/SP/タグ/苦手なポケモン/メモ）。技編集は3.4で追加する。
import { put } from "./db.js";
import { NATURES, STAT_KEYS, SP_MAX_PER_STAT, SP_MAX_TOTAL, validateStatPoints, calcAllStats } from "./models.js";
import { escapeHtml } from "./utils.js";
import { openSpeciesPicker } from "./species-picker.js";
import { getPokedex } from "./static-data.js";
import { typeJa } from "./type-names.js";

let dialogEl = null;
let currentCancelHandler = null;

const STAT_LABELS = { hp: "HP", atk: "こうげき", def: "ぼうぎょ", spa: "とくこう", spd: "とくぼう", spe: "すばやさ" };

function ensureDialog() {
  if (!dialogEl) {
    dialogEl = document.createElement("dialog");
    dialogEl.className = "modal";
    document.body.appendChild(dialogEl);
  }
  return dialogEl;
}

function displayTypes(speciesData) {
  if (!speciesData) return [];
  if (speciesData.typesJa) return speciesData.typesJa;
  return (speciesData.types ?? []).map(typeJa);
}

function abilityOptionsHtml(speciesData, selected) {
  const slots = ["0", "1", "H"];
  const seen = new Set();
  const options = ['<option value="">未設定</option>'];
  for (const slot of slots) {
    const en = speciesData?.abilities?.[slot];
    if (!en || seen.has(en)) continue;
    seen.add(en);
    const ja = speciesData?.abilitiesJa?.[slot] ?? en;
    options.push(`<option value="${escapeHtml(en)}" ${selected === en ? "selected" : ""}>${escapeHtml(ja)}</option>`);
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

function spInputsHtml(statPoints) {
  return STAT_KEYS.map((key) => {
    const value = statPoints ? statPoints[key] : "";
    return `
      <div class="field">
        <label for="sp-${key}">${STAT_LABELS[key]}</label>
        <input class="input" id="sp-${key}" type="number" inputmode="numeric" min="0" max="${SP_MAX_PER_STAT}" step="1" value="${value ?? ""}">
      </div>`;
  }).join("");
}

function statsPreviewHtml(stats) {
  return STAT_KEYS.map((key) => `<div>${STAT_LABELS[key]}: ${stats ? stats[key] : "未設定"}</div>`).join("");
}

function tagsChipsHtml(tags) {
  return tags
    .map((t, i) => `<span class="tag-chip">${escapeHtml(t)}<button type="button" class="btn-remove-tag" data-index="${i}">×</button></span>`)
    .join("");
}

function weakAgainstChipsHtml(weakAgainst, pokedex) {
  return weakAgainst
    .map((id, i) => {
      const entry = pokedex[id];
      const label = entry ? entry.nameJa ?? entry.name : id;
      return `<span class="tag-chip">${escapeHtml(label)}<button type="button" class="btn-remove-weak" data-index="${i}">×</button></span>`;
    })
    .join("");
}

// statPointsを6入力から読み取る。全空欄はnull(未設定)、一部のみ入力は許可しない(partial: true)。
function readSpInputs(dialog) {
  const raw = STAT_KEYS.map((key) => dialog.querySelector(`#sp-${key}`).value.trim());
  const filledCount = raw.filter((v) => v !== "").length;
  if (filledCount === 0) return { statPoints: null, partial: false, raw };
  if (filledCount < STAT_KEYS.length) return { statPoints: null, partial: true, raw };
  const statPoints = {};
  STAT_KEYS.forEach((key, i) => {
    statPoints[key] = Number(raw[i]);
  });
  return { statPoints, partial: false, raw };
}

// 未保存変更の判定に使う現在の編集内容スナップショット。
function collectState(dialog, tags, weakAgainst) {
  const nickname = dialog.querySelector("#build-nickname").value.trim() || null;
  const ability = dialog.querySelector("#build-ability").value || null;
  const nature = dialog.querySelector("#build-nature").value || null;
  const item = dialog.querySelector("#build-item").value.trim() || null;
  const memo = dialog.querySelector("#build-memo").value.trim() || null;
  const { statPoints } = readSpInputs(dialog);
  return { nickname, ability, nature, item, memo, statPoints, tags: [...tags], weakAgainst: [...weakAgainst] };
}

// build編集モーダルを開く。保存されたらtrue、保存せず閉じられたらfalseで解決するPromiseを返す。
export function openBuildEditModal(build, speciesData) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    getPokedex()
      .then((pokedex) => renderModal(pokedex))
      .catch((err) => {
        console.error("[party-build-modal] 図鑑データ読込失敗", err);
        alert("図鑑データの読込に失敗しました");
        finish(false);
      });

    function renderModal(pokedex) {
      const dialog = ensureDialog();
      let tags = [...(build.tags ?? [])];
      let weakAgainst = [...(build.weakAgainst ?? [])];
      const speciesName = speciesData?.nameJa ?? speciesData?.name ?? build.speciesId;

      dialog.innerHTML = `
        <form method="dialog" novalidate>
          <div class="modal-header">${escapeHtml(speciesName)}を編集</div>
          <div class="modal-body">
            <div class="field">
              <label>タイプ</label>
              <div class="pokemon-card__types">
                ${displayTypes(speciesData)
                  .map((t) => `<span class="type-badge">${escapeHtml(t)}</span>`)
                  .join("")}
              </div>
            </div>
            <div class="field">
              <label for="build-nickname">ニックネーム（任意）</label>
              <input class="input" id="build-nickname" type="text" maxlength="12" value="${escapeHtml(build.nickname ?? "")}" placeholder="未入力可">
            </div>
            <div class="field">
              <label for="build-ability">特性</label>
              <select class="select" id="build-ability">${abilityOptionsHtml(speciesData, build.ability)}</select>
            </div>
            <div class="field">
              <label for="build-nature">性格</label>
              <select class="select" id="build-nature">${natureOptionsHtml(build.nature)}</select>
            </div>
            <div class="field">
              <label for="build-item">持ち物</label>
              <input class="input" id="build-item" type="text" value="${escapeHtml(build.item ?? "")}" placeholder="未入力可">
            </div>
            <div class="field">
              <label>ステータスポイント（各0〜${SP_MAX_PER_STAT}・合計0〜${SP_MAX_TOTAL}）</label>
              <div class="sp-input-grid">${spInputsHtml(build.statPoints)}</div>
              <div class="sp-total" id="sp-total"></div>
              <div id="sp-errors"></div>
            </div>
            <div class="field">
              <label>実数値（プレビュー）</label>
              <div class="stat-grid" id="stats-preview"></div>
            </div>
            <div class="field">
              <label for="tag-input">タグ</label>
              <div class="tag-input">
                <input class="input" id="tag-input" type="text" maxlength="20" placeholder="タグを入力">
                <button type="button" class="btn" id="btn-add-tag">追加</button>
              </div>
              <div class="tag-list" id="tag-list"></div>
            </div>
            <div class="field">
              <label>苦手なポケモン</label>
              <button type="button" class="btn" id="btn-add-weak">＋追加</button>
              <div class="tag-list" id="weak-list"></div>
            </div>
            <div class="field">
              <label for="build-memo">メモ</label>
              <textarea class="textarea" id="build-memo" rows="3" placeholder="未入力可">${escapeHtml(build.memo ?? "")}</textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="btn-cancel">キャンセル</button>
            <button type="submit" class="btn btn-primary" id="btn-save">保存</button>
          </div>
        </form>
      `;

      const form = dialog.querySelector("form");
      const tagInput = dialog.querySelector("#tag-input");
      const tagListEl = dialog.querySelector("#tag-list");
      const weakListEl = dialog.querySelector("#weak-list");

      function renderTags() {
        tagListEl.innerHTML = tagsChipsHtml(tags);
      }
      function renderWeak() {
        weakListEl.innerHTML = weakAgainstChipsHtml(weakAgainst, pokedex);
      }
      renderTags();
      renderWeak();

      const initialSnapshot = JSON.stringify(collectState(dialog, tags, weakAgainst));

      function updatePreview() {
        const { statPoints, partial, raw } = readSpInputs(dialog);
        const total = raw.reduce((sum, v) => sum + (v === "" ? 0 : Number(v) || 0), 0);
        const totalEl = dialog.querySelector("#sp-total");
        totalEl.textContent = `合計: ${total} / ${SP_MAX_TOTAL}`;
        totalEl.classList.toggle("is-over", total > SP_MAX_TOTAL);

        const errors = partial
          ? ["ステータスポイントは6つすべてに入力するか、すべて未入力にしてください"]
          : validateStatPoints(statPoints).errors;
        dialog.querySelector("#sp-errors").innerHTML = errors
          .map((msg) => `<div class="field-error">${escapeHtml(msg)}</div>`)
          .join("");

        const nature = dialog.querySelector("#build-nature").value || null;
        const stats = statPoints ? calcAllStats(speciesData?.baseStats, statPoints, nature) : null;
        dialog.querySelector("#stats-preview").innerHTML = statsPreviewHtml(stats);

        dialog.querySelector("#btn-save").disabled = errors.length > 0;
      }

      STAT_KEYS.forEach((key) => {
        dialog.querySelector(`#sp-${key}`).addEventListener("input", updatePreview);
      });
      dialog.querySelector("#build-nature").addEventListener("change", updatePreview);
      updatePreview();

      dialog.querySelector("#btn-add-tag").addEventListener("click", () => {
        const value = tagInput.value.trim();
        if (!value) return;
        tags.push(value);
        tagInput.value = "";
        renderTags();
      });
      tagInput.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        dialog.querySelector("#btn-add-tag").click();
      });
      tagListEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-index]");
        if (!btn) return;
        tags.splice(Number(btn.dataset.index), 1);
        renderTags();
      });

      dialog.querySelector("#btn-add-weak").addEventListener("click", async () => {
        const result = await openSpeciesPicker({ mode: "multi", initialSelectedIds: weakAgainst });
        if (result === null) return;
        weakAgainst = result;
        renderWeak();
      });
      weakListEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-index]");
        if (!btn) return;
        weakAgainst.splice(Number(btn.dataset.index), 1);
        renderWeak();
      });

      function confirmDiscardIfDirty() {
        const current = JSON.stringify(collectState(dialog, tags, weakAgainst));
        if (current === initialSnapshot) return true;
        return confirm("編集内容を保存せずに閉じます。よろしいですか？");
      }

      dialog.querySelector("#btn-cancel").addEventListener("click", () => {
        if (!confirmDiscardIfDirty()) return;
        dialog.close();
      });

      // dialogEl(シングルトン)は開くたびにinnerHTMLを差し替えて再利用するため、
      // "cancel"イベントリスナーは前回分を明示的に外してから貼り直す(貼りっぱなしだと前回のクロージャが重複発火する)。
      if (currentCancelHandler) dialog.removeEventListener("cancel", currentCancelHandler);
      currentCancelHandler = (e) => {
        if (!confirmDiscardIfDirty()) e.preventDefault();
      };
      dialog.addEventListener("cancel", currentCancelHandler);

      dialog.addEventListener("close", () => finish(false), { once: true });

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const { statPoints, partial } = readSpInputs(dialog);
        if (partial || !validateStatPoints(statPoints).valid) return;
        const updated = {
          ...build,
          nickname: dialog.querySelector("#build-nickname").value.trim() || null,
          ability: dialog.querySelector("#build-ability").value || null,
          nature: dialog.querySelector("#build-nature").value || null,
          item: dialog.querySelector("#build-item").value.trim() || null,
          statPoints,
          tags: [...tags],
          weakAgainst: [...weakAgainst],
          memo: dialog.querySelector("#build-memo").value.trim() || null,
          updatedAt: new Date().toISOString(),
        };
        await put("builds", updated);
        finish(true);
        dialog.close();
      });

      dialog.showModal();
    }
  });
}
