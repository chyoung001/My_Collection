import { randomUUID } from "node:crypto";

// 요청별 UUID + method/path/status/duration 로깅 미들웨어.
// 외부 라이브러리 없이 표준 라이브러리만 사용 — 나중에 pino/winston 도입 시 교체 가능.
//
// 사용:
//   app.use(requestLogger());
//
// 출력 예:
//   [req 7a3f] → POST /api/cards
//   [req 7a3f] ← 201 (143ms)

export function requestLogger() {
  return (req, res, next) => {
    const reqId = randomUUID().slice(0, 4); // 짧은 식별자
    const start = Date.now();
    req.id = reqId;

    // 응답 헤더에 X-Request-Id — 클라이언트가 에러 보고 시 첨부 가능
    res.setHeader("X-Request-Id", reqId);

    console.log(`[req ${reqId}] → ${req.method} ${req.originalUrl}`);

    res.on("finish", () => {
      const ms = Date.now() - start;
      const statusColor = res.statusCode >= 500 ? "✗"
                       : res.statusCode >= 400 ? "⚠"
                       : "✓";
      console.log(`[req ${reqId}] ← ${statusColor} ${res.statusCode} (${ms}ms)`);
    });

    next();
  };
}
