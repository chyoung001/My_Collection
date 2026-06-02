import { Router } from "express";
import { pool } from "../utils/db.js";
import { scrape130point } from "../utils/pointScraper.js";
import { scrapePsaCert, toSnapshotResult } from "../utils/psaScraper.js";
import { sendError } from "../utils/httpError.js";
import { getPreference } from "../utils/preferences.js";

const router = Router();

/**
 * @openapi
 * /api/snapshots/latest:
 *   get:
 *     summary: 전체 카드의 최신 시세 스냅샷 조회
 *     tags:
 *       - Snapshots
 *     responses:
 *       200:
 *         description: 카드별 최신 시세 스냅샷 1건씩 반환
 */
router.get("/summary", async (_req, res) => {
  try {
    // 변화율 계산 기준 윈도우 — 설정값(시간) 기반
    const changeWindowHours = Number(await getPreference("portfolioChangeWindowHours")) || 6;
    const changeWindowMs = changeWindowHours * 60 * 60 * 1000;

    // 카드별 최신 스냅샷으로 포트폴리오 합산
    const { rows } = await pool.query(`
      WITH latest AS (
        SELECT DISTINCT ON (card_id)
          card_id, avg_price, fetched_at
        FROM market_snapshots
        ORDER BY card_id, fetched_at DESC
      ),
      prev AS (
        SELECT DISTINCT ON (card_id)
          card_id, avg_price
        FROM market_snapshots
        WHERE fetched_at < NOW() - ($1 || ' milliseconds')::interval
        ORDER BY card_id, fetched_at DESC
      )
      SELECT
        COUNT(l.card_id)::int                              AS "snapshotCount",
        COALESCE(SUM(l.avg_price), 0)                     AS "totalMarketValue",
        COALESCE(AVG(l.avg_price), 0)                     AS "avgMarketPrice",
        MAX(l.avg_price)                                   AS "maxMarketPrice",
        MIN(l.fetched_at)                                  AS "oldestSnapshot",
        MAX(l.fetched_at)                                  AS "latestSnapshot",
        COALESCE(
          ROUND(
            (SUM(l.avg_price) - SUM(COALESCE(p.avg_price, l.avg_price)))
            / NULLIF(SUM(COALESCE(p.avg_price, l.avg_price)), 0) * 100,
          2),
        0)                                                 AS "portfolioChangePercent"
      FROM latest l
      LEFT JOIN prev p ON p.card_id = l.card_id
    `, [changeWindowMs]);
    res.json(rows[0]);
  } catch (err) {
    console.error("GET /api/snapshots/summary error", err);
    sendError(res, 500, "failed_to_fetch_snapshot_summary");
  }
});

/**
 * @openapi
 * /api/snapshots/latest:
 *   get:
 *     summary: 전체 카드의 최신 시세 스냅샷 조회
 *     tags:
 *       - Snapshots
 *     responses:
 *       200:
 *         description: 카드별 최신 시세 스냅샷 1건씩 반환
 */
