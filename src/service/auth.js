import { Router } from "express";

const router = Router();

/**
 * @openapi
 * /api/auth/check:
 *   post:
 *     summary: API 토큰 유효성 검증 (프론트엔드 "연결 테스트"용)
 *     description: >
 *       POST이므로 상위 requireToken 미들웨어를 거친다.
 *       이 핸들러에 도달했다는 것은 토큰이 유효하거나(또는 dev 환경에서 보호 비활성) 임을 의미한다.
 *       토큰 불일치/누락 시 401, production에서 API_TOKEN 미설정 시 503 이 미들웨어 단계에서 먼저 반환된다.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: 토큰 유효 (또는 dev 무인증 통과)
 *       401:
 *         description: 토큰 누락/불일치
 *       503:
 *         description: 서버에 API_TOKEN 미설정 (production)
 */
router.post("/check", (_req, res) => {
  // authRequired: 서버가 실제로 토큰을 요구하는 상태인지 알려준다.
  // (dev 무인증 통과 시 false → 프론트에서 "인증 불필요"로 안내 가능)
  res.json({ ok: true, authRequired: !!process.env.API_TOKEN });
});

export default router;
