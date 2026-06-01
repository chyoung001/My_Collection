import { Router } from "express";
import { sendError } from "../utils/httpError.js";
import {
  getAllPreferences,
  setPreferences,
  PREFERENCE_KEYS,
} from "../utils/preferences.js";

const router = Router();

/**
 * @openapi
 * /api/preferences:
 *   get:
 *     summary: 전체 사용자 설정 조회 (DB값 + 기본값 머지)
 *     tags: [Preferences]
 *     responses:
 *       200:
 *         description: 설정 객체 반환
 */
router.get("/", async (_req, res) => {
  try {
    const prefs = await getAllPreferences();
    res.json(prefs);
  } catch (err) {
    console.error("GET /api/preferences error", err);
    sendError(res, 500, "internal_error");
  }
});

/**
 * @openapi
 * /api/preferences:
 *   patch:
 *     summary: 사용자 설정 부분 업데이트 (UPSERT)
 *     tags: [Preferences]
 *     responses:
 *       200:
 *         description: 갱신 후 전체 설정 반환
 */
router.patch("/", async (req, res) => {
  const patch = req.body || {};
  if (typeof patch !== "object" || Array.isArray(patch)) {
    return sendError(res, 400, "invalid_request");
  }
  try {
    const applied = await setPreferences(patch);
    const prefs = await getAllPreferences();
    res.json({ applied, preferences: prefs });
  } catch (err) {
    console.error("PATCH /api/preferences error", err);
    sendError(res, 500, "internal_error");
  }
});

/**
 * @openapi
 * /api/preferences/health:
 *   get:
 *     summary: 외부 API 연결 상태 점검
 *     tags: [Preferences]
 *     responses:
 *       200:
 *         description: 각 외부 API의 configured/ok 상태 반환
 */
router.get("/health", async (_req, res) => {
  // configured: .env에 키가 채워져 있는가 (값은 노출하지 않음)
  // ok: 실제 연결/형식 검증 결과 (null = 미점검)
  const psaToken = process.env.PSA_TOKEN;
  const zenrowsKey = process.env.ZENROWS_API_KEY;
  const ebayId = process.env.EBAY_CLIENT_ID;
  const ebaySecret = process.env.EBAY_CLIENT_SECRET;
  const ollamaKey = process.env.OLLAMA_API_KEY;

  const health = {
    psa:     { label: "PSA API",            configured: !!psaToken,                ok: null },
    zenrows: { label: "ZenRows (130point)", configured: !!zenrowsKey,              ok: null },
    ebay:    { label: "eBay API",           configured: !!(ebayId && ebaySecret),  ok: null },
    ollama:  { label: "Ollama LLM",         configured: !!ollamaKey,               ok: null },
  };

  // Ollama: 실제 가벼운 호출로 연결 확인
  if (ollamaKey) {
    try {
      const { getClient } = await import("../utils/ollamaClient.js");
      await getClient().models.list();
      health.ollama.ok = true;
    } catch {
      health.ollama.ok = false;
    }
  }

  // PSA: 토큰 형식만 가볍게 확인 (실제 호출은 크레딧 소모 가능성 있어 생략)
  if (psaToken) health.psa.ok = psaToken.length > 20;

  res.json(health);
});

export default router;
