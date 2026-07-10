// 共通ヘルパー
// ユーザー入力・外部データをinnerHTMLに埋め込む際は必ずescapeHtmlを通すこと（自XSS防止）。
export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
