import * as cheerio from "cheerio";
import { zenrowsFetch } from "./zenrowsClient.js";

const BASE_URL = "https://www.130point.com";

/**
 * set_name을 130point 검색용으로 단축한다.
 * 130point는 토큰이 너무 많으면 검색 점수가 떨어져 "No results found"가 뜨는 경향이 있어,
 * 일반적인 잉여 토큰을 제거한다.
 *
 * 예:
 *   "TOPPS MLB MVP COLLECTION" → "Topps MVP"
 *   "TOPPS GOLD LABEL"         → "Topps Gold Label"  (그대로)
 *   "TOPPS CHROME"             → "Topps Chrome"      (그대로)
 */
function shortenSetName(setName) {
  if (!setName) return null;
  return setName
    .split(/\s+/)
    .filter((tok) => !/^(MLB|NBA|NFL|NHL|COLLECTION|SERIES|BASEBALL|BASKETBALL|FOOTBALL|HOCKEY)$/i.test(tok))
    .join(" ")
    .trim() || setName; // 모두 제거되면 원본 유지
}

/**
 * cards 테이블 row → 130point 검색 쿼리 문자열 생성
 *
 * 예:
 *   "2018 Topps Gold Label Shohei Ohtani #17 PSA 10"
 *   "2025 Topps MVP Aaron Judge #39 Red Foil PSA 10"  (← MLB·Collection 토큰 제거)
 *
 * variety(parallel)는 검색 정확도를 크게 좌우하므로 쿼리에 반드시 포함한다.
 * 다만 의미 없는 variety("Base", "Regular")는 제외.
 */
