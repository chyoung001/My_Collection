// PSA cert 스크래퍼 디버그 — parsePsaCert가 estimate/range/confidence/population을
// 어떻게(혹은 왜 못) 뽑는지 검증. ZenRows 응답 자체도 진단한다(Cloudflare 차단 여부 등).
//
// 사용법:
//   node scripts/debugPsa.js --file <path>                 (무비용: 저장 HTML 분석)
//   node scripts/debugPsa.js <cert> [--js=false] [--antibot=true] [--wait=3000]
//        (라이브: ZenRows 1콜. 기본 js_render=true, antibot=false, premium_proxy=true)
//
// 과금: premium_proxy 10x × js_render 5x = 25x. js=false면 premium만 → 10x.

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import * as cheerio from "cheerio";
import { parsePsaCert } from "../src/utils/psaScraper.js";

dotenv.config();

const args = process.argv.slice(2);
if (!args.length) {
  console.error("사용법: node scripts/debugPsa.js --file <path> | <cert> [--js=false] [--antibot=true] [--wait=N]");
  process.exit(1);
}

const debugDir = path.resolve("debug");
if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });

const flag = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : def;
};

let html, savePath, meta = {};

if (args[0] === "--file") {
  savePath = path.resolve(args[1]);
  html = fs.readFileSync(savePath, "utf8");
  console.log(`[debug] 파일 로드: ${savePath} (${html.length} bytes)`);
} else {
  const cert = args[0];
  const js = flag("js", "true") !== "false";
  const antibot = flag("antibot", "false") === "true";
  const wait = Number(flag("wait", "3000"));
  const apiKey = process.env.ZENROWS_API_KEY;
  if (!apiKey) { console.error("ZENROWS_API_KEY 미설정"); process.exit(1); }

  const targetUrl = `https://www.psacard.com/cert/${encodeURIComponent(cert)}/psa`;
  const params = new URLSearchParams({
    apikey: apiKey, url: targetUrl,
    premium_proxy: "true", proxy_country: "us",
    wait: String(wait), original_status: "true",
  });
  if (js) params.set("js_render", "true");
  if (antibot) params.set("antibot", "true");

  const cost = js ? "25x" : "10x";
  console.log(`[debug] ZenRows fetch (js_render=${js}, antibot=${antibot}, wait=${wait}) ~${cost}`);
  console.log(`[debug] ${targetUrl}`);
  const started = Date.now();
  let res;
  try {
    res = await fetch(`https://api.zenrows.com/v1/?${params}`, { signal: AbortSignal.timeout(90000) });
  } catch (err) {
    console.error(`[debug] fetch 실패: ${err.name} ${err.message}`);
    process.exit(2);
  }
  const elapsed = Date.now() - started;
  html = await res.text();
  meta = { httpStatus: res.status, elapsedMs: elapsed };
  console.log(`[debug] HTTP ${res.status} · ${elapsed}ms · ${html.length} bytes`);
  // ZenRows 관측용 헤더
  for (const [k, v] of res.headers) {
    if (/^(zr-|x-request|concurrency|x-zenrows)/i.test(k)) console.log(`        ${k}: ${v}`);
  }
  savePath = path.join(debugDir, `psa-cert-${cert}-js${js}-ab${antibot}.html`);
  fs.writeFileSync(savePath, html);
  console.log(`[debug] 저장: ${savePath}`);
}

// --- Cloudflare/차단 마커 ---
const blockMarkers = [
  "Just a moment", "Checking your browser", "Attention Required", "cf-chl",
  "cf-challenge", "/cdn-cgi/challenge-platform", "Enable JavaScript and cookies",
  "Access denied", "Sorry, you have been blocked",
];
const hits = blockMarkers.filter((m) => html.includes(m));
console.log(`\n=== 차단 마커 ===`);
console.log(hits.length ? `⚠️ Cloudflare/차단 추정: ${JSON.stringify(hits)}` : "없음 (정상 콘텐츠 추정)");

// --- 콘텐츠 존재 여부 ---
console.log(`\n=== 콘텐츠 신호 ===`);
console.log(`"PSA Estimate" 포함: ${html.includes("PSA Estimate")}`);
console.log(`"__next_f" (SSR flight) 포함: ${html.includes("__next_f")}`);
const dollars = [...html.matchAll(/\$\$?([\d,]+\.\d{2})/g)].map((m) => m[0]).slice(0, 12);
console.log(`달러 금액 첫 12: ${JSON.stringify(dollars)}`);
const $ = cheerio.load(html);
console.log(`<title>: "${$("title").text().slice(0, 100)}"`);
console.log(`렌더된 [role="group"]: ${$('[role="group"]').length}`);

// --- 파서 결과 ---
console.log(`\n=== parsePsaCert 결과 ===`);
console.log(JSON.stringify(parsePsaCert(html), null, 2));
