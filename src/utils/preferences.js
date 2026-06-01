import { pool } from "./db.js";

/**
 * 단일 사용자 설정 기본값.
 * DB user_preferences 에 키가 없으면 이 값을 사용한다.
 */
export const DEFAULT_PREFERENCES = {
  // 표시 / 포맷
  currency: "USD",                // USD | KRW | JPY
  currencyDecimals: 0,            // 0 | 2
  defaultSort: "value",          // value | subject | year
  language: "ko",                // ko | en

  // 테마 / UI
  goldTone: "#d4af37",
  priceUpColor: "#4caf50",
  priceDownColor: "#f44336",

  // 통화 환율 — 시세는 USD로 수집되므로, 비USD 표시는 이 환율로 환산한다 (1 USD 당).
  exchangeRates: { KRW: 1350, JPY: 155 },

  // 데이터 수집
  cacheWindowHours: 1,           // 스냅샷 캐시 윈도우 (시간)
  portfolioChangeWindowHours: 6, // 변화율 계산 기준 (시간)
};

// 화이트리스트 — 알 수 없는 키는 저장 거부
export const PREFERENCE_KEYS = Object.keys(DEFAULT_PREFERENCES);

/**
 * 전체 설정 반환 (DB 값 + 기본값 머지).
 */
export async function getAllPreferences() {
  const { rows } = await pool.query("SELECT key, value FROM user_preferences");
  const stored = {};
  for (const row of rows) {
    stored[row.key] = row.value;
  }
  return { ...DEFAULT_PREFERENCES, ...stored };
}

/**
 * 단일 설정값 반환 (DB → 기본값 폴백).
 * @param {string} key
 */
export async function getPreference(key) {
  const { rows } = await pool.query(
    "SELECT value FROM user_preferences WHERE key = $1",
    [key]
  );
  if (rows.length) return rows[0].value;
  return DEFAULT_PREFERENCES[key];
}

/**
 * 부분 업데이트 — { key: value, ... } 를 UPSERT.
 * 화이트리스트에 없는 키는 무시한다.
 * @param {Record<string, any>} patch
 * @returns {Promise<string[]>} 실제로 반영된 키 목록
 */
export async function setPreferences(patch) {
  const applied = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!PREFERENCE_KEYS.includes(key)) continue;
    await pool.query(
      `INSERT INTO user_preferences (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
    applied.push(key);
  }
  return applied;
}
