# PKMN BUILD LAB.

ポケモン（チャンピオンズ レギュMB）向けパーティ構築Webアプリ。
要件定義・設計はNotion「PKMN BUILD LAB. 要件定義・設計書」を参照。

## 構成

- vanilla HTML / CSS / JS（ES modules）、ビルド不要。GitHub Pagesで配信。
- 本データはIndexedDB（ローカルのみ、サーバーなし）。
- 静的データ（覚えるわざ・種族・技）は `data/dist/` にスナップショットとして保持（Phase 1実装済み）。

## 開発・動作確認

任意の静的サーバでルートを配信する（ES modulesのため file:// 直開き不可）。
例: `npx serve .` または `python -m http.server`

## データパイプライン（Phase 1実装済み）

- `npm run data:fetch` … @pkmn/dex(gen9)から種族・技・覚える技を抽出 → `data/generated/`
- `npm run data:build` … generated + patches をマージし、`data/sources/pokemon_list.csv`（日本語名等）とJOIN → `data/dist/`
- `npm run data:verify` … 検証（patch有効性・PokeAPIサンプリング照合・参照整合性・CSV⇔pokedex整合性）

アプリ本体は `data/dist/*.json` のみを読み込む。`data/generated/`（自動生成）・`data/patches/`（手動修正、`data/patches/form-map.json`はフォルム違いのCSV⇔speciesId対応表）は中間層。

## データソース・クレジット

- Data: Pokemon Showdown / @pkmn project（MIT）
- Data verification: PokeAPI
- Special thanks: ポケモン徹底攻略（ポケ轍）

攻略サイトのスクレイピングは行わない。
