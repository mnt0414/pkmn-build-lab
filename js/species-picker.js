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

function optionId(index) {
  return `species-option-${index}`;
}

// ポケ徹・育成論ページへの送客リンク（要件3.4）。numが不正な場合は表示しない。
function theoryLinkHtml(num) {
  if (!Number.isInteger(num) || num <= 0) return "";
  const url = CONFIG.links.yakkunTheoryUrl(num);
  return `<a class="species-picker-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">育成論</a>`;
}

function renderSingleResults(matched, activeIndex) {
  return `<ul class="species-picker-list">${matched
    .map(
      (p, i) => `
      <li class="species-picker-row">
        <button type="button"
          class="btn species-picker-item${i === activeIndex ? " is-active" : ""}"
          id="${optionId(i)}" role="option" aria-selected="${i === activeIndex ? "true" : "false"}"
          data-index="${i}" data-species-id="${escapeHtml(p.id)}">
          ${spriteImgHtml(p, { size: 40 })}
          <span>${escapeHtml(displayName(p))}</span>
          ${p.isNonstandard != null ? '<span class="badge-muted">(非標準)</span>' : ""}
        </button>
        ${theoryLinkHtml(p.num)}
      </li>`
    )
    .join("")}</ul>`;
}

function renderMultiResults(matched, selectedIds, activeIndex) {
  return `<ul class="species-picker-list">${matched
    .map((p, i) => {
      const checked = selectedIds.has(p.id) ? "checked" : "";
      const isActive = i === activeIndex;
      return `
      <li>
        <label class="btn species-picker-item species-picker-item-multi${isActive ? " is-active" : ""}"
          id="${optionId(i)}" role="option" aria-selected="${isActive ? "true" : "false"}" data-index="${i}">
          <input type="checkbox" data-species-id="${escapeHtml(p.id)}" ${checked}>
          ${spriteImgHtml(p, { size: 40 })}
          <span>${escapeHtml(displayName(p))}</span>
          ${p.isNonstandard != null ? '<span class="badge-muted">(非標準)</span>' : ""}
        </label>
      </li>`;
    })
    .join("")}</ul>`;
}

