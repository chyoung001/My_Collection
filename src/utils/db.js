import pg from "pg";

// dotenv는 server.js에서 한 번만 로드. 여기서는 process.env가 이미 채워져 있다고 가정.
const { Pool, types } = pg;

// NUMERIC (OID 1700)는 기본적으로 string으로 반환됨 — 큰 정밀도 손실 방지가 목적.
// 우리 금액 컬럼들(NUMERIC(12,2))은 JS Number 범위 안에서 충분히 안전하니 number로 받음.
// 이렇게 두지 않으면 모든 라우터/프론트에서 매번 Number() 변환을 반복해야 함.
types.setTypeParser(1700, (v) => v === null ? null : parseFloat(v));

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
}

export const pool = new Pool({
  connectionString,
});

export async function pingDB() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}

