// 確認ダイアログ（Phase 6.0: confirm()の仮実装を置換）。species-picker.jsと同じシングルトンdialogパターン。
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

// 確認=true、キャンセル/Escで閉じた場合=falseで解決するPromiseを返す。
export function showConfirmDialog({ message, title = "確認", confirmLabel = "OK", cancelLabel = "キャンセル", danger = false }) {
  return new Promise((resolve) => {
    const dialog = ensureDialog();
    dialog.innerHTML = `
      <div class="modal-header">${escapeHtml(title)}</div>
      <div class="modal-body">${escapeHtml(message)}</div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="confirm-dialog-cancel">${escapeHtml(cancelLabel)}</button>
        <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" id="confirm-dialog-ok">${escapeHtml(confirmLabel)}</button>
      </div>
    `;

    dialog.querySelector("#confirm-dialog-cancel").addEventListener("click", () => {
      dialog.returnValue = "";
      dialog.close();
    });
    dialog.querySelector("#confirm-dialog-ok").addEventListener("click", () => {
      dialog.returnValue = "ok";
      dialog.close();
    });
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true });

    dialog.returnValue = ""; // Escキー等のネイティブclose時は前回値を持ち越さずfalse扱いにする
    dialog.showModal();
  });
}
