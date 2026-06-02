import { pool } from "./db.js";
import { getAllPreferences } from "./preferences.js";

// 저장 통화는 USD. 사용자 설정 통화/환율로 변환 + 포맷 (프론트 fmtMoney와 동일 규칙).
function makeFmt(prefs) {
  const cur = prefs.currency || "USD";
  const decimals = Number(prefs.currencyDecimals) || 0;
  const rate = cur === "USD" ? 1 : Number(prefs.exchangeRates?.[cur]) || 1;
  const sym = { USD: "$", KRW: "₩", JPY: "¥" }[cur] || "$";
  return (usd) => {
    if (usd == null || isNaN(Number(usd))) return "—";
    const v = Number(usd) * rate;
    return sym + v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };
}

/**
 * 사용자 컬렉션을 LLM 그라운딩용 컨텍스트로 조립.
 * 모든 수치는 여기서 미리 계산·포맷 → 모델은 인용만 하고 직접 계산/추정하지 않게 한다.
 * 대시보드/스냅샷 페이지와 동일한 집계라 화면과 항상 일치.
 * @returns {{ asOf: string|null, currency: string, json: object, prose: string }}
 */
export async function buildCollectionContext({ topN = 20, needsLimit = 12 } = {}) {
  const prefs = await getAllPreferences();
  const fmt = makeFmt(prefs);
  const cur = prefs.currency || "USD";

  const [summaryR, gradesR, topR, needsR, asOfR] = await Promise.all([
    // 보유(sold_at IS NULL)/판매 집계
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE sold_at IS NULL)::int                                                        AS owned_count,
        COALESCE(SUM(current_price) FILTER (WHERE sold_at IS NULL), 0)                                      AS owned_value,
        COUNT(*) FILTER (WHERE sold_at IS NULL AND grade ~ '\\m10\\M')::int                                 AS psa10,
        COUNT(*) FILTER (WHERE sold_at IS NULL AND current_price IS NOT NULL)::int                          AS priced_count,
        COALESCE(SUM(current_price - purchase_price)
                 FILTER (WHERE sold_at IS NULL AND purchase_price IS NOT NULL AND current_price IS NOT NULL), 0) AS unrealized_gain,
        COALESCE(SUM(purchase_price)
                 FILTER (WHERE sold_at IS NULL AND purchase_price IS NOT NULL AND current_price IS NOT NULL), 0) AS unrealized_basis,
        COUNT(*) FILTER (WHERE sold_at IS NOT NULL)::int                                                    AS sold_count,
        COALESCE(SUM(sold_price - purchase_price)
                 FILTER (WHERE sold_at IS NOT NULL AND purchase_price IS NOT NULL), 0)                      AS realized_gain
      FROM cards
    `),
    pool.query(`SELECT COALESCE(grade,'N/A') AS grade, COUNT(*)::int AS count
                FROM cards WHERE sold_at IS NULL GROUP BY grade ORDER BY count DESC`),
    pool.query(`SELECT subject, year, set_name AS set, grade, grader, current_price AS price, purchase_price AS purchase
                FROM cards WHERE sold_at IS NULL AND current_price IS NOT NULL
                ORDER BY current_price DESC LIMIT $1`, [topN]),
    pool.query(`SELECT subject, year, grade FROM cards
                WHERE sold_at IS NULL AND current_price IS NULL
                ORDER BY created_at DESC LIMIT $1`, [needsLimit]),
    pool.query(`SELECT MAX(fetched_at) AS as_of FROM market_snapshots`),
  ]);

  const s = summaryR.rows[0];
  const asOf = asOfR.rows[0]?.as_of ? new Date(asOfR.rows[0].as_of).toISOString() : null;
  const num = (x) => Number(x) || 0;
  const pct = (gain, basis) => (num(basis) > 0 ? (num(gain) / num(basis)) * 100 : null);

  const unrealizedPct = pct(s.unrealized_gain, s.unrealized_basis);
  const realizedBasisQ = await pool.query(
    `SELECT COALESCE(SUM(purchase_price) FILTER (WHERE sold_at IS NOT NULL AND purchase_price IS NOT NULL),0) AS b FROM cards`
  );
  const realizedPct = pct(s.realized_gain, realizedBasisQ.rows[0].b);

  const topCards = topR.rows.map((c) => {
    const gain = c.purchase != null && c.price != null ? num(c.price) - num(c.purchase) : null;
    const gpct = c.purchase != null && num(c.purchase) > 0 ? ((num(c.price) - num(c.purchase)) / num(c.purchase)) * 100 : null;
    return {
      subject: c.subject, year: c.year, set: c.set, grade: c.grade, grader: c.grader,
      value: fmt(c.price),
      purchase: c.purchase != null ? fmt(c.purchase) : null,
      gain: gain != null ? `${gain >= 0 ? "+" : ""}${fmt(gain)}` : null,
      gainPct: gpct != null ? `${gpct >= 0 ? "+" : ""}${gpct.toFixed(1)}%` : null,
    };
  });

  const json = {
    currency: cur,
    asOf,
    portfolio: {
      ownedCount: s.owned_count,
      pricedCount: s.priced_count,
      pricedCoverage: `${s.priced_count}/${s.owned_count}장에 현재가 있음`,
      ownedValue: fmt(s.owned_value),
      psa10Count: s.psa10,
      unrealizedGain: `${num(s.unrealized_gain) >= 0 ? "+" : ""}${fmt(s.unrealized_gain)}`,
      unrealizedPct: unrealizedPct != null ? `${unrealizedPct >= 0 ? "+" : ""}${unrealizedPct.toFixed(1)}%` : null,
      soldCount: s.sold_count,
      realizedGain: `${num(s.realized_gain) >= 0 ? "+" : ""}${fmt(s.realized_gain)}`,
      realizedPct: realizedPct != null ? `${realizedPct >= 0 ? "+" : ""}${realizedPct.toFixed(1)}%` : null,
      gradeDistribution: gradesR.rows,
    },
    topCardsByValue: topCards,
    needsPriceCollection: needsR.rows.map((c) => `${c.year || ""} ${c.subject} (${c.grade || "?"})`.trim()),
  };

  const p = json.portfolio;
  const prose = p.ownedCount === 0
    ? "보유 카드가 없습니다."
    : `보유 ${p.ownedCount}장(현재가 ${p.pricedCount}장), 현재 가치 ${p.ownedValue}. PSA 10 ${p.psa10Count}장. ` +
      `미실현 손익 ${p.unrealizedGain}${p.unrealizedPct ? ` (${p.unrealizedPct})` : ""}. ` +
      `판매 ${p.soldCount}장, 실현 손익 ${p.realizedGain}${p.realizedPct ? ` (${p.realizedPct})` : ""}. ` +
      `시세 미수집 ${json.needsPriceCollection.length}장.`;

  return { asOf, currency: cur, json, prose };
}
