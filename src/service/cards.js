import { Router } from "express";
import { pool } from "../utils/db.js";
import { fetchPsaLookupAndImages } from "../utils/psaClient.js";
import { validateImageInput } from "../utils/imageValidator.js";
import { sendError } from "../utils/httpError.js";
import { slotsOf } from "../utils/galleryConfig.js";

const router = Router();

/**
 * @openapi
 * /api/cards:
 *   get:
 *     summary: 카드 목록 조회
 *     tags:
 *       - Cards
 *     responses:
 *       200:
 *         description: 카드 리스트를 반환합니다.
 */
router.get("/", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, subject, year, set_name AS "setName", card_number AS "cardNumber",
              variety, category, grade, grader, cert_number AS "certNumber",
              image_url AS "imageUrl", current_price AS "currentPrice",
              certification_type AS "certificationType",
              is_hologram AS "isHologram",
              is_reverse_barcode AS "isReverseBarcode",
              psa_cert AS "psaCert",
              psa_population AS "psaPopulation",
              psa_images AS "psaImages",
              purchase_price AS "purchasePrice",
              is_rare AS "isRare",
              gallery_section_id AS "sectionId",
              gallery_order AS "galleryOrder"
       FROM cards
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/cards error", err);
    sendError(res, 500, "failed_to_fetch_cards");
  }
});

/**
 * @openapi
 * /api/cards/{id}:
 *   get:
 *     summary: 카드 단건 조회
 *     tags:
 *       - Cards
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 카드 정보 반환
 *       404:
 *         description: 카드를 찾을 수 없음
 */
router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return sendError(res, 400, "invalid_id");
  try {
    const { rows } = await pool.query(
      `SELECT id, subject, year, set_name AS "setName", card_number AS "cardNumber",
              variety, category, grade, grader, cert_number AS "certNumber",
              image_url AS "imageUrl", current_price AS "currentPrice",
              certification_type AS "certificationType",
              is_hologram AS "isHologram",
              is_reverse_barcode AS "isReverseBarcode",
              psa_cert AS "psaCert",
              psa_population AS "psaPopulation",
              psa_images AS "psaImages",
              purchase_price AS "purchasePrice",
              is_rare AS "isRare",
              gallery_section_id AS "sectionId",
              gallery_order AS "galleryOrder"
       FROM cards WHERE id = $1`,
      [id]
    );
    if (!rows.length) return sendError(res, 404, "card_not_found");
    res.json(rows[0]);
  } catch (err) {
    console.error(`GET /api/cards/${id} error`, err);
    sendError(res, 500, "failed_to_fetch_card");
  }
});

/**
 * @openapi
 * /api/cards:
 *   post:
 *     summary: 새 카드 등록
 *     tags:
 *       - Cards
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               subject:
 *                 type: string
 *               year:
 *                 type: string
 *               setName:
 *                 type: string
 *               cardNumber:
 *                 type: string
 *               variety:
 *                 type: string
 *               category:
 *                 type: string
 *               grade:
 *                 type: string
 *               grader:
 *                 type: string
 *               certNumber:
 *                 type: string
 *               imageUrl:
 *                 type: string
 *     responses:
 *       201:
 *         description: 생성된 카드의 id를 반환합니다.
 */
