// 130point 스크래퍼 디버그 — ZenRows 응답을 파일로 떨궈서 셀렉터 검증
//
// 사용법:
//   node scripts/debugScraper.js "2018 Topps Gold Label Shohei Ohtani #17 PSA 10"
//
// 결과:
//   debug/raw-<timestamp>.html  — ZenRows 응답 원본
//   debug/parsed-<timestamp>.json — parseResults 결과
//   콘솔에 셀렉터별 매칭 카운트 출력

import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import { zenrowsFetch } from "../src/utils/zenrowsClient.js";

dotenv.config();

const BASE_URL = "https://www.130point.com";

const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  console.error("사용법: node scripts/debugScraper.js \"<검색어>\"");
  process.exit(1);
}

const debugDir = path.resolve("debug");
if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const htmlPath = path.join(debugDir, `raw-${ts}.html`);
const jsonPath = path.join(debugDir, `parsed-${ts}.json`);

const searchUrl = `${BASE_URL}/sales/`;
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

console.log(`[debug] 검색어: "${query}"`);
console.log(`[debug] ZenRows 호출 중...`);

let html;
try {
  html = await zenrowsFetch(searchUrl, { wait: 10000, jsInstructions });
} catch (err) {
  console.error(`[debug] ZenRows 실패:`, err.message);
  process.exit(2);
}

fs.writeFileSync(htmlPath, html);
console.log(`[debug] raw HTML 저장: ${htmlPath} (${html.length} bytes)`);

const $ = cheerio.load(html);

// 검색 적용 검증
console.log("\n[search verification]");
const inputVal = $('input[type="search"]').attr('value');
console.log(`  input value: "${inputVal ?? ''}"`);
const queryTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
const ebayLinkTexts = $('a[href*="ebay.com"]').map((_, a) => $(a).text().toLowerCase()).get();
const matchCount = ebayLinkTexts.filter((t) => queryTokens.some((tok) => t.includes(tok))).length;
console.log(`  ebay results matching query tokens: ${matchCount} / ${ebayLinkTexts.length}`);
console.log(`  query tokens used: [${queryTokens.join(", ")}]`);

console.log("\n[selector counts]");
const candidates = [
  'div.flex-shrink-0.w-\\[200px\\]',
  'div[class*="flex-shrink-0"][class*="w-[200px]"]',
  'a[href*="ebay.com/itm"]',
  'img[alt]',
  'p',
];
for (const sel of candidates) {
  try {
    console.log(`  ${sel}: ${$(sel).length}`);
  } catch (e) {
    console.log(`  ${sel}: <invalid selector: ${e.message}>`);
  }
}

// 현재 파싱 로직 그대로 돌려보기
const wrappers = $('div').filter((_, el) => {
  const cls = $(el).attr("class") || "";
  return cls.includes("flex-shrink-0") && cls.includes("w-[200px]");
});
console.log(`\n[wrapper match] flex-shrink-0 + w-[200px] divs: ${wrappers.length}`);

// USD 가격 패턴 카운트
let usdInlineCount = 0;
let usdStandaloneCount = 0;
$("body *").each((_, el) => {
  const text = $(el).clone().children().remove().end().text().trim();
  if (/\$\s*[\d,]+(?:\.\d{1,2})?\s*USD/.test(text)) usdInlineCount++;
  if (/^\$\s*[\d,]+(?:\.\d{1,2})?\s*USD$/.test(text)) usdStandaloneCount++;
});
console.log(`[price patterns] inline USD: ${usdInlineCount}, standalone USD: ${usdStandaloneCount}`);

// eBay 링크 샘플
const ebayLinks = $('a[href*="ebay.com"]').slice(0, 5);
console.log(`\n[ebay links] total: ${$('a[href*="ebay.com"]').length}, sampling first 5:`);
ebayLinks.each((i, el) => {
  const href = $(el).attr("href");
  const text = $(el).text().trim().slice(0, 60);
  console.log(`  [${i}] ${href?.slice(0, 80)}  — "${text}"`);
});

// img alt 샘플
console.log(`\n[img alts] sampling first 5 with alt:`);
$("img[alt]").slice(0, 5).each((i, el) => {
  console.log(`  [${i}] alt="${$(el).attr("alt")?.slice(0, 100)}"`);
});

// 파싱 결과 저장
const parsed = {
  query,
  searchUrl,
  htmlLength: html.length,
  wrapperCount: wrappers.length,
  usdInlineCount,
  usdStandaloneCount,
  ebayLinkCount: $('a[href*="ebay.com"]').length,
};
fs.writeFileSync(jsonPath, JSON.stringify(parsed, null, 2));
console.log(`\n[debug] 요약 저장: ${jsonPath}`);
console.log(`\nHTML을 브라우저로 열어 직접 확인: ${htmlPath}`);