router.get("/latest", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (ms.card_id)
        ms.card_id      AS "cardId",
        ms.avg_price    AS "avgPrice",
        ms.min_price    AS "minPrice",
        ms.max_price    AS "maxPrice",
        ms.median_price AS "medianPrice",
        ms.ebay_count   AS "saleCount",
        ms.query,
        ms.fetched_at   AS "fetchedAt",
        ms.items->>'confidence'          AS "confidenceJson",
        ms.items->>'priceSource'         AS "priceSource",
        ms.items->>'representativePrice' AS "representativePrice",
        c.subject,
        c.year,
        c.set_name      AS "setName",
        c.grade,
        c.grader,
        c.image_url     AS "imageUrl"
      FROM market_snapshots ms
      JOIN cards c ON c.id = ms.card_id
      ORDER BY ms.card_id, ms.fetched_at DESC
    `);
    // confidenceJson은 text → 파싱해서 객체로 내려보냄
    const out = rows.map((r) => {
      const { confidenceJson, representativePrice, ...rest } = r;
      return {
        ...rest,
        confidence: confidenceJson ? safeJsonParse(confidenceJson) : null,
        representativePrice: representativePrice != null ? Number(representativePrice) : null,
      };
    });
    res.json(out);
  } catch (err) {
    console.error("GET /api/snapshots/latest error", err);
    sendError(res, 500, "failed_to_fetch_snapshots");
  }
});

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * @openapi
 * /api/snapshots/{cardId}/history:
 *   get:
 *     summary: 특정 카드의 가격 이력 조회 (차트용)
 *     tags:
 *       - Snapshots
 *     parameters:
 *       - name: cardId
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: 시간순 시세 이력 반환 (오래된 순)
 */
router.get("/:cardId/history", async (req, res) => {
  const cardId = parseInt(req.params.cardId, 10);
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

  if (!cardId || isNaN(cardId)) return sendError(res, 400, "invalid_card_id");

  try {
    const { rows } = await pool.query(
      `SELECT
         avg_price                       AS "avgPrice",
         min_price                       AS "minPrice",
         max_price                       AS "maxPrice",
         median_price                    AS "medianPrice",
         ebay_count                      AS "saleCount",
         fetched_at                      AS "fetchedAt",
         items->'confidence'             AS "confidence",
         items->>'priceSource'           AS "priceSource",
         items->'lastSale'               AS "lastSale",
         items->>'representativePrice'   AS "representativePrice",
         items->'estimateRange'          AS "estimateRange",
         items->>'source'                AS "source",
         items->'population'             AS "population"
       FROM market_snapshots
       WHERE card_id = $1
       ORDER BY fetched_at DESC
       LIMIT $2`,
      [cardId, limit]
    );
    // representativePrice는 text → number
    const out = rows.map((r) => ({
      ...r,
      representativePrice: r.representativePrice != null ? Number(r.representativePrice) : null,
    })).reverse(); // 오래된 순 (차트용)
    res.json(out);
  } catch (err) {
    console.error(`GET /api/snapshots/${cardId}/history error`, err);
    sendError(res, 500, "failed_to_fetch_history");
  }
});

/**
 * @openapi
 * /api/snapshots/{cardId}/fetch:
 *   post:
 *     summary: 130point.com에서 특정 카드 시세 수집
 *     tags:
 *       - Snapshots
 *     parameters:
 *       - name: cardId
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 수집된 시세 데이터 반환
 *       404:
 *         description: 카드를 찾을 수 없음
 */
router.post("/:cardId/fetch", async (req, res) => {
  const cardId = parseInt(req.params.cardId, 10);
  if (!cardId || isNaN(cardId)) return sendError(res, 400, "invalid_card_id");
  const force = req.query.force === "1" || req.query.force === "true";

  // 카드 정보 조회
  let card;
  try {
    const { rows } = await pool.query(
      `SELECT id, subject, year, set_name, card_number, variety, grader, grade, is_rare, cert_number
       FROM cards WHERE id = $1`,
      [cardId]
    );
    if (!rows.length) return sendError(res, 404, "card_not_found");
    card = rows[0];
  } catch (err) {
    console.error("fetch: DB 조회 실패", err);
    return sendError(res, 500, "db_error");
  }

  // 희소 카드(1/1·SSP)는 자동 수집이 거의 의미 없으므로 차단. ?force=1로 우회 가능.
  if (card.is_rare && !force) {
    return sendError(res, 409, "rare_card_blocked");
  }

  // 캐싱: 설정된 윈도우(기본 1시간) 안에 수집된 스냅샷이 있으면 ZenRows 호출 안 하고 그것을 반환.
  // ZenRows 크레딧 소모 방지가 목적. ?force=1로 우회 가능.
  const cacheWindowHours = Number(await getPreference("cacheWindowHours")) || 1;
  const CACHE_WINDOW_MS = cacheWindowHours * 60 * 60 * 1000;
  if (!force) {
    try {
      const { rows: recent } = await pool.query(
        `SELECT
           query, ebay_count, avg_price, min_price, max_price, median_price,
           fetched_at,
           items
         FROM market_snapshots
         WHERE card_id = $1 AND fetched_at > NOW() - ($2 || ' milliseconds')::interval
         ORDER BY fetched_at DESC
         LIMIT 1`,
        [cardId, CACHE_WINDOW_MS]
      );
      if (recent.length) {
        const snap = recent[0];
        const ageSec = Math.floor((Date.now() - new Date(snap.fetched_at).getTime()) / 1000);
        console.log(`[fetch] card_id=${cardId} cache HIT (age=${ageSec}s) — ZenRows 호출 생략`);
        return res.json({
          cardId,
          cached: true,
          cachedAgeSeconds: ageSec,
          source:              snap.items?.source ?? "130point",
          query:               snap.query,
          representativePrice: snap.items?.representativePrice != null
            ? Number(snap.items.representativePrice) : null,
          priceSource:         snap.items?.priceSource ?? null,
          avgPrice:            snap.avg_price,
          minPrice:            snap.min_price,
          maxPrice:            snap.max_price,
          medianPrice:         snap.median_price,
          saleCount:           snap.ebay_count,
          sourceUrl:           snap.items?.sourceUrl ?? null,
          recentSales:         snap.items?.recentSales ?? [],
          lastSale:            snap.items?.lastSale ?? null,
          confidence:          snap.items?.confidence ?? null,
          filterStats:         snap.items?.filterStats ?? null,
          population:          snap.items?.population ?? null,
          estimateRange:       snap.items?.estimateRange ?? null,
        });
      }
    } catch (err) {
      // 캐시 조회 실패는 치명적이지 않으므로 로그만 남기고 진행
      console.warn("fetch: 캐시 조회 실패 (계속 진행)", err.message);
    }
  }

  // 시세 수집: PSA 등급 카드는 PSA Estimate 우선, 없으면 130point 폴백.
  // psaData는 estimate 유무와 무관하게 Population 갱신에 재사용한다(같은 1회 스크래핑에서 얻음).
  let result;
  let psaData = null;
  const isPsaCard = card.grader === "PSA" && card.cert_number;
  if (isPsaCard) {
    try {
      psaData = await scrapePsaCert(card);
      result = toSnapshotResult(psaData, card); // estimate 없으면 null
      if (result) {
        console.log(
          `[fetch] card_id=${cardId} PSA Estimate=$${result.representativePrice} ` +
          `(${result.confidence.psaConfidence ?? "?"})`
        );
      } else {
        console.log(`[fetch] card_id=${cardId} PSA Estimate 없음 → 130point 폴백`);
      }
    } catch (err) {
      console.warn(`[fetch] PSA 스크래핑 실패 card_id=${cardId} → 130point 폴백:`, err.message);
    }
  }

  // PSA에서 가격을 못 얻었으면 130point 스크래핑
  if (!result) {
    try {
      result = await scrape130point(card);
      result.source = "130point";
    } catch (err) {
      console.error(`fetch: 스크래핑 실패 card_id=${cardId}`, err.message);
      return sendError(res, 502, "scraping_failed");
    }
  }

  // market_snapshots 저장 + cards.current_price 갱신을 트랜잭션으로 묶음.
  // 중간 실패 시 두 테이블이 어긋나지 않게.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO market_snapshots
         (card_id, query, ebay_count, avg_price, min_price, max_price, median_price, items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        cardId,
        result.query,
        result.saleCount,
        result.avgPrice,
        result.minPrice,
        result.maxPrice,
        result.medianPrice,
        JSON.stringify({
          recentSales: result.recentSales,
          sourceUrl: result.sourceUrl,
          filterStats: result.filterStats,
          confidence: result.confidence,
          priceSource: result.priceSource,
          lastSale: result.lastSale,
          representativePrice: result.representativePrice,
          source: result.source ?? "130point",
          population: result.population ?? (psaData
            ? { totalPopulation: psaData.totalPopulation, populationHigher: psaData.populationHigher }
            : null),
          estimateRange: result.estimateRange ?? null,
        }),
      ]
    );

    // current_price는 평균이 아닌 대표 가격(representativePrice) 사용.
    // 표본이 충분하면 중앙값, 표본 적으면 마지막 거래가가 들어감.
    const repPrice = result.representativePrice ?? result.avgPrice;
    if (repPrice) {
      await client.query(
        `UPDATE cards SET current_price = $1, updated_at = NOW() WHERE id = $2`,
        [repPrice, cardId]
      );
    }

    // PSA 페이지를 긁었으면 Population도 함께 갱신(estimate 유무·폴백 여부와 무관).
    // 키는 등록 시 PSA API가 채운 컨벤션(PascalCase)에 맞추고, jsonb 병합(||)으로
    // 기존의 다른 필드(TotalPopulationWithQualifier 등)는 보존한다.
    if (psaData && (psaData.totalPopulation != null || psaData.populationHigher != null)) {
      const popPatch = {};
      if (psaData.totalPopulation != null) popPatch.TotalPopulation = psaData.totalPopulation;
      if (psaData.populationHigher != null) popPatch.PopulationHigher = psaData.populationHigher;
      await client.query(
        `UPDATE cards
           SET psa_population = COALESCE(psa_population, '{}'::jsonb) || $1::jsonb,
               updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(popPatch), cardId]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("fetch: DB 저장 실패", err);
    return sendError(res, 500, "db_save_error");
  } finally {
    client.release();
  }

  console.log(
    `[fetch] card_id=${cardId} [${result.source ?? "130point"}] "${result.query}" → ` +
    `${result.priceSource}=$${result.representativePrice ?? "—"} ` +
    `(${result.saleCount != null ? `${result.saleCount}건, ` : ""}${result.confidence?.level ?? "?"})`
  );

  res.json({
    cardId,
    source:              result.source ?? "130point",
    query:               result.query,
    representativePrice: result.representativePrice,
    priceSource:         result.priceSource,
    avgPrice:            result.avgPrice,
    minPrice:            result.minPrice,
    maxPrice:            result.maxPrice,
    medianPrice:         result.medianPrice,
    saleCount:           result.saleCount,
    sourceUrl:           result.sourceUrl,
    recentSales:         result.recentSales,
    lastSale:            result.lastSale,
    confidence:          result.confidence,
    filterStats:         result.filterStats,
    population:          result.population ?? null,
    estimateRange:       result.estimateRange ?? null,
    _debug:              result._raw ? { rawHtml: result._raw } : undefined,
  });
});

export default router;