router.post("/", async (req, res) => {
  const {
    subject,
    year,
    setName,
    cardNumber,
    variety,
    category,
    grade,
    grader,
    certNumber,
    imageUrl,
    certificationType,
    isHologram,
    isReverseBarcode,
    psaCert,
    psaPopulation,
    psaImages,
    dnaCert,
  } = req.body || {};

  if (!subject || !year || !setName || !cardNumber) {
    return sendError(res, 400, "missing_required_fields");
  }

  // 사용자 입력 imageUrl만 검증 (PSA front image는 신뢰할 수 있는 출처).
  let validatedUserImage = null;
  if (imageUrl) {
    const v = validateImageInput(imageUrl);
    if (!v.ok) {
      return sendError(res, 400, v.error, v.limit ? { limit: v.limit } : {});
    }
    validatedUserImage = v.value;
  }

  const toJsonb = (v) =>
    v === undefined || v === null ? null : JSON.stringify(v);

  try {
    const normalizedPsaImages =
      Array.isArray(psaImages) ? psaImages : psaImages ? [psaImages] : null;
    const frontImageFromPsa =
      normalizedPsaImages?.find?.((x) => x && x.IsFrontImage)?.ImageURL || null;
    const finalImageUrl = validatedUserImage || frontImageFromPsa || null;

    const result = await pool.query(
      `INSERT INTO cards
       (subject, year, set_name, card_number, variety, category, grade, grader, cert_number, image_url,
        certification_type, is_hologram, is_reverse_barcode, psa_cert, psa_population, psa_images, dna_cert)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
               $11,$12,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb)
       RETURNING id`,
      [
        subject,
        year,
        setName,
        cardNumber,
        variety || null,
        category || null,
        grade || null,
        grader || null,
        certNumber || null,
        finalImageUrl,
        certificationType || null,
        isHologram || null,
        isReverseBarcode || null,
        toJsonb(psaCert || null),
        toJsonb(psaPopulation || null),
        toJsonb(normalizedPsaImages),
        toJsonb(dnaCert || null),
      ]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error("POST /api/cards error", err);
    sendError(res, 500, "failed_to_create_card");
  }
});

/**
 * @openapi
 * /api/cards/auto:
 *   post:
 *     summary: Cert 번호로 자동 등록(PSA)
 *     tags:
 *       - Cards
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               certNumber:
 *                 type: string
 *                 example: "119219658"
 *               certificationType:
 *                 type: string
 *                 example: "PSA"
 *     responses:
 *       201:
 *         description: 생성된 카드의 id를 반환
 */
router.post("/auto", async (req, res) => {
  const body = req.body || {};
  const certNumber = body.certNumber ?? body.CertNumber;
  const certificationType =
    body.certificationType ?? body.CertificationType ?? "PSA";
  const psaToken = process.env.PSA_TOKEN ?? null;

  if (!certNumber) return sendError(res, 400, "missing_certNumber");
  if (!psaToken) return sendError(res, 500, "psa_token_not_configured");
  if (String(certificationType).toUpperCase() !== "PSA") {
    return sendError(res, 400, "only_psa_supported");
  }

  try {
    // 빠른 사전 체크 — UNIQUE 제약이 race condition도 잡아주지만 사용자 친화 메시지를 위해.
    const certStr = String(certNumber);
    const { rows: existing } = await pool.query(
      "SELECT id FROM cards WHERE cert_number = $1",
      [certStr]
    );
    if (existing.length) return sendError(res, 409, "cert_already_exists", { existingId: existing[0].id });

    const { psaLookup, psaImages } =
      await fetchPsaLookupAndImages(certNumber, psaToken);

    const psaCert = psaLookup.PSACert || {};
    const psaPopulation = psaLookup.PSAPopulation || null;

    // 저(低)Population 카드는 동일 등급 표본이 적어 시세 책정이 어렵다.
    // 등록 시점에 무료 PSA API의 TotalPopulation(이 등급의 개체수)을 보고 임계값 이하이면
    // 희소(is_rare)로 표시 → 자동 시세 수집을 건너뛴다(rare_card_blocked, force=1로 우회 가능).
    // PSA API의 Population 값은 문자열("18")이라 parseInt 필요.
    const RARE_POP_THRESHOLD = Number(process.env.RARE_POP_THRESHOLD) || 5;
    const totalPop = parseInt(psaPopulation?.TotalPopulation, 10);
    const isLowPop = Number.isFinite(totalPop) && totalPop <= RARE_POP_THRESHOLD;

    const normalizedPsaImages = Array.isArray(psaImages)
      ? psaImages
      : psaImages
      ? [psaImages]
      : null;
    const frontImageFromPsa =
      normalizedPsaImages?.find?.((x) => x && x.IsFrontImage)?.ImageURL || null;

    const toJsonb = (v) =>
      v === undefined || v === null ? null : JSON.stringify(v);

    const result = await pool.query(
      `INSERT INTO cards
       (subject, year, set_name, card_number, variety, category, grade, grader, cert_number, image_url,
        certification_type, is_hologram, is_reverse_barcode, psa_cert, psa_population, psa_images, dna_cert, is_rare)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
               $11,$12,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18)
       RETURNING id`,
      [
        psaCert.Subject || "UNKNOWN",
        psaCert.Year || "0000",
        psaCert.SetName || "UNKNOWN",
        psaCert.CardNumber || "UNKNOWN",
        psaCert.Variety || null,
        psaCert.Category || null,
        psaCert.GradeDescription || psaCert.Grade || null,
        "PSA",
        String(certNumber),
        frontImageFromPsa,
        psaLookup.CertificationType || "PSA",
        psaLookup.IsHologram ?? null,
        psaLookup.IsReverseBarcode ?? null,
        toJsonb(psaCert || null),
        toJsonb(psaPopulation),
        toJsonb(normalizedPsaImages),
        toJsonb(psaLookup.DNACert ?? null),
        isLowPop,
      ]
    );
    if (isLowPop) {
      console.log(`[auto] card ${result.rows[0].id} TotalPopulation=${totalPop}<=${RARE_POP_THRESHOLD} → 희소(is_rare) 자동 등록, 시세 수집 생략`);
    }
    res.status(201).json({
      id: result.rows[0].id,
      isRare: isLowPop,
      totalPopulation: Number.isFinite(totalPop) ? totalPop : null,
      ...(isLowPop ? { autoRareReason: "low_population" } : {}),
    });
  } catch (err) {
    console.error("POST /api/cards/auto error", err);
    // 내부 에러 메시지를 클라이언트에 그대로 노출하지 않음 (토큰/스택 누출 위험).
    // PSA가 명확한 404를 돌려준 경우만 사용자에게 신호.
    const isPsaNotFound = /404|not\s*found/i.test(err.message || "");
    // PostgreSQL UNIQUE 위반 (23505) 도 핸들링 — P2-25 cert_number UNIQUE 제약 도입 후를 대비
    if (err.code === "23505") return sendError(res, 409, "cert_already_exists");
    sendError(res, isPsaNotFound ? 404 : 502, isPsaNotFound ? "psa_cert_not_found" : "psa_lookup_failed");
  }
});

/**
 * @openapi
 * /api/cards/{id}:
 *   delete:
 *     summary: 카드 삭제
 *     tags:
 *       - Cards
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: 삭제할 카드의 ID
 *     responses:
 *       204:
 *         description: 카드가 삭제되었습니다.
 *       404:
 *         description: 카드를 찾을 수 없습니다.
 *       500:
 *         description: 카드 삭제에 실패했습니다.
 */
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return sendError(res, 400, "invalid_id");
  try {
    const result = await pool.query(
      "DELETE FROM cards WHERE id = $1 RETURNING id",
      [id]
    );
    if (result.rows.length === 0) return sendError(res, 404, "card_not_found");
    res.status(200).json({ id: result.rows[0].id });
  } catch (err) {
    console.error("DELETE /api/cards/:id error", err);
    sendError(res, 500, "failed_to_delete_card");
  }
});

