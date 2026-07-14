// 種族検索ダイアログ。mode: "single"(デフォルト・単一選択) | "multi"(複数選択、3.3で苦手なポケモン用に追加)。
import { getPokedex } from "./static-data.js";
import { escapeHtml, searchPokemon } from "./utils.js";
import { spriteImgHtml } from "./pokemon-identity.js";
import { CONFIG } from "./config.js";

const MAX_RESULTS = 50;

let dialogEl = null;

function ensureDialog() {
  if (!dialogEl) {
    dialogEl = document.createElement("dialog");
    dialogEl.className = "modal";
    document.body.appendChild(dialogEl);
  }
  return dialogEl;
}

function displayName(entry) {
  return entry.nameJa ?? entry.name;
}

// ポケ轍・育成論ページへの送客リンク（要件3.4）。numが不正な場合は表示しない。
function theoryLinkHtml(num) {
  if (!Number.isInteger(num) || num <= 0) return "";
  const url = CONFIG.links.yakkunTheoryUrl(num);
  return `<a class="species-picker-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">育成論</a>`;
}

function renderSingleResults(matched) {
  return `<ul class="species-picker-list">${matched
    .map(
      (p) => `
      <li class="species-picker-row">
        <button type="button" class="btn species-picker-item" data-species-id="${escapeHtml(p.id)}">
          ${spriteImgHtml(p, { size: 40 })}
          <span>${escapeHtml(displayName(p))}</span>
          ${p.isNonstandard != null ? '<span class="badge-muted">(非標準)</span>' : ""}
        </button>
        ${theoryLinkHtml(p.num)}
      </li>`
    )
    .join("")}</ul>`;
}

function renderMultiResults(matched, selectedIds) {
  return `<ul class="species-picker-list">${matched
    .map((p) => {
      const checked = selectedIds.has(p.id) ? "checked" : "";
      return `
      <li>
        <label class="btn species-picker-item species-picker-item-multi">
          <input type="checkbox" data-species-id="${escapeHtml(p.id)}" ${checked}>
          ${spriteImgHtml(p, { size: 40 })}
          <span>${escapeHtml(displayName(p))}</span>
          ${p.isNonstandard != null ? '<span class="badge-muted">(非標準)</span>' : ""}
        </label>
      </li>`;
    })
    .join("")}</ul>`;
}

function renderResults(pokedex, query, mode, selectedIds) {
  const q = query.trim();
  if (!q) return '<p class="placeholder">検索してください</p>';
  const allMatched = searchPokemon(Object.values(pokedex), q);
  if (allMatched.length === 0) return '<p class="placeholder">該当するポケモンが見つかりません</p>';
  const matched = allMatched.slice(0, MAX_RESULTS);
  const remaining = allMatched.length - matched.length;
  const list = mode === "multi" ? renderMultiResults(matched, selectedIds) : renderSingleResults(matched);
  const moreNotice = remaining > 0 ? `<p class="placeholder">他${remaining}件</p>` : "";
  return list + moreNotice;
}

// single: resolve(speciesId) を呼ぶPromiseを返す。キャンセル時はresolve(null)。
// multi: resolve(選択されたspeciesIdの配列)。キャンセル時はresolve(null)。initialSelectedIdsで初期選択状態を渡せる。
export function openSpeciesPicker({ mode = "single", initialSelectedIds = [] } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const isMulti = mode === "multi";
    const selectedIds = new Set(initialSelectedIds);

    const dialog = ensureDialog();
    dialog.innerHTML = `
      <div class="modal-header">ポケモンを検索</div>
      <div class="modal-body">
        <input class="input search-box" id="species-search" type="text" placeholder="名前で検索" autocomplete="off">
        ${isMulti ? '<p class="placeholder" id="species-selected-summary"></p>' : ""}
        <div id="species-results"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="btn-cancel">キャンセル</button>
        ${isMulti ? '<button type="button" class="btn btn-primary" id="btn-confirm">決定</button>' : ""}
      </div>
    `;

    const input = dialog.querySelector("#species-search");
    const resultsEl = dialog.querySelector("#species-results");
    const summaryEl = dialog.querySelector("#species-selected-summary");
    resultsEl.innerHTML = '<p class="placeholder">検索してください</p>';

    function updateSummary() {
      if (summaryEl) summaryEl.textContent = `${selectedIds.size}件選択中`;
    }

    getPokedex()
      .then((pokedex) => {
        const rerender = () => {
          resultsEl.innerHTML = renderResults(pokedex, input.value, mode, selectedIds);
          resultsEl.querySelectorAll(".species-picker-link").forEach((a) => {
            a.addEventListener("click", (e) => e.stopPropagation());
          });
        };
        rerender();
        updateSummary();
        input.addEventListener("input", rerender);
        resultsEl.addEventListener("click", (e) => {
          if (isMulti) {
            const checkbox = e.target.closest("[data-species-id]");
            if (!checkbox) return;
            const id = checkbox.dataset.speciesId;
            if (checkbox.checked) selectedIds.add(id);
            else selectedIds.delete(id);
            updateSummary();
            return;
          }
          const btn = e.target.closest("[data-species-id]");
          if (!btn) return;
          finish(btn.dataset.speciesId);
          dialog.close();
        });
      })
      .catch((err) => {
        console.error("[species-picker] 図鑑データ読込失敗", err);
        resultsEl.innerHTML = '<p class="placeholder">図鑑データの読込に失敗しました</p>';
      });

    dialog.querySelector("#btn-cancel").addEventListener("click", () => dialog.close());
    if (isMulti) {
      dialog.querySelector("#btn-confirm").addEventListener("click", () => {
        finish(Array.from(selectedIds));
        dialog.close();
      });
    }
    dialog.addEventListener("close", () => finish(null), { once: true });

    dialog.showModal();
    input.focus();
  });
}
