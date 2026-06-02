import * as cheerio from "cheerio";
import { zenrowsFetch } from "./zenrowsClient.js";
import { buildQuery } from "./pointScraper.js";

const BASE_URL = "https://www.psacard.com";

function parseMoney(s) {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return isNaN(n) || n <= 0 ? null : Math.round(n * 100) / 100;
}

function parseIntSafe(s) {
  if (s == null) return null;
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? null : n;
}

/**
 * PSA 'Estimate Confidence'(High/Moderate/Low)를 앱 공통 신뢰도 등급으로 매핑.
 */
function mapConfidenceLevel(psaConfidence) {
  switch ((psaConfidence || "").toLowerCase()) {
    case "high":     return "HIGH";
    case "moderate": return "MEDIUM";
    case "low":      return "LOW";
    default:         return psaConfidence ? "MEDIUM" : "LOW";
  }
}

/**
 * PSA cert 페이지 HTML에서 Estimate(가격)·범위·신뢰도·Population을 파싱.
 *
 * PSA 사이트는 Next.js SSR이라 값이 (1) 플라이트 데이터(self.__next_f.push, $$1,609.00 형태)와
 * (2) 렌더된 DOM(<p>$1,609.00</p>, <a>396</a>) 양쪽에 들어있다. 별도 JSON API는 없음.
 * 클래스명은 잘 바뀌므로 '텍스트 라벨' 앵커 기반 정규식으로 추출한다.
 *
 * 셀렉터 근거(2026-06 실측, cert 76348771):
 *   "PSA Estimate" ... "$$1,609.00"
 *   "$$1,418.00 - $1,877.00"            (추정 범위)
 *   "Estimate Confidence: Moderate"
 *   PSA Population</p><a ...>396</a>
 *   Pop Higher</p><p ...>0</p>
 */
export function parsePsaCert(html) {
  if (!html) return { estimate: null };

  const $ = cheerio.load(html);

  // 스탯 박스는 <div role="group">[라벨][값]</div> 구조.
  // 태그/클래스가 아니라 '라벨 텍스트'로 값을 뽑아 마크업 변화에 견고하게 한다.
  // (예: "PSA Population396", "Pop Higher0", "PSA Estimate$1,609.00")
  const boxTexts = [];
  $('[role="group"]').each((_, el) => {
    boxTexts.push($(el).text().replace(/\s+/g, " ").trim());
  });
  const boxValue = (label) => {
    for (const t of boxTexts) {
      if (t.startsWith(label)) return t.slice(label.length).trim();
    }
    return null;
  };

  // --- Estimate(가격) --- 스탯박스 우선, 실패 시 라벨 앵커 정규식 폴백
  let estimate = parseMoney(boxValue("PSA Estimate"));
  if (estimate == null) {
    const m = html.match(/PSA Estimate[\s\S]{0,300}?\$([\d,]+\.\d{2})/);
    estimate = m ? parseMoney(m[1]) : null;
  }

  // --- Population(동일 등급 총 개체수) ---
  let totalPopulation = parseIntSafe(boxValue("PSA Population"));
  if (totalPopulation == null) {
    // 폴백: 라벨 다음 첫 숫자 (닫는/여는 태그·공백 무관)
    const m = html.match(/PSA Population<\/[a-z]+>\s*<[a-z][^>]*>\s*([\d,]+)\s*</i);
    totalPopulation = m ? parseIntSafe(m[1]) : null;
  }

  // --- Pop Higher(상위 등급 개체수) ---
  let populationHigher = parseIntSafe(boxValue("Pop Higher"));
  if (populationHigher == null) {
    const m = html.match(/Pop Higher<\/[a-z]+>\s*<[a-z][^>]*>\s*([\d,]+)\s*</i);
    populationHigher = m ? parseIntSafe(m[1]) : null;
  }

  // --- 추정 범위 / 신뢰도 ---
  // 'About PSA Estimate' 다이얼로그는 클릭 시 마운트되어 렌더 DOM엔 없고 플라이트 데이터에만 있으므로
  // raw HTML 정규식으로 추출한다.
  const rngM = html.match(/\$([\d,]+\.\d{2})\s*-\s*\$([\d,]+\.\d{2})/);
  const estimateLow = rngM ? parseMoney(rngM[1]) : null;
  const estimateHigh = rngM ? parseMoney(rngM[2]) : null;

  const confM = html.match(/Estimate Confidence:\s*([A-Za-z]+)/);
  const psaConfidence = confM ? confM[1] : null;

  return { estimate, estimateLow, estimateHigh, psaConfidence, totalPopulation, populationHigher };
}

/**
 * PSA cert 페이지를 ZenRows로 가져와 파싱.
 * ZenRows는 www.psacard.com에 js_render+premium_proxy(25x)를 강제(REQS002)하므로
 * zenrowsFetch 기본 설정을 그대로 쓴다. 검색 폼이 없으니 jsInstructions는 불필요.
 * @returns {Promise<object|null>} cert_number 없으면 null
 */
export async function scrapePsaCert(card) {
  const cert = card.cert_number;
  if (!cert) return null;
  const sourceUrl = `${BASE_URL}/cert/${encodeURIComponent(cert)}/psa`;
  const html = await zenrowsFetch(sourceUrl, { wait: 3000 });
  const parsed = parsePsaCert(html);
  return { ...parsed, sourceUrl, _raw: html.slice(0, 3000) };
}

/**
 * PSA 파싱 결과를 market_snapshots 저장용 result 형태(130point result와 호환)로 변환.
 * estimate가 없으면 null → 호출측에서 130point 폴백.
 */
export function toSnapshotResult(psa, card) {
  if (!psa || psa.estimate == null) return null;

  const population =
    psa.totalPopulation != null || psa.populationHigher != null
      ? { totalPopulation: psa.totalPopulation, populationHigher: psa.populationHigher }
      : null;

  const estimateRange =
    psa.estimateLow != null && psa.estimateHigh != null
      ? { low: psa.estimateLow, high: psa.estimateHigh }
      : null;

  return {
    source: "psa",
    query: buildQuery(card),
    sourceUrl: psa.sourceUrl,
    // 가격 통계 칼럼: PSA는 단일 추정가라 avg=median=representative=estimate, min/max=범위.
    avgPrice: psa.estimate,
    minPrice: psa.estimateLow ?? psa.estimate,
    maxPrice: psa.estimateHigh ?? psa.estimate,
    medianPrice: psa.estimate,
    representativePrice: psa.estimate,
    priceSource: "psa_estimate",
    saleCount: null,           // 판매 표본 기반이 아님
    recentSales: [],
    lastSale: null,
    estimateRange,
    population,
    confidence: {
      level: mapConfidenceLevel(psa.psaConfidence),
      source: "psa",
      psaConfidence: psa.psaConfidence,
      reasons: [`psa_estimate_confidence_${(psa.psaConfidence || "unknown").toLowerCase()}`],
    },
    filterStats: null,
  };
}