export function buildQuery(card) {
  const gradeNum = card.grade?.match(/\d+(\.\d+)?/)?.[0] ?? card.grade ?? "";
  const variety = card.variety && !/^(base|regular|none)$/i.test(card.variety.trim())
    ? card.variety
    : null;
  return [
    card.year,
    shortenSetName(card.set_name),
    card.subject,
    card.card_number ? `#${card.card_number}` : null,
    variety,
    card.grader,
    gradeNum,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * 카드 제목이 카드 row의 핵심 속성과 일치하는지 검사
 * - 연도, subject(선수명), grade는 반드시 일치
 * - variety(Class 1 등)는 카드에 지정돼 있으면 일치 요구
 */
function matchesCard(title, card) {
  if (!title) return false;
  const u = title.toUpperCase();

  if (card.year && !u.includes(String(card.year))) return false;

  if (card.subject) {
    const tokens = String(card.subject)
      .toUpperCase()
      .split(/\s+/)
      .filter((t) => t.length >= 3);
    if (tokens.length && !tokens.every((t) => u.includes(t))) return false;
  }

  if (card.grader && card.grade) {
    const gradeNum = String(card.grade).match(/\d+(?:\.\d+)?/)?.[0];
    if (gradeNum) {
      const graderRe = new RegExp(
        `${card.grader}\\s*(?:GEM\\s*MT\\s*|GEM\\s*|MT\\s*|MINT\\s*)?${gradeNum}\\b`,
        "i"
      );
      if (!graderRe.test(title)) return false;
    }
  }

  if (card.variety) {
    const vt = String(card.variety).trim();
    if (vt && !u.includes(vt.toUpperCase())) return false;
  }

  return true;
}

/**
 * IQR 기반 outlier 제거. n < 8이면 원본 반환 (표본 너무 작으면 outlier 개념이 무의미).
 */
function removeOutliersIQR(items, key = "price") {
  if (items.length < 8) return items;
  const sorted = [...items].sort((a, b) => a[key] - b[key]);
  const q1 = sorted[Math.floor(sorted.length * 0.25)][key];
  const q3 = sorted[Math.floor(sorted.length * 0.75)][key];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return items.filter((s) => s[key] >= lo && s[key] <= hi);
}

/**
 * 표본 적응형 날짜 필터.
 * 6개월에 충분한 표본이 있으면 그대로 쓰고, 부족하면 단계적으로 기간 확장.
 * @returns {{filtered: Array, windowDays: number|null}}
 */
function applyAdaptiveDateFilter(items, minSamples = 5) {
  if (items.length === 0) return { filtered: [], windowDays: null };
  const windows = [180, 365, 730, null]; // null = 무제한
  const now = Date.now();
  for (const days of windows) {
    if (days === null) return { filtered: items, windowDays: null };
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    const f = items.filter((s) => !s.soldAt || s.soldAt.getTime() >= cutoff);
    if (f.length >= minSamples) return { filtered: f, windowDays: days };
  }
  return { filtered: items, windowDays: null };
}

/**
 * 표본 수, 가격 분산, 데이터 신선도 기반으로 신뢰도 등급 산출.
 *   HIGH   — 충분한 표본 + 6개월 이내 + 낮은 분산
 *   MEDIUM — 보통 표본 (5~19) 또는 12개월 이내
 *   LOW    — 표본 1~4건, 또는 24개월 이상 또는 분산 매우 큼
 *   NONE   — 표본 0건
 */
function calculateConfidence(sales, windowDays) {
  if (sales.length === 0) return { level: "NONE", reasons: ["no_data"] };

  const reasons = [];
  const prices = sales.map((s) => s.price);
  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // 변동계수(CV) 대용: (Q3-Q1)/median. median 0이면 무한대 처리.
  const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? median;
  const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? median;
  const spread = median > 0 ? (q3 - q1) / median : Infinity;

  const mostRecent = sales.reduce(
    (max, s) => (s.soldAt && s.soldAt.getTime() > max ? s.soldAt.getTime() : max),
    0
  );
  const daysSinceLast = mostRecent ? Math.floor((Date.now() - mostRecent) / 86400000) : null;

  let level;
  if (sales.length >= 20 && (windowDays ?? 9999) <= 180 && spread <= 0.4) {
    level = "HIGH";
  } else if (sales.length >= 5 && (windowDays ?? 9999) <= 365) {
    level = "MEDIUM";
  } else {
    level = "LOW";
  }

  // 사유 기록
  if (sales.length < 5) reasons.push(`small_sample(n=${sales.length})`);
  if ((windowDays ?? 9999) > 365) reasons.push(`stale_data(window=${windowDays}d)`);
  if (spread > 0.6) reasons.push(`high_variance(IQR/median=${spread.toFixed(2)})`);
  if (daysSinceLast !== null && daysSinceLast > 365) reasons.push(`last_sale_${daysSinceLast}d_ago`);

  return { level, reasons, sampleSize: sales.length, windowDays, daysSinceLast, priceSpread: Math.round(spread * 100) / 100 };
}

/**
 * 130point.com에서 카드 시세를 수집
 */
export async function scrape130point(card) {
  const query = buildQuery(card);
  const searchUrl = `${BASE_URL}/sales/`;

  // 검색창에 타이핑 후 form submit — ZenRows 헤드리스 브라우저에서 실행
  // 130point는 React 클라이언트 사이드 검색이라 URL 파라미터가 통하지 않음.
  // keydown 단일 이벤트로는 form submit이 트리거되지 않아서, 키 이벤트 3종 + form.requestSubmit() 폴백을 함께 디스패치한다.
  const submitJs = `
    (function() {
      var input = document.querySelector('input[type="search"]');
      if (!input) return;
      ['keydown','keypress','keyup'].forEach(function(type) {
        input.dispatchEvent(new KeyboardEvent(type, {
          key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true
        }));
      });
      var form = input.closest('form');
      if (form && typeof form.requestSubmit === 'function') {
        try { form.requestSubmit(); } catch(e) {}
      } else if (form) {
        try { form.submit(); } catch(e) {}
      }
    })();
  `.replace(/\s+/g, ' ').trim();

  const jsInstructions = [
    { wait: 2000 },
    { click: 'input[type="search"]' },
    { wait: 500 },
    { fill: ['input[type="search"]', query] },
    { wait: 500 },
    { evaluate: submitJs },
    { wait: 6000 },
  ];

  let html;
  try {
    html = await zenrowsFetch(searchUrl, { wait: 10000, jsInstructions });
  } catch (err) {
    throw new Error(`ZenRows 요청 실패: ${err.message}`);
  }

  return parseResults(html, query, searchUrl, card);
}

/**
 * 130point.com 검색 결과 HTML 파싱
 *
 * 단위 셀렉터: a[data-sold-result]  — 검색 결과 그리드의 각 카드
 *   ├─ <img alt="카드 제목" ...>
 *   ├─ <p>$NNN.NN USD</p>  (가격)
 *   └─ <span data-result-end-time="ISO">DD MMM YY HH:MM</span>  (판매일)
 *
 * 처리 순서:
 *   1. 모든 결과 raw 추출 (제목/가격/날짜/URL)
 *   2. matchesCard: 카드 메타데이터로 제목 필터링
 *   3. 최근 N일 이내로 날짜 필터링 (기본 180일)
 *   4. IQR outlier 제거
 *   5. 통계 산출
 */
export function parseResults(html, query, sourceUrl, cardMeta = {}) {
  const $ = cheerio.load(html);
  const allSales = [];

  $("a[data-sold-result]").each((_, el) => {
    const card = $(el);
    const href = card.attr("href") || null;
    const title = card.find("img").first().attr("alt") || "";

    // 가격 추출 — 130point는 실판매가에 data-price-amount, 원가(취소선)에 data-original-price-amount를 붙임.
    // ① data-price-amount 우선, ② 못 찾으면 line-through 없는 텍스트 매치, ③ 마지막으로 텍스트 정규식 폴백.
    let price = null;
    const priceAttr = card.find("[data-price-amount]").first().attr("data-price-amount");
    if (priceAttr) {
      const val = parseFloat(priceAttr);
      if (!isNaN(val) && val > 0 && val < 500000) price = val;
    }
    if (price === null) {
      card.find("p, span, div").each((_, e) => {
        if (price !== null) return;
        const $el = $(e);
        // line-through(원가 표시)는 건너뜀
        const cls = $el.attr("class") || "";
        const parentCls = $el.parent().attr("class") || "";
        if (/line-through/.test(cls) || /line-through/.test(parentCls)) return;
        const text = $el.clone().children().remove().end().text().replace(/\s+/g, " ").trim();
        const m = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*USD/);
        if (m) {
          const val = parseFloat(m[1].replace(/,/g, ""));
          if (!isNaN(val) && val > 0 && val < 500000) price = val;
        }
      });
    }
    if (price === null) return;

    const endTime = card.find("[data-result-end-time]").first().attr("data-result-end-time") || null;
    const soldAt = endTime ? new Date(endTime) : null;

    let cleanUrl = null;
    if (href) {
      try {
        const u = new URL(href, BASE_URL);
        cleanUrl = `${u.origin}${u.pathname}`;
      } catch {
        cleanUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      }
    }

    allSales.push({
      title: title.slice(0, 120),
      price,
      soldAt,
      url: cleanUrl,
    });
  });

  const totalScraped = allSales.length;

  // 1차: 카드 메타데이터 일치
  let filtered = allSales.filter((s) => matchesCard(s.title, cardMeta));
  const afterTitleFilter = filtered.length;

  // 2차: 표본 적응형 날짜 필터
  const { filtered: dateFiltered, windowDays } = applyAdaptiveDateFilter(filtered, 5);
  filtered = dateFiltered;
  const afterDateFilter = filtered.length;

  // 3차: IQR outlier 제거 (n≥8일 때만)
  filtered = removeOutliersIQR(filtered, "price");
  const afterOutlierFilter = filtered.length;

  // 필터 후 상위 50건만 통계에 사용 (날짜 내림차순)
  const MAX_FOR_STATS = 50;
  const usedForStats = [...filtered]
    .sort((a, b) => (b.soldAt?.getTime() || 0) - (a.soldAt?.getTime() || 0))
    .slice(0, MAX_FOR_STATS);

  const filterStats = {
    totalScraped,
    afterTitleFilter,
    afterDateFilter,
    afterOutlierFilter,
    usedForStats: usedForStats.length,
    windowDays,
  };

  // 케이스 1: 130point에 데이터 자체가 없음
  if (totalScraped === 0) {
    return {
      query, sourceUrl,
      avgPrice: null, minPrice: null, maxPrice: null, medianPrice: null,
      saleCount: 0, recentSales: [],
      confidence: { level: "NONE", reasons: ["no_data"] },
      priceSource: "none",
      filterStats,
      _raw: html.slice(0, 3000),
    };
  }

  // 케이스 2: 검색은 됐는데 카드 메타 필터가 모두 걸러냄 — 메타가 부정확할 수 있어 raw 결과로 폴백 (LOW 신뢰도)
  if (usedForStats.length === 0) {
    return summarize(
      allSales.slice(0, MAX_FOR_STATS),
      query,
      sourceUrl,
      { ...filterStats, fallback: "no_match_after_filter" }
    );
  }

  return summarize(usedForStats, query, sourceUrl, filterStats);
}

function summarize(sales, query, sourceUrl, filterStats) {
  const prices = sales.map((s) => s.price);
  const sorted = [...prices].sort((a, b) => a - b);
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
  const median = sorted[Math.floor(sorted.length / 2)];

  // 날짜순 정렬해두기 (recent 표시 + last_sale 산출에 사용)
  const byDate = [...sales].sort(
    (a, b) => (b.soldAt?.getTime() || 0) - (a.soldAt?.getTime() || 0)
  );

  const confidence = calculateConfidence(sales, filterStats.windowDays);

  // 표본 적을 때(<5)는 평균이 의미 약함 → 마지막 거래가 우선
  const priceSource = sales.length >= 5 ? "median" : "last_sale";
  const lastSale = byDate.find((s) => s.soldAt) || byDate[0] || null;
  const representativePrice =
    priceSource === "median" ? median : lastSale?.price ?? median;

  const recentSales = byDate.slice(0, 20).map((s) => ({
    title: s.title,
    price: s.price,
    date: s.soldAt ? s.soldAt.toISOString() : null,
    url: s.url,
  }));

  return {
    query,
    sourceUrl,
    avgPrice: Math.round(avg * 100) / 100,
    minPrice: sorted[0],
    maxPrice: sorted[sorted.length - 1],
    medianPrice: median,
    representativePrice: Math.round(representativePrice * 100) / 100,
    priceSource,
    lastSale: lastSale
      ? { price: lastSale.price, date: lastSale.soldAt?.toISOString() || null, title: lastSale.title }
      : null,
    saleCount: prices.length,
    recentSales,
    confidence,
    filterStats,
  };
}
