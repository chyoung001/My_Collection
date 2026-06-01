import { Router } from "express";
import { pool } from "../utils/db.js";
import { sendError } from "../utils/httpError.js";
import { slotsOf, isValidLayout } from "../utils/galleryConfig.js";

const router = Router();

/**
 * @openapi
 * /api/gallery/sections:
 *   get:
 *     summary: 갤러리 섹션 목록 + 각 섹션의 카드 ID 배열 조회
 *     tags:
 *       - Gallery
 *     responses:
 *       200:
 *         description: 섹션 배열. 각 섹션에 cardIds 포함
 */
router.get("/sections", async (_req, res) => {
  try {
    const { rows: sections } = await pool.query(
      `SELECT id, name, display_order AS "displayOrder",
              frame_layout AS "frameLayout", created_at AS "createdAt"
       FROM gallery_sections
       ORDER BY display_order ASC, id ASC`
    );
    const { rows: cards } = await pool.query(
      `SELECT id, gallery_section_id AS "sectionId", gallery_order AS "galleryOrder"
       FROM cards
       WHERE gallery_section_id IS NOT NULL
       ORDER BY gallery_section_id, gallery_order ASC, id ASC`
    );
    // 섹션별로 cardIds 묶기
    const byId = new Map(sections.map((s) => [s.id, { ...s, cardIds: [] }]));
    for (const c of cards) {
      const sec = byId.get(c.sectionId);
      if (sec) sec.cardIds.push(c.id);
    }
    res.json([...byId.values()]);
  } catch (err) {
    console.error("GET /api/gallery/sections error", err);
    sendError(res, 500, "failed_to_fetch_sections");
  }
});

/**
 * @openapi
 * /api/gallery/sections:
 *   post:
 *     summary: 갤러리 섹션 생성
 *     tags:
 *       - Gallery
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: 생성된 섹션
 */
router.post("/sections", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const frameLayout = req.body?.frameLayout ?? "3x3";
  if (!name) return sendError(res, 400, "missing_name");
  if (name.length > 120) return sendError(res, 400, "name_too_long");
  if (!isValidLayout(frameLayout)) return sendError(res, 400, "invalid_frame_layout");

  try {
    const { rows: max } = await pool.query(
      `SELECT COALESCE(MAX(display_order), -1) + 1 AS "nextOrder" FROM gallery_sections`
    );
    const nextOrder = max[0].nextOrder;

    const { rows } = await pool.query(
      `INSERT INTO gallery_sections (name, display_order, frame_layout)
       VALUES ($1, $2, $3)
       RETURNING id, name, display_order AS "displayOrder", frame_layout AS "frameLayout"`,
      [name, nextOrder, frameLayout]
    );
    res.status(201).json({ ...rows[0], cardIds: [] });
  } catch (err) {
    console.error("POST /api/gallery/sections error", err);
    sendError(res, 500, "failed_to_create_section");
  }
});

/**
 * @openapi
 * /api/gallery/sections/{id}:
 *   patch:
 *     summary: 섹션 이름 변경
 */
router.patch("/sections/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return sendError(res, 400, "invalid_id");

  const updates = [];
  const params = [];
  let idx = 1;

  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return sendError(res, 400, "missing_name");
    if (name.length > 120) return sendError(res, 400, "name_too_long");
    updates.push(`name = $${idx++}`);
    params.push(name);
  }

  if (req.body?.frameLayout !== undefined) {
    const frameLayout = req.body.frameLayout;
    if (!isValidLayout(frameLayout)) return sendError(res, 400, "invalid_frame_layout");
    // 축소 변경 시 현재 카드 수 확인
    const { rows: countRow } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM cards WHERE gallery_section_id = $1`,
      [id]
    );
    const currentCount = countRow[0].n;
    const newSlots = slotsOf(frameLayout);
    if (currentCount > newSlots) {
      return sendError(res, 409, "frame_too_small", {
        message: `현재 ${currentCount}장이 진열중인데 ${frameLayout} 프레임은 ${newSlots}장만 수용합니다. 먼저 카드를 ${currentCount - newSlots}장 제거하세요.`,
        currentCount,
        newSlots,
      });
    }
    updates.push(`frame_layout = $${idx++}`);
    params.push(frameLayout);
  }

  if (!updates.length) return sendError(res, 400, "no_fields_to_update");

  try {
    params.push(id);
    const result = await pool.query(
      `UPDATE gallery_sections SET ${updates.join(", ")}, updated_at = NOW()
       WHERE id = $${idx}
       RETURNING id, name, frame_layout AS "frameLayout"`,
      params
    );
    if (!result.rows.length) return sendError(res, 404, "section_not_found");
    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /api/gallery/sections/:id error", err);
    sendError(res, 500, "failed_to_update_section");
  }
});

/**
 * @openapi
 * /api/gallery/sections/{id}:
 *   delete:
 *     summary: 섹션 삭제 (속한 카드는 Uncurated로 이동)
 */
router.delete("/sections/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return sendError(res, 400, "invalid_id");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // 소속 카드를 명시적으로 분리(Uncurated로 이동). FK ON DELETE SET NULL의 방어적 보강 —
    // FK 제약이 누락된 DB에서도 카드가 고아가 되지 않도록 보장한다.
    await client.query(
      `UPDATE cards SET gallery_section_id = NULL, gallery_order = 0 WHERE gallery_section_id = $1`,
      [id]
    );
    const result = await client.query(
      `DELETE FROM gallery_sections WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return sendError(res, 404, "section_not_found");
    }
    await client.query("COMMIT");
    res.json({ id: result.rows[0].id });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("DELETE /api/gallery/sections/:id error", err);
    sendError(res, 500, "failed_to_delete_section");
  } finally {
    client.release();
  }
});

