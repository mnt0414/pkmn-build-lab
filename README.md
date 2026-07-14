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

## ダメージ計算コードの流用元(Phase 5)

ダメージ計算(`js/calc.js`/`js/calc-engine.js`)は、姉妹プロジェクト BATTLEREC のコードをコピーして実装しています(共通ライブラリ化はしていません)。

- 流用元リポジトリ: `mnt0414/pkmn-buttledata` (BATTLEREC)
- ローカルパス: `C:\Users\mnt20\Documents\claude-dev\pkmn-buttledata`
- コピー時点のブランチ: `work`
- コピー時点のコミットハッシュ: `539a703e9393d70af78df08882599e7fab2912b4`
- 計算エンジン: `@smogon/calc@0.11` (CDN経由ESM: `https://cdn.jsdelivr.net/npm/@smogon/calc@0.11/+esm`)
- コピー日: 2026-07-13

BATTLERECとダメージ計算コードは同期していません。どちらか一方でバグを修正した場合、もう一方にも同じ修正を反映することを推奨します(詳細はNotion要件定義書3.2参照)。

### 既知の制約(Phase 5.1で判明)

- **持ち物の英語名解決不可**: 持ち物(item)は自由入力テキストとして保存しているため、英語名への機械的な変換手段がない。`@smogon/calc`側の持ち物辞書(`gen.items`)で実在チェックを行い、解決できた場合のみ装備として扱う。解決できない場合は「持ち物なし」として計算し、計算結果の注記(notes)にその旨を表示する。防御側で未解決の持ち物文字列をそのまま渡すと`calculate()`が例外を投げることを実機確認済みのため、この割り切りは必須の対応。
- **一部特性のポストマルチプライヤー未対応**: `champions_overlay.json`の特性補正のうち、タイプ変換系(`fromType`)・天候変換系(`weather`)を伴う特性は未対応。単純な威力倍率(`mult`)のみ適用し、それ以外は計算結果の注記に「特性補正未対応」として理由を残す(計算自体はブロックしない)。メガシンカ自体のタイプ変換(`overlay.megas[].types`)はこの制約の対象外で正しく反映される。

## データソース・クレジット

- Data: Pokemon Showdown / @pkmn project（MIT）
- Data verification: PokeAPI
- Special thanks: ポケモン徹底攻略（ポケ轍）

攻略サイトのスクレイピングは行わない。ポケモン一覧選択画面・build編集画面には、各ポケモンのポケ轍育成論ページ（`https://yakkun.com/sv/theory/p{図鑑番号}`）への送客リンクを設置している（Phase 6.2）。
