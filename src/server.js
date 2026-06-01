import "dotenv/config";
import express from "express";
import cors from "cors";
import { pingDB, pool } from "./utils/db.js";
import { requestLogger } from "./utils/requestLogger.js";
import { requireToken } from "./utils/auth.js";
import { rateLimit } from "./utils/rateLimit.js";
import cardsRouter from "./service/cards.js";
import dashboardRouter from "./service/dashboard.js";
import snapshotsRouter from "./service/snapshots.js";
import galleryRouter from "./service/gallery.js";
import llmTestRouter from "./service/llmTest.js";
import preferencesRouter from "./service/preferences.js";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger.js";

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
app.use("/api/llm-test", llmLimiter, llmTestRouter);
app.use("/api/preferences", preferencesRouter);

async function migrate() {
  // ⚠️ 이 배열이 스키마의 단일 소스(source of truth)다. 앱은 부팅 시 이걸로 자급자족 부트스트랩한다.
  // schema.sql은 동일 내용의 수동 적용/참고용 사본이므로, 스키마 변경 시 반드시 양쪽을 함께 갱신할 것.
  // 모든 문장은 IF NOT EXISTS / 가드로 멱등(idempotent)하게 작성한다.
  const migrations = [
    // --- 기본 테이블: cards (이전 버전은 이 CREATE가 없어 앱 단독 부팅이 불가능했다) ---
    ["cards", `
      CREATE TABLE IF NOT EXISTS cards (
        id SERIAL PRIMARY KEY,
        subject        VARCHAR(255) NOT NULL,
        year           VARCHAR(4)   NOT NULL,
        set_name       VARCHAR(255) NOT NULL,
        card_number    VARCHAR(50)  NOT NULL,
        variety        VARCHAR(255),
        category       VARCHAR(255),
        grade          VARCHAR(50),
        grader         VARCHAR(20),
        cert_number    VARCHAR(50),
        image_url      TEXT,
        certification_type VARCHAR(20),
        is_hologram        BOOLEAN,
        is_reverse_barcode BOOLEAN,
        psa_cert           JSONB,
        psa_population     JSONB,
        psa_images         JSONB,
        dna_cert           JSONB,
        current_price  NUMERIC(12,2),
        purchase_price NUMERIC(12,2),
        is_rare        BOOLEAN NOT NULL DEFAULT FALSE,
        gallery_section_id INTEGER,
        gallery_order      INTEGER NOT NULL DEFAULT 0,
        created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `],
    // --- 기존 DB 호환용 컬럼 추가 (신규 설치 시 위 CREATE에 이미 포함되어 no-op) ---
    ["certification_type", "ALTER TABLE cards ADD COLUMN IF NOT EXISTS certification_type VARCHAR(20)"],
    ["psa_cert", "ALTER TABLE cards ADD COLUMN IF NOT EXISTS psa_cert JSONB"],
    ["psa_population", "ALTER TABLE cards ADD COLUMN IF NOT EXISTS psa_population JSONB"],
    ["psa_images", "ALTER TABLE cards ADD COLUMN IF NOT EXISTS psa_images JSONB"],
    ["dna_cert", "ALTER TABLE cards ADD COLUMN IF NOT EXISTS dna_cert JSONB"],
    ["is_hologram", "ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_hologram BOOLEAN"],
    ["is_reverse_barcode", "ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_reverse_barcode BOOLEAN"],
    ["purchase_price", "ALTER TABLE cards ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12,2)"],
    ["is_rare", "ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_rare BOOLEAN NOT NULL DEFAULT FALSE"],
    ["gallery_section_id", "ALTER TABLE cards ADD COLUMN IF NOT EXISTS gallery_section_id INTEGER"],
    ["gallery_order", "ALTER TABLE cards ADD COLUMN IF NOT EXISTS gallery_order INTEGER NOT NULL DEFAULT 0"],
    // is_hologram / is_reverse_barcode 가 과거 VARCHAR였던 DB만 BOOLEAN으로 변환 (멱등 — 이미 BOOLEAN이면 skip)
    ["bool_conversion", `
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='cards' AND column_name='is_hologram'
                     AND data_type IN ('character varying','character','text')) THEN
          ALTER TABLE cards ALTER COLUMN is_hologram TYPE BOOLEAN
            USING CASE WHEN is_hologram IN ('true','1','True') THEN TRUE
                       WHEN is_hologram IN ('false','0','False') THEN FALSE ELSE NULL END;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='cards' AND column_name='is_reverse_barcode'
                     AND data_type IN ('character varying','character','text')) THEN
          ALTER TABLE cards ALTER COLUMN is_reverse_barcode TYPE BOOLEAN
            USING CASE WHEN is_reverse_barcode IN ('true','1','True') THEN TRUE
                       WHEN is_reverse_barcode IN ('false','0','False') THEN FALSE ELSE NULL END;
        END IF;
      END$$;
    `],
    // --- gallery_sections (cards.gallery_section_id FK가 참조하므로 먼저 생성) ---
    ["gallery_sections", `
      CREATE TABLE IF NOT EXISTS gallery_sections (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(120) NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        frame_layout  VARCHAR(10) NOT NULL DEFAULT '3x3',
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `],
    ["gallery_frame_layout",
      "ALTER TABLE gallery_sections ADD COLUMN IF NOT EXISTS frame_layout VARCHAR(10) NOT NULL DEFAULT '3x3'"],
    // gallery_section_id FK 부착: `ADD COLUMN IF NOT EXISTS ... REFERENCES`는 컬럼이 이미 있으면
    // 통째로 no-op이라 제약이 영영 안 붙는 버그가 있었다(섹션 삭제 시 카드 고아화 → 갤러리에서 소실).
    // (1) 고아 참조 정리 후 (2) 명시적 ADD CONSTRAINT로 멱등 부착.
    ["fk_cards_section", `
      UPDATE cards SET gallery_section_id = NULL
      WHERE gallery_section_id IS NOT NULL
        AND gallery_section_id NOT IN (SELECT id FROM gallery_sections);
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cards_section') THEN
          ALTER TABLE cards
            ADD CONSTRAINT fk_cards_section
            FOREIGN KEY (gallery_section_id) REFERENCES gallery_sections(id) ON DELETE SET NULL;
        END IF;
      END$$;
    `],
    // --- market_snapshots: 시세 스냅샷 히스토리 (이전 버전 migrate에 누락 → snapshots 기능이 500) ---
    ["market_snapshots", `
      CREATE TABLE IF NOT EXISTS market_snapshots (
        id           SERIAL PRIMARY KEY,
        card_id      INTEGER REFERENCES cards(id) ON DELETE CASCADE,
        query        TEXT NOT NULL,
        ebay_count   INTEGER,
        avg_price    NUMERIC(12,2),
        min_price    NUMERIC(12,2),
        max_price    NUMERIC(12,2),
        median_price NUMERIC(12,2),
        items        JSONB,
        fetched_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `],
    // --- user_preferences ---
    ["user_preferences", `
      CREATE TABLE IF NOT EXISTS user_preferences (
        key        VARCHAR(100) PRIMARY KEY,
        value      JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `],
    // --- 인덱스 ---
    ["idx_cards_cert_number",
      "CREATE INDEX IF NOT EXISTS idx_cards_cert_number ON cards (cert_number)"],
    // cert_number는 PSA 자동 등록 시 충돌 가능성 있어 partial UNIQUE (NULL 행은 중복 허용 — 수동 등록 카드).
    ["idx_cards_cert_number_unique",
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_cert_number_unique
       ON cards (cert_number) WHERE cert_number IS NOT NULL`],
    ["idx_cards_subject",
      "CREATE INDEX IF NOT EXISTS idx_cards_subject ON cards (subject)"],
    ["idx_cards_grader_grade",
      "CREATE INDEX IF NOT EXISTS idx_cards_grader_grade ON cards (grader, grade)"],
    ["idx_gallery_sections_order",
      "CREATE INDEX IF NOT EXISTS idx_gallery_sections_order ON gallery_sections (display_order)"],
    ["idx_cards_gallery_section",
      "CREATE INDEX IF NOT EXISTS idx_cards_gallery_section ON cards (gallery_section_id, gallery_order)"],
    ["idx_snapshots_card_id_fetched",
      "CREATE INDEX IF NOT EXISTS idx_snapshots_card_id_fetched ON market_snapshots (card_id, fetched_at DESC)"],
  ];
  for (const [name, sql] of migrations) {
    try {
      await pool.query(sql);
      console.log(`[migrate] ${name} ready`);
    } catch (err) {
      console.warn(`[migrate] ${name}:`, err.message);
    }
  }
}

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

