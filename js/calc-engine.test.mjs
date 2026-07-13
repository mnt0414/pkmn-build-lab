// calc-engine.js は @smogon/calc を CDN 経由の https ESM import として読み込む
// （import * as smogon from "https://cdn.jsdelivr.net/npm/@smogon/calc@0.11/+esm"）。
// Node.js（v26時点）の標準ESMローダーは https: スキームの import specifier を解決できず、
// 代替の --experimental-network-imports フラグも本バージョンでは廃止済みのため、
// calc-engine.js を import すること自体が Node 上では失敗する（トップレベルの static import が
// モジュール評価時に即座に例外を投げる。injectedBaseStats 等の純粋関数だけを個別に node:test で
// 検証することもできない）。
//
// そのため node:test での自動テストは不可能と判断し、ブラウザ実機確認（npx serve . 等）に切り替えた。
// 確認方法・結果はPhase5.1完了報告を参照。
import { test } from "node:test";

test(
  "calc-engine.js: @smogon/calcのCDN(https)importはNode.js標準ESMローダーでは解決できないためnode:testでは検証不可（ブラウザ実機確認で代替）",
  { skip: true },
  () => {},
);