/**
 * @openapi
 * /api/gallery/sections/order:
 *   patch:
 *     summary: 섹션 순서 일괄 변경
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               order:
 *                 type: array
 *                 items: { type: integer }
 *                 description: section id 배열 (앞이 위)
 */
router.patch("/sections/order", async (req, res) => {
  const order = req.body?.order;
  if (!Array.isArray(order) || !order.every((n) => Number.isInteger(n))) {
    return sendError(res, 400, "invalid_order_array");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < order.length; i++) {
      await client.query(
        `UPDATE gallery_sections SET display_order = $1, updated_at = NOW() WHERE id = $2`,
        [i, order[i]]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, count: order.length });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("PATCH /api/gallery/sections/order error", err);
    sendError(res, 500, "failed_to_reorder_sections");
  } finally {
    client.release();
  }
});

/**
 * @openapi
 * /api/gallery/sections/{id}/cards/add:
 *   post:
 *     summary: 섹션에 카드 여러 장 일괄 추가 (이미 다른 섹션에 있으면 이동)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cardIds:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200:
 *         description: 추가된 카드 개수
 */
router.post("/sections/:id/cards/add", async (req, res) => {
  const sectionId = parseInt(req.params.id, 10);
  if (!sectionId || isNaN(sectionId)) return sendError(res, 400, "invalid_section_id");
  const cardIds = req.body?.cardIds;
  if (!Array.isArray(cardIds) || cardIds.length === 0 || !cardIds.every((n) => Number.isInteger(n))) {
    return sendError(res, 400, "invalid_cardIds_array");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 섹션 존재 확인 + frame 슬롯 수 조회
    const { rows: sec } = await client.query(
      `SELECT id, frame_layout AS "frameLayout" FROM gallery_sections WHERE id = $1`,
      [sectionId]
    );
    if (!sec.length) {
      await client.query("ROLLBACK");
      return sendError(res, 404, "section_not_found");
    }
    const totalSlots = slotsOf(sec[0].frameLayout);

    // 현재 진열 카드 수 + 새로 들어올 카드 수가 슬롯을 초과하는지
    // ANY/ALL 배열 바인딩 — 빈 배열일 때도 안전하고 cardIds가 동적이라 문법 에러 없음
    const { rows: countRow } = await client.query(
      `SELECT COUNT(*)::int AS n FROM cards
       WHERE gallery_section_id = $1 AND id <> ALL($2::int[])`,
      [sectionId, cardIds]
    );
    const remainingExisting = countRow[0].n; // 이미 있고 추가 리스트엔 없는 카드들
    const addingCount = cardIds.length; // 추가 요청 (이동 포함)
    if (remainingExisting + addingCount > totalSlots) {
      await client.query("ROLLBACK");
      return sendError(res, 409, "frame_full", {
        message: `이 프레임은 ${totalSlots}장까지 수용합니다. 추가 가능: ${Math.max(0, totalSlots - remainingExisting)}장 (선택: ${addingCount}장)`,
        totalSlots,
        availableSlots: Math.max(0, totalSlots - remainingExisting),
        requested: addingCount,
      });
    }

    // 현재 섹션의 끝 순서 시작값
    const { rows: max } = await client.query(
      `SELECT COALESCE(MAX(gallery_order), -1) + 1 AS "nextOrder"
       FROM cards WHERE gallery_section_id = $1`,
      [sectionId]
    );
    let nextOrder = max[0].nextOrder;

    // 새로 추가되는 카드만 카운트 (이미 같은 섹션이면 패스)
    let added = 0;
    for (const cardId of cardIds) {
      const result = await client.query(
        `UPDATE cards
           SET gallery_section_id = $1, gallery_order = $2, updated_at = NOW()
         WHERE id = $3 AND (gallery_section_id IS DISTINCT FROM $1)
         RETURNING id`,
        [sectionId, nextOrder, cardId]
      );
      if (result.rows.length) {
        added++;
        nextOrder++;
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true, sectionId, added, requested: cardIds.length });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /api/gallery/sections/:id/cards/add error", err);
    sendError(res, 500, "failed_to_add_cards");
  } finally {
    client.release();
  }
});

/**
 * @openapi
 * /api/gallery/sections/{id}/cards:
 *   patch:
 *     summary: 섹션 내 카드 순서 일괄 설정 (드래그 정렬용)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cardIds:
 *                 type: array
 *                 items: { type: integer }
 */
router.patch("/sections/:id/cards", async (req, res) => {
  const sectionId = parseInt(req.params.id, 10);
  if (!sectionId || isNaN(sectionId)) return sendError(res, 400, "invalid_section_id");
  const cardIds = req.body?.cardIds;
  if (!Array.isArray(cardIds) || !cardIds.every((n) => Number.isInteger(n))) {
    return sendError(res, 400, "invalid_cardIds_array");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < cardIds.length; i++) {
      await client.query(
        `UPDATE cards SET gallery_section_id = $1, gallery_order = $2, updated_at = NOW()
         WHERE id = $3`,
        [sectionId, i, cardIds[i]]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, count: cardIds.length });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("PATCH /api/gallery/sections/:id/cards error", err);
    sendError(res, 500, "failed_to_reorder_cards");
  } finally {
    client.release();
  }
});

export default router;
