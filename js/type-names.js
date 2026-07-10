// 18タイプの英→日固定辞書。
export const TYPE_JA = {
  Normal: "ノーマル",
  Fire: "ほのお",
  Water: "みず",
  Electric: "でんき",
  Grass: "くさ",
  Ice: "こおり",
  Fighting: "かくとう",
  Poison: "どく",
  Ground: "じめん",
  Flying: "ひこう",
  Psychic: "エスパー",
  Bug: "むし",
  Rock: "いわ",
  Ghost: "ゴースト",
  Dragon: "ドラゴン",
  Dark: "あく",
  Steel: "はがね",
  Fairy: "フェアリー",
};

export function typeJa(en) {
  return TYPE_JA[en] ?? en;
}
