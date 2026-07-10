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

### 技・特性の日本語名（Phase 3.0実装済み、手動実行）

`data:fetch` / `data:build` / `data:verify` の通常フローには含まれない、独立したワンショットスクリプト。PokeAPIから技・特性の日本語名を取得する。

- `npm run data:fetch:move-ja` → `data/sources/move_names_ja.json`（技935件分の日本語名。中断しても再実行で未取得分のみ再開）
- `npm run data:fetch:ability-ja` → `data/sources/ability_names_ja.json`（特性の日本語名）
- 上記実行後に `npm run data:build` を実行すると、`data/dist/moves.json` の各技に `nameJa`、`data/dist/pokedex.json` の各species に `abilitiesJa`（`abilities` と対称的な `{0,1,H}` 構造）が追加される。
- 新世代で技・特性が増えたら、該当スクリプトを再実行してコミットする（`data/generated/moves.json` / `pokedex.json` に無いidは自動的に対象外）。
- PokeAPIで解決できなかったid（未実装のZ技・ダイマックス技、CAP専用の非公式特性など）は `_meta.unmatched` に記録され、`data:verify` はこれを既知分として除外して網羅率を検証する。誤対応・未解決の手動修正は `data/patches/move-names-ja.patch.json` / `data/patches/ability-names-ja.patch.json` で行う。

## データソース・クレジット

- Data: Pokemon Showdown / @pkmn project（MIT）
- Data verification: PokeAPI
- Special thanks: ポケモン徹底攻略（ポケ轍）

攻略サイトのスクレイピングは行わない。