// single: resolve(speciesId) を呼ぶPromiseを返す。キャンセル時はresolve(null)。
// multi: resolve(選択されたspeciesIdの配列)。キャンセル時はresolve(null)。initialSelectedIdsで初期選択状態を渡せる。
export function openSpeciesPicker({ mode = "single", initialSelectedIds = [] } = {}) {
  const triggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const isMulti = mode === "multi";
    const selectedIds = new Set(initialSelectedIds);
    let currentMatched = [];
    let activeIndex = -1;

    const dialog = ensureDialog();
    dialog.innerHTML = `
      <div class="modal-header">ポケモンを検索</div>
      <div class="modal-body">
        <input class="input search-box" id="species-search" type="text" placeholder="名前で検索" autocomplete="off"
          role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-autocomplete="list" aria-controls="species-results">
        <div id="species-status" class="sr-only" role="status" aria-live="polite"></div>
        ${isMulti ? '<p class="placeholder" id="species-selected-summary"></p>' : ""}
        <div id="species-results" role="listbox"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="btn-cancel">キャンセル</button>
        ${isMulti ? '<button type="button" class="btn btn-primary" id="btn-confirm">決定</button>' : ""}
      </div>
    `;

    const input = dialog.querySelector("#species-search");
    const resultsEl = dialog.querySelector("#species-results");
    const statusEl = dialog.querySelector("#species-status");
    const summaryEl = dialog.querySelector("#species-selected-summary");
    resultsEl.innerHTML = '<p class="placeholder">検索してください</p>';

    function updateSummary() {
      if (summaryEl) summaryEl.textContent = `${selectedIds.size}件選択中`;
    }

    // aria-expanded/aria-activedescendantをactiveIndex・候補件数に同期させる。
    function updateAriaState(matchedCount) {
      input.setAttribute("aria-expanded", matchedCount > 0 ? "true" : "false");
      if (activeIndex >= 0 && activeIndex < matchedCount) {
        input.setAttribute("aria-activedescendant", optionId(activeIndex));
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    }

    // 一覧を再描画せず、activeIndexに応じたハイライト(.is-active/aria-selected)だけ更新する。
    function highlightActive() {
      resultsEl.querySelectorAll('[role="option"]').forEach((el, i) => {
        const active = i === activeIndex;
        el.classList.toggle("is-active", active);
        el.setAttribute("aria-selected", active ? "true" : "false");
        if (active) el.scrollIntoView({ block: "nearest" });
      });
      updateAriaState(currentMatched.length);
    }

    function moveActive(delta) {
      if (currentMatched.length === 0) return;
      activeIndex = (activeIndex + delta + currentMatched.length) % currentMatched.length;
      highlightActive();
    }

    function selectActive() {
      if (activeIndex < 0 || activeIndex >= currentMatched.length) return;
      const p = currentMatched[activeIndex];
      if (isMulti) {
        if (selectedIds.has(p.id)) selectedIds.delete(p.id);
        else selectedIds.add(p.id);
        const checkbox = resultsEl.querySelector(`#${optionId(activeIndex)} input[type="checkbox"]`);
        if (checkbox) checkbox.checked = selectedIds.has(p.id);
        updateSummary();
      } else {
        finish(p.id);
        dialog.close();
      }
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveActive(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveActive(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        selectActive();
      }
    });

    getPokedex()
      .then((pokedex) => {
        const rerender = () => {
          const q = input.value.trim();
          const allMatched = q ? searchPokemon(Object.values(pokedex), q) : [];
          const matched = allMatched.slice(0, MAX_RESULTS);
          currentMatched = matched;

          // クエリが変わるたびにactiveIndexを新しい一覧の範囲内へリセットする。
          if (matched.length === 0) {
            activeIndex = -1;
          } else if (activeIndex < 0 || activeIndex >= matched.length) {
            activeIndex = 0;
          }

          if (!q) {
            resultsEl.innerHTML = '<p class="placeholder">検索してください</p>';
            statusEl.textContent = "";
          } else if (allMatched.length === 0) {
            resultsEl.innerHTML = '<p class="placeholder">該当するポケモンが見つかりません</p>';
            statusEl.textContent = "該当するポケモンが見つかりません";
          } else {
            const list = isMulti ? renderMultiResults(matched, selectedIds, activeIndex) : renderSingleResults(matched, activeIndex);
            const remaining = allMatched.length - matched.length;
            const moreNotice = remaining > 0 ? `<p class="placeholder">他${remaining}件</p>` : "";
            resultsEl.innerHTML = list + moreNotice;
            statusEl.textContent = `${allMatched.length}件見つかりました`;
          }

          resultsEl.querySelectorAll(".species-picker-link").forEach((a) => {
            a.addEventListener("click", (e) => e.stopPropagation());
          });

          updateAriaState(matched.length);
        };
        rerender();
        updateSummary();
        input.addEventListener("input", rerender);
        resultsEl.addEventListener("click", (e) => {
          const optionEl = e.target.closest('[role="option"]');
          if (optionEl) {
            const idx = Number(optionEl.dataset.index);
            if (!Number.isNaN(idx)) {
              activeIndex = idx;
              highlightActive();
            }
          }
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
        statusEl.textContent = "図鑑データの読込に失敗しました";
      });

    dialog.querySelector("#btn-cancel").addEventListener("click", () => dialog.close());
    if (isMulti) {
      dialog.querySelector("#btn-confirm").addEventListener("click", () => {
        finish(Array.from(selectedIds));
        dialog.close();
      });
    }
    dialog.addEventListener(
      "close",
      () => {
        finish(null);
        if (triggerEl) triggerEl.focus();
      },
      { once: true }
    );

    dialog.showModal();
    input.focus();
  });
}
