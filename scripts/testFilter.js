// 캐시된 130point HTML로 parseResults() 필터 파이프라인 검증
import fs from "fs";
import { parseResults } from "../src/utils/pointScraper.js";

const htmlPath = process.argv[2] || "debug/raw-2026-05-29T00-44-00-579Z.html";
const html = fs.readFileSync(htmlPath, "utf8");

const scenarios = [
  {
    name: "필터 없음 (메타 미지정)",
    card: {},
  },
  {
    name: "PSA 10 Ohtani 2018 (variety 미지정)",
    card: { year: "2018", subject: "Shohei Ohtani", grader: "PSA", grade: "10" },
  },
  {
    name: "PSA 10 Ohtani 2018 + Class 1",
    card: { year: "2018", subject: "Shohei Ohtani", grader: "PSA", grade: "10", variety: "Class 1" },
  },
  {
    name: "PSA 10 Ohtani 2018 + Class 2",
    card: { year: "2018", subject: "Shohei Ohtani", grader: "PSA", grade: "10", variety: "Class 2" },
  },
];

// 1/1·SSP 시나리오 시뮬레이션 — variety에 가공의 "1/1" 같은 토큰을 넣어 표본 0~소수로 만든다
scenarios.push(
  {
    name: "1/1 시뮬레이션 (variety='1/1' — 매칭 0건 예상)",
    card: { year: "2018", subject: "Shohei Ohtani", grader: "PSA", grade: "10", variety: "1/1" },
  },
  {
    name: "SSP 시뮬레이션 (variety='Black' — 표본 8건)",
    card: { year: "2018", subject: "Shohei Ohtani", grader: "PSA", grade: "10", variety: "Black" },
  },
  {
    name: "Blue parallel (표본 4건 — LOW 신뢰도)",
    card: { year: "2018", subject: "Shohei Ohtani", grader: "PSA", grade: "10", variety: "Blue" },
  }
);

for (const s of scenarios) {
  const r = parseResults(html, "test", "test", s.card);
  console.log(`\n=== ${s.name} ===`);
  console.log(`  filterStats: ${JSON.stringify(r.filterStats)}`);
  console.log(`  confidence: ${JSON.stringify(r.confidence)}`);
  console.log(`  priceSource: ${r.priceSource}, representativePrice: $${r.representativePrice}`);
  console.log(`  통계: n=${r.saleCount}, avg=$${r.avgPrice}, median=$${r.medianPrice}, range=$${r.minPrice}~$${r.maxPrice}`);
  if (r.lastSale) {
    console.log(`  마지막 거래: $${r.lastSale.price} on ${r.lastSale.date?.slice(0,10) || "-"}`);
  }
  if (r.recentSales?.length) {
    console.log("  최근 거래 3건:");
    r.recentSales.slice(0, 3).forEach((x) => {
      console.log(`    $${String(x.price).padEnd(8)} ${x.date?.slice(0, 10) || "-"}  ${x.title.slice(0, 70)}`);
    });
  }
}
