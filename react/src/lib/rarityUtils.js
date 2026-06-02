// 카드 인구수(PSA TotalPopulation) 기반 희소 등급(tier) 산출.
//   pop === 1        → "masterpiece" (이 등급 단 1장 = 최상위 희소)
//   pop 2 ~ 5        → "lowpop"      (저인구 = 시세 책정 어려움)
//   그 외 / 데이터 없음 → null
// 백엔드 RARE_POP_THRESHOLD(기본 5)와 시각 컷오프(5)를 맞춘다.
const LOW_POP_MAX = 5;

export function rarityTier(card) {
  const p = card?.psaPopulation || {};
  const pop = Number(p.TotalPopulation ?? p.totalPopulation);
  if (!Number.isFinite(pop) || pop < 1) return null;
  if (pop === 1) return { tier: "masterpiece", pop };
  if (pop <= LOW_POP_MAX) return { tier: "lowpop", pop };
  return null;
}