/**
 * @openapi
 * /api/cards/{id}/image:
 *   patch:
 *     summary: 카드 이미지 URL 업데이트
 *     tags:
 *       - Cards
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               imageUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: 업데이트된 카드 id 반환
 */
router.patch("/:id/purchase-price", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return sendError(res, 400, "invalid_id");
  const { purchasePrice } = req.body || {};

  const price = purchasePrice === null || purchasePrice === "" ? null : Number(purchasePrice);
  if (purchasePrice !== null && purchasePrice !== "" && isNaN(price)) {
    return sendError(res, 400, "invalid_purchase_price");
  }

  try {
    const result = await pool.query(
      "UPDATE cards SET purchase_price = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
      [price, id]
    );
    if (result.rows.length === 0) return sendError(res, 404, "card_not_found");
    res.status(200).json({ id: result.rows[0].id, purchasePrice: price });
  } catch (err) {
    console.error("PATCH /api/cards/:id/purchase-price error", err);
    sendError(res, 500, "failed_to_update_purchase_price");
  }
});

/**
 * @openapi
 * /api/cards/{id}/rare-flag:
 *   patch:
 *     summary: 희소 카드(1/1, SSP) 플래그 토글 — true면 자동 시세 수집 차단
 *     tags:
 *       - Cards
 */
