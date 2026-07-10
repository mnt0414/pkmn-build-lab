// Pokemon Showdown方式のid正規化(小文字化+英数字以外除去)。
export function toId(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "");
}
