import crypto from "node:crypto";
import { sendError } from "./httpError.js";

// 공유 시크릿 토큰 인증.
//
// 정책(단일 사용자 앱):
//  - 안전 메서드(GET/HEAD/OPTIONS)는 무인증 통과 → 읽기/대시보드는 공개 유지(공개 데모 가능).
//  - 변경 메서드(POST/PUT/PATCH/DELETE)와 비용 발생 호출(스크래핑·LLM은 모두 POST)만 토큰 요구.
//  - 토큰은 env API_TOKEN. 클라이언트는 `Authorization: Bearer <token>` 또는 `X-Api-Token` 헤더로 전달.
//
// API_TOKEN 미설정 시 동작:
//  - production(NODE_ENV==='production'): 변경 요청을 차단(503)하여 운영 중 무방비 노출을 막는다(fail-closed).
//  - 그 외(개발): 차단하지 않고 경고만 남긴다 → 로컬 작업 흐름을 깨지 않는다(fail-open).
//  → 즉, .env에 API_TOKEN을 넣는 순간 모든 환경에서 보호가 활성화된다.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function extractToken(req) {
  const auth = req.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const x = req.get("x-api-token");
  return x ? x.trim() : null;
}

// 타이밍 공격 방지용 상수시간 비교.
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function requireToken(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const expected = process.env.API_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      console.error("[auth] API_TOKEN 미설정 — 변경 요청 차단(production). 배포 환경 변수에 API_TOKEN을 설정하세요.");
      return sendError(res, 503, "auth_not_configured");
    }
    // 개발 환경: 보호 비활성 상태임을 알리고 통과.
    console.warn("[auth] API_TOKEN 미설정 — 쓰기 보호 비활성(dev). .env에 API_TOKEN을 설정하면 활성화됩니다.");
    return next();
  }

  const provided = extractToken(req);
  if (!provided || !safeEqual(provided, expected)) {
    return sendError(res, 401, "unauthorized");
  }
  return next();
}
