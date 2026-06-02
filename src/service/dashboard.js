import { Router } from "express";
import { pool } from "../utils/db.js";
import { sendError } from "../utils/httpError.js";

const router = Router();

/**
 * @openapi
 * /api/dashboard/summary:
 *   get:
 *     summary: 포트폴리오 요약 정보 조회
 *     tags:
 *       - Dashboard
 *     responses:
 *       200:
 *         description: 총 카드 수, 총 가치, PSA 10 수, 등급별 분포를 반환합니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalCards:
 *                   type: integer
 *                 totalValue:
 *                   type: number
 *                 psa10Count:
 *                   type: integer
 *                 gradeDistribution:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       grade:
 *                         type: string
 *                       count:
 *                         type: integer
 */
router.get("/summary", async (req, res) => {
  try {
    // grade 매칭 — '%10%'는 "100" 같은 잘못된 값도 매치되므로 단어 경계로 정확화.
    // \m / \M = PostgreSQL의 word boundary
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int                                              AS "totalCards",
        COALESCE(SUM(current_price), 0)                           AS "totalValue",
        COUNT(*) FILTER (WHERE grade ~ '\\m10\\M')::int           AS "psa10Count"
      FROM cards
      WHERE sold_at IS NULL
    `);

    const { rows: dist } = await pool.query(`
      SELECT
        COALESCE(grade, 'N/A') AS grade,
        COUNT(*)::int          AS count
      FROM cards
      WHERE sold_at IS NULL
      GROUP BY grade
      ORDER BY count DESC
    `);

    res.json({
      ...rows[0],
      gradeDistribution: dist,
    });
  } catch (err) {
    console.error("GET /api/dashboard/summary error", err);
    sendError(res, 500, "failed_to_fetch_summary");
  }
});

/**
 * @openapi
 * /api/dashboard/top-cards:
 *   get:
 *     summary: 가치 상위 카드 목록 조회
 *     tags:
 *       - Dashboard
 *     parameters:
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           default: 5
 *           minimum: 1
 *           maximum: 20
 *         description: 반환할 카드 수 (기본 5, 최대 20)
 *     responses:
 *       200:
 *         description: current_price 기준 상위 N개 카드를 반환합니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   subject:
 *                     type: string
 *                   year:
 *                     type: string
 *                   setName:
 *                     type: string
 *                   grade:
 *                     type: string
 *                   currentPrice:
 *                     type: number
 *                   imageUrl:
 *                     type: string
 */
router.get("/top-cards", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);

  try {
    const { rows } = await pool.query(
      `SELECT
         id,
         subject,
         year,
         set_name    AS "setName",
         grade,
         current_price AS "currentPrice",
         image_url   AS "imageUrl"
       FROM cards
       WHERE current_price IS NOT NULL AND sold_at IS NULL
       ORDER BY current_price DESC
       LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/dashboard/top-cards error", err);
    sendError(res, 500, "failed_to_fetch_top_cards");
  }
});

/**
 * @openapi
 * /api/dashboard/top-gainer:
 *   get:
 *     summary: 최고가 카드 조회 (Top Gainer)
 *     tags:
 *       - Dashboard
 *     responses:
 *       200:
 *         description: current_price 기준 최고가 카드를 반환합니다. 가격 변동 이력이 없으므로 priceChange는 null입니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 subject:
 *                   type: string
 *                 year:
 *                   type: string
 *                 setName:
 *                   type: string
 *                 grade:
 *                   type: string
 *                 currentPrice:
 *                   type: number
 *                 imageUrl:
 *                   type: string
 *                 priceChange:
 *                   type: number
 *                   nullable: true
 *                   description: 가격 변동률(%). 이력 데이터 없으면 null.
 *       404:
 *         description: 등록된 카드가 없습니다.
 */
router.get("/top-gainer", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        subject,
        year,
        set_name      AS "setName",
        grade,
        current_price AS "currentPrice",
        image_url     AS "imageUrl"
      FROM cards
      WHERE current_price IS NOT NULL AND sold_at IS NULL
      ORDER BY current_price DESC
      LIMIT 1
    `);

    if (!rows.length) return sendError(res, 404, "no_cards_found");

    res.json({ ...rows[0], priceChange: null });
  } catch (err) {
    console.error("GET /api/dashboard/top-gainer error", err);
    sendError(res, 500, "failed_to_fetch_top_gainer");
  }
});

/**
 * @openapi
 * /api/dashboard/realized:
 *   get:
 *     summary: 실현 손익 요약 (판매된 카드 기준)
 *     tags:
 *       - Dashboard
 *     responses:
 *       200:
 *         description: 판매 카드 수, 총 판매대금, 실현 손익(구매가 있는 것만), 비율
 */
router.get("/realized", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE sold_at IS NOT NULL)::int                              AS "soldCount",
        COALESCE(SUM(sold_price) FILTER (WHERE sold_at IS NOT NULL), 0)               AS "totalProceeds",
        COALESCE(SUM(sold_price - purchase_price)
                 FILTER (WHERE sold_at IS NOT NULL AND purchase_price IS NOT NULL), 0) AS "realizedGain",
        COALESCE(SUM(purchase_price)
                 FILTER (WHERE sold_at IS NOT NULL AND purchase_price IS NOT NULL), 0) AS "realizedCostBasis"
      FROM cards
    `);
    const r = rows[0];
    const cost = Number(r.realizedCostBasis);
    const realizedPct = cost > 0 ? (Number(r.realizedGain) / cost) * 100 : null;
    res.json({ ...r, realizedPct });
  } catch (err) {
    console.error("GET /api/dashboard/realized error", err);
    sendError(res, 500, "failed_to_fetch_summary");
  }
});

export default router;
