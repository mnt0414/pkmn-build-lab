# data/sources/

外部プロジェクトから流用した一次データ置き場。

## pokemon_list.csv

- **由来**: 姉妹プロジェクト BATTLEREC(`pkmn-buttledata`リポジトリ)の`pokemon_list.csv`をそのままコピー。
- **列**: `no,name,type1,type2,sprite_override,sprite_url,yakkun_url`
  - `no`: 全国図鑑番号
  - `name`: 日本語名(フォルム違いは`sprite_override`列に値が入り、`name`にフォルム名を含む表記になる)
  - `type1`/`type2`: 日本語タイプ名(`type2`はタイプ1つのポケモンで空)
  - `sprite_override`: フォルム識別子(空でない行はフォルム違い。`data/patches/form-map.json`で`@pkmn/dex`のspeciesIdと対応付ける)
  - `sprite_url`: 図鑑画像URL
  - `yakkun_url`: ポケ轍(ポケモン徹底攻略)の図鑑ページURL
- **用途**:
  - `scripts/data-build.mjs`で`data/generated/pokedex.json`とJOINし、`nameJa`/`typesJa`/`spriteUrl`/`yakkunZukanUrl`/`yakkunTheoryUrl`を`data/dist/pokedex.json`に追加する(日本語UI表示用の補助データ)。
  - `scripts/data-verify.mjs`でCSV全行がpokedexに解決できるか(孤立行の検出)を検証する。
- **更新方法**: BATTLEREC側(`pkmn-buttledata`)を人手で確認したうえで、このファイルを丸ごと再コピーする。**このリポジトリ内で直接編集しない**(BATTLEREC側が正)。

## move_names_ja.json / ability_names_ja.json

- **由来**: PokeAPI(静的ミラー `raw.githubusercontent.com/PokeAPI/api-data`、フォールバックでライブAPI `pokeapi.co/api/v2`)から取得した技・特性の日本語名。
- **生成方法**: `scripts/fetch-move-names-ja.mjs` / `scripts/fetch-ability-names-ja.mjs`(`npm run data:fetch:move-ja` / `npm run data:fetch:ability-ja`)。中断しても再実行で未取得id(このファイルにまだ無いid)のみを対象に再開する。
  - `move_names_ja.json` のキーは `data/generated/moves.json` のShowdown技id。
  - `ability_names_ja.json` のキーは `data/generated/pokedex.json` の `abilities.0/1/H`(英語名)を`scripts/lib/to-id.mjs`の`toId()`で正規化したid。
- **形式**: `{ "_meta": { "source", "fetchedAt", "counts", "unmatched": [id, ...] }, "data": { id: "日本語名", ... } }`。`unmatched`はPokeAPI側にスラッグが見つからない/日本語名が無いid(未実装のZ技・ダイマックス技、CAP専用の非公式技・特性など)。
- **用途**: `scripts/data-build.mjs`で`data/dist/moves.json`の`nameJa`、`data/dist/pokedex.json`の`abilitiesJa`に統合される。`scripts/data-verify.mjs`で`unmatched`記載分を除く全件に日本語名が存在することを検証する。
- **更新方法**: 新しい世代で技・特性が追加されたら、該当npm scriptを再実行してコミットする(既存分は再取得しない)。誤対応や個別の手動修正は`data/patches/move-names-ja.patch.json` / `data/patches/ability-names-ja.patch.json`(`{ showdownId: "正しい日本語名" }`のフラットな上書きマップ)で行う。**このリポジトリ内で`move_names_ja.json` / `ability_names_ja.json`自体を直接編集しない**(fetchスクリプトの再実行結果が正)。
