import "dotenv/config";
import express from "express";
import cors from "cors";
import { pingDB } from "./utils/db.js";
import { requestLogger } from "./utils/requestLogger.js";
import { requireToken } from "./utils/auth.js";
import { rateLimit } from "./utils/rateLimit.js";
import cardsRouter from "./service/cards.js";
import dashboardRouter from "./service/dashboard.js";
import snapshotsRouter from "./service/snapshots.js";
import galleryRouter from "./service/gallery.js";
import preferencesRouter from "./service/preferences.js";
import authRouter from "./service/auth.js";
import assistantRouter from "./service/assistant.js";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger.js";
import { sendError } from "./utils/httpError.js";
import { migrate } from "./utils/migrate.js";

const app = express();
const PORT = process.env.PORT || 4000;

// Railway/ngrok 등 리버스 프록시 1홉 뒤에서 동작 → req.ip가 실제 클라이언트 IP를 반영하도록.
// (레이트리밋 키를 프록시 IP 하나로 합치지 않기 위해 필요)
app.set("trust proxy", 1);

// CORS — 개발 환경에선 모두 허용, 프로덕션에선 ALLOWED_ORIGINS 화이트리스트만.
// ALLOWED_ORIGINS는 쉼표 구분 (예: "https://app.example.com,https://admin.example.com")
const isDev = process.env.NODE_ENV !== "production";
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // 개발 모드 또는 origin 없는 요청(curl, Postman 등)은 통과
    if (isDev || !origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // ngrok 같은 임시 URL을 env로 매번 갱신하기 부담스러우면 명시적 정규식 옵션 추가 가능.
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" })); // base64 이미지 대비 10MB
app.use(requestLogger());

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get("/", (_req, res) => {
  res.redirect("/docs");
});

app.get("/health", async (_req, res) => {
  const t = new Date().toISOString();
  try {
    await pingDB();
    res.json({ status: "ok", db: "ok", timestamp: t });
  } catch (err) {
    // DB 끊김 — readiness 실패로 신호. Kubernetes/Docker liveness probe가 정상 처리하도록.
    console.error("[health] DB ping 실패", err.message);
    res.status(503).json({ status: "degraded", db: "down", timestamp: t });
  }
});

// --- API 보호 계층 (라우터보다 먼저) ---
// 1) 전체 /api 레이트리밋(공개 GET 포함 anti-hammer). 2) 쓰기/비용 호출에 토큰 요구(GET은 통과).
//    /docs, /health, / 는 보호 대상이 아님.
const apiLimiter = rateLimit({ windowMs: 60_000, max: 300 });   // IP당 분당 300
const llmLimiter = rateLimit({ windowMs: 60_000, max: 20 });    // LLM은 유료 → 더 엄격
app.use("/api", apiLimiter);
app.use("/api", requireToken);

app.use("/api/cards", cardsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/snapshots", snapshotsRouter);
app.use("/api/gallery", galleryRouter);
app.use("/api/assistant", llmLimiter, assistantRouter);
app.use("/api/preferences", preferencesRouter);
app.use("/api/auth", authRouter);

// --- 매칭되지 않은 /api 경로 → JSON 404 ---
// 라우터를 통과했는데 아무 핸들러도 매칭되지 않으면 Express 기본 404(HTML)가 반환된다.
// 나머지 API와 동일한 JSON 봉투({error, message})로 통일하고, 어떤 경로가 없는지 메시지에 담아
// 디버깅(예: 백엔드 미재시작으로 신규 라우트 미반영)을 쉽게 한다.
app.use("/api", (req, res) =>
  sendError(res, 404, "not_found", { message: `${req.method} ${req.originalUrl} 경로를 찾을 수 없습니다.` })
);

// --- 전역 에러 핸들러 (모든 라우터 뒤에 위치해야 함) ---
// Express 기본 핸들러는 HTML(개발 시 스택 트레이스 포함)을 반환하므로, 나머지 API와 동일한
// JSON 봉투({error, message})로 통일한다. CORS origin 콜백의 Error, 라우터의 동기 throw,
// asyncHandler가 next()로 넘긴 비동기 reject가 모두 여기로 모인다.
app.use((err, req, res, _next) => {
  if (res.headersSent) return _next(err);
  const isCors = /^CORS:/.test(err?.message || "");
  const status = err?.status || (isCors ? 403 : 500);
  const code = err?.code || (isCors ? "cors_forbidden" : "internal_error");
  console.error(`[error] ${req.method} ${req.originalUrl} →`, err?.message || err);
  sendError(res, status, code);
});

// 스키마 마이그레이션 로직은 utils/migrate.js 로 분리됨 (migrate() import).

async function start() {
  try {
    await pingDB();
    console.log("[my_collection_backend] DB 연결 성공");
    await migrate();
  } catch (err) {
    console.error("[my_collection_backend] DB 연결 실패:", err.message);
  }
  app.listen(PORT, () => {
    console.log(`[my_collection_backend] listening on port ${PORT}`);
  });
}

start();