router.patch("/:id/rare-flag", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return sendError(res, 400, "invalid_id");
  const { isRare } = req.body || {};
  if (typeof isRare !== "boolean") return sendError(res, 400, "invalid_isRare");
  try {
    const result = await pool.query(
      "UPDATE cards SET is_rare = $1, updated_at = NOW() WHERE id = $2 RETURNING id, is_rare",
      [isRare, id]
    );
    if (result.rows.length === 0) return sendError(res, 404, "card_not_found");
    res.json({ id: result.rows[0].id, isRare: result.rows[0].is_rare });
  } catch (err) {
    console.error("PATCH /api/cards/:id/rare-flag error", err);
    sendError(res, 500, "failed_to_update_rare_flag");
  }
});

/**
 * @openapi
 * /api/cards/{id}/section:
 *   patch:
 *     summary: 카드를 갤러리 섹션에 할당 / 해제
 *     tags:
 *       - Cards
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sectionId:
 *                 type: integer
 *                 nullable: true
 *                 description: null이면 Uncurated로 이동
 */
router.patch("/:id/section", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return sendError(res, 400, "invalid_id");
  const raw = req.body?.sectionId;
  const sectionId = raw == null ? null : parseInt(raw, 10);
  if (raw != null && (isNaN(sectionId) || sectionId <= 0)) {
    return sendError(res, 400, "invalid_sectionId");
  }

  try {
    let nextOrder = 0;
    if (sectionId !== null) {
      // 대상 섹션의 슬롯 수 vs 현재 진열 카드 수 (이동하는 카드 본인은 제외)
      const { rows: sec } = await pool.query(
        `SELECT frame_layout AS "frameLayout" FROM gallery_sections WHERE id = $1`,
        [sectionId]
      );
      if (!sec.length) return sendError(res, 404, "section_not_found");
      const totalSlots = slotsOf(sec[0].frameLayout);

      const { rows: countRow } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM cards
         WHERE gallery_section_id = $1 AND id <> $2`,
        [sectionId, id]
      );
      if (countRow[0].n >= totalSlots) {
        return sendError(res, 409, "frame_full", {
          message: `이 프레임은 ${totalSlots}장만 수용합니다. 먼저 카드를 빼주세요.`,
          totalSlots,
        });
      }

      const { rows } = await pool.query(
        `SELECT COALESCE(MAX(gallery_order), -1) + 1 AS "nextOrder"
         FROM cards WHERE gallery_section_id = $1`,
        [sectionId]
      );
      nextOrder = rows[0].nextOrder;
    }
    const result = await pool.query(
      `UPDATE cards
         SET gallery_section_id = $1, gallery_order = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, gallery_section_id AS "sectionId", gallery_order AS "galleryOrder"`,
      [sectionId, nextOrder, id]
    );
    if (!result.rows.length) return sendError(res, 404, "card_not_found");
    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /api/cards/:id/section error", err);
    sendError(res, 500, "failed_to_assign_section");
  }
});

router.patch("/:id/image", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return sendError(res, 400, "invalid_id");
  const { imageUrl } = req.body || {};

  const validation = validateImageInput(imageUrl);
  if (!validation.ok) {
    return sendError(res, 400, validation.error, validation.limit ? { limit: validation.limit } : {});
  }

  try {
    const result = await pool.query(
      "UPDATE cards SET image_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
      [validation.value, id]
    );
    if (result.rows.length === 0) return sendError(res, 404, "card_not_found");
    res.status(200).json({ id: result.rows[0].id });
  } catch (err) {
    console.error("PATCH /api/cards/:id/image error", err);
    sendError(res, 500, "failed_to_update_image");
  }
});

export default router;
