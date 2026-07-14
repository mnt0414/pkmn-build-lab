// 定数・外部リンクURLテンプレート。
// URL構造の変更は必ずここだけで完結させる（各画面へのハードコード禁止）。
export const CONFIG = {
  appName: "PKMN BUILD LAB.",
  version: "0.1.0",
  links: {
    // ポケ轍（ポケモン徹底攻略）各ポケモンの育成論・図鑑ページへの送客リンク。
    // 導線は 1)ポケモン一覧選択時 2)育成データ登録・編集画面 の2箇所。
    yakkunTheoryUrl: (no) => `https://yakkun.com/sv/theory/p${no}`,
    yakkunZukanUrl: (no) => `https://yakkun.com/sv/zukan/n${no}`,
    credits: {
      showdown: "https://pokemonshowdown.com/",
      pkmnProject: "https://pkmn.cc/",
      pokeapi: "https://pokeapi.co/",
      yakkun: "https://yakkun.com/",
    },
  },
  presets: {
    majorTeams: "data/presets/major-teams.json",
  },
  // レギュレーションの静的リスト（開発者管理）。将来allowedPokemon等のフィールド追加も可能な形にしておく。
  regulations: [
    { id: "M-A", label: "M-A" },
    { id: "M-B", label: "M-B" },
  ],
  speed: {
    scarfItemName: "こだわりスカーフ",
    weathers: [
      { id: "none", label: "天候なし" },
      { id: "rain", label: "雨" },
      { id: "sun", label: "晴れ" },
      { id: "sand", label: "砂嵐" },
      { id: "snow", label: "雪" },
    ],
    // 対象特性はここに追記するだけで追加できる（データ管理、要件5章に対応）。
    // abilityAliases: build.ability(選択式・英語名保存)とenemyPokemon.ability(自由入力・日本語名想定)の
    // 両方の保存形式に対応するため、英語名・日本語名の両方を列挙する。
    weatherAbilities: [
      { weather: "rain", abilityAliases: ["Swift Swim", "すいすい"], label: "すいすい", multiplier: 2 },
      { weather: "sun", abilityAliases: ["Chlorophyll", "ようりょくそ"], label: "ようりょくそ", multiplier: 2 },
      { weather: "sand", abilityAliases: ["Sand Rush", "すなかき"], label: "すなかき", multiplier: 2 },
      { weather: "snow", abilityAliases: ["Slush Rush", "ゆきかき"], label: "ゆきかき", multiplier: 2 },
    ],
  },
};
