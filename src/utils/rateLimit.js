import { sendError } from "./httpError.js";

// 간단한 고정 윈도우(fixed-window) in-memory 레이트 리미터.
//
// 단일 인스턴스/단일 사용자 앱에 충분하다. 멀티 인스턴스로 확장하면 카운터가 프로세스별로
// 분리되므로 express-rate-limit + 공유 store(redis 등)로 교체할 것.
//
// 옵션:
//  - windowMs: 윈도우 길이(ms), 기본 60초
//  - max:      윈도우당 허용 요청 수
//  - keyFn:    레이트 키 산출(기본 client IP)

export function rateLimit({ windowMs = 60_000, max = 300, keyFn } = {}) {
  const hits = new Map(); // key -> { count, resetAt }
  let lastSweep = Date.now();

  return (req, res, next) => {
    const now = Date.now();

    // 만료 엔트리 주기적 정리(메모리 누수 방지) — 윈도우마다 1회 정도.
    if (now - lastSweep > windowMs) {
      for (const [k, v] of hits) {
        if (now >= v.resetAt) hits.delete(k);
      }
      lastSweep = now;
    }

    const key = keyFn ? keyFn(req) : (req.ip || req.socket?.remoteAddress || "unknown");
    let entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    res.set("X-RateLimit-Limit", String(max));
    res.set("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return sendError(res, 429, "rate_limited");
    }
    return next();
  };
}
