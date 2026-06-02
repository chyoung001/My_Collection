-- Database: my_collection_backenddb (schema init)

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

  -- PSA external data (raw)
  certification_type VARCHAR(20),
  is_hologram        BOOLEAN,
  is_reverse_barcode BOOLEAN,
  psa_cert           JSONB,
  psa_population     JSONB,
  psa_images         JSONB,
  dna_cert           JSONB,

  current_price  NUMERIC(12,2),
  purchase_price NUMERIC(12,2),
  sold_at        TIMESTAMP WITH TIME ZONE,
  sold_price     NUMERIC(12,2),
  sold_note      VARCHAR(255),
  is_rare        BOOLEAN NOT NULL DEFAULT FALSE,

  gallery_section_id INTEGER,
  gallery_order      INTEGER NOT NULL DEFAULT 0,

  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cards_cert_number ON cards (cert_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_cert_number_unique
  ON cards (cert_number) WHERE cert_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_subject ON cards (subject);
CREATE INDEX IF NOT EXISTS idx_cards_grader_grade ON cards (grader, grade);
CREATE INDEX IF NOT EXISTS idx_cards_gallery_section
  ON cards (gallery_section_id, gallery_order);
CREATE INDEX IF NOT EXISTS idx_cards_sold_at ON cards (sold_at);

-- 기존 DB 마이그레이션용 ALTER (신규 설치 시 CREATE TABLE이 이미 포함하므로 IF NOT EXISTS/IF EXISTS로 안전하게 실행)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS certification_type VARCHAR(20);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS psa_cert JSONB;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS psa_population JSONB;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS psa_images JSONB;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS dna_cert JSONB;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12,2);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_rare BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS gallery_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS sold_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS sold_price NUMERIC(12,2);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS sold_note VARCHAR(255);

-- is_hologram / is_reverse_barcode: VARCHAR → BOOLEAN 마이그레이션 (멱등 — 과거 VARCHAR였던 DB에서만 변환,
-- 이미 BOOLEAN이면 skip. 가드 없이 ALTER ... TYPE를 재실행하면 boolean IN (text) 오류가 났었다.)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_hologram BOOLEAN;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_reverse_barcode BOOLEAN;
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


-- market price snapshot history
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
);

CREATE INDEX IF NOT EXISTS idx_snapshots_card_id_fetched ON market_snapshots (card_id, fetched_at DESC);

-- gallery curation
CREATE TABLE IF NOT EXISTS gallery_sections (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  frame_layout  VARCHAR(10) NOT NULL DEFAULT '3x3',
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_sections_order ON gallery_sections (display_order);

-- gallery_section_id FK 부착.
-- 주의: `ADD COLUMN IF NOT EXISTS ... REFERENCES`는 컬럼이 이미 존재하면 문장 전체가 no-op이라
-- FK 제약이 영영 붙지 않는다(섹션 삭제 시 ON DELETE SET NULL이 동작 안 해 카드가 고아화 → 갤러리에서 소실).
-- 따라서 (1) 컬럼만 보장 → (2) 고아 참조 정리 → (3) 명시적 ADD CONSTRAINT로 멱등 부착.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS gallery_section_id INTEGER;

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

-- user preferences (단일 사용자 key-value 설정 저장소)
CREATE TABLE IF NOT EXISTS user_preferences (
  key        VARCHAR(100) PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
