// 種族検索ダイアログ（単一選択モードのみ）。複数選択は3.3で必要になった時点で拡張する。
import { getPokedex } from "./static-data.js";
import { escapeHtml } from "./utils.js";

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

function renderResults(pokedex, query) {
  const q = query.trim();
  if (!q) return '<p class="placeholder">検索してください</p>';
  const lowerQ = q.toLowerCase();
  const matched = Object.values(pokedex)
    .filter((p) => displayName(p).toLowerCase().includes(lowerQ))
    .slice(0, 50);
  if (matched.length === 0) return '<p class="placeholder">該当するポケモンが見つかりません</p>';
  return `<ul class="species-picker-list">${matched
    .map(
      (p) => `
      <li>
        <button type="button" class="btn species-picker-item" data-species-id="${escapeHtml(p.id)}">
          ${escapeHtml(displayName(p))}
          ${p.isNonstandard != null ? '<span class="badge-muted">(非標準)</span>' : ""}
        </button>
      </li>`
    )
    .join("")}</ul>`;
}

// resolve(speciesId) を呼ぶPromiseを返す。キャンセル時はresolve(null)。
export function openSpeciesPicker() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const dialog = ensureDialog();
    dialog.innerHTML = `
      <div class="modal-header">ポケモンを検索</div>
      <div class="modal-body">
        <input class="input search-box" id="species-search" type="text" placeholder="名前で検索" autocomplete="off">
        <div id="species-results"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="btn-cancel">キャンセル</button>
      </div>
    `;

    const input = dialog.querySelector("#species-search");
    const resultsEl = dialog.querySelector("#species-results");
    resultsEl.innerHTML = '<p class="placeholder">検索してください</p>';

    getPokedex()
      .then((pokedex) => {
        resultsEl.innerHTML = renderResults(pokedex, input.value);
        input.addEventListener("input", () => {
          resultsEl.innerHTML = renderResults(pokedex, input.value);
        });
        resultsEl.addEventListener("click", (e) => {
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
    dialog.addEventListener("close", () => finish(null), { once: true });

    dialog.showModal();
    input.focus();
  });
}
