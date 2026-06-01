import { Router } from "express";
import { chat } from "../utils/ollamaClient.js";
import { sendError } from "../utils/httpError.js";

const router = Router();

/**
 * POST /api/llm-test/chat
 * Body: { message: string, systemPrompt?: string, model?: string, temperature?: number }
 * 단건 응답 — 전체 텍스트를 JSON으로 반환.
 */
router.post("/chat", async (req, res) => {
  const { message, systemPrompt, model, temperature } = req.body || {};
  if (!message) return sendError(res, 400, "message_required");

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: message });

  const startMs = Date.now();
  try {
    const reply = await chat(messages, { model, temperature });
    res.json({
      ok: true,
      reply,
      model: model || process.env.OLLAMA_MODEL || "kimi-k2.6:cloud",
      elapsedMs: Date.now() - startMs,
    });
  } catch (err) {
    console.error("[llm-test] chat error", err);
    sendError(res, 502, "llm_error", err.message);
  }
});

/**
 * POST /api/llm-test/stream
 * kimi-k2 계열 모델은 스트리밍 시 reasoning만 흘리고 content는 비스트리밍으로만 옴.
 * → reasoning을 SSE로 실시간 전송하고, 완료 후 content를 별도 chat 호출로 가져와 함께 반환.
 * 이벤트 형식:
 *   data: {"type":"reasoning","text":"..."}
 *   data: {"type":"content","text":"...전체 답변..."}
 *   data: [DONE]
 */
router.post("/stream", async (req, res) => {
  const { message, systemPrompt, model, temperature } = req.body || {};
  if (!message) return sendError(res, 400, "message_required");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: message });

  try {
    const { getClient } = await import("../utils/ollamaClient.js");
    // reasoning 스트리밍
    const stream = await getClient().chat.completions.create(
      { model: model ?? process.env.OLLAMA_MODEL, messages, temperature: temperature ?? 0.7, stream: true },
      { timeout: 120_000 }
    );
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      const token = delta?.reasoning;
      if (token) res.write(`data: ${JSON.stringify({ type: "reasoning", text: token })}\n\n`);
    }

    // 최종 content는 비스트리밍으로
    const reply = await chat(messages, { model, temperature });
    res.write(`data: ${JSON.stringify({ type: "content", text: reply })}\n\n`);
    res.write("data: [DONE]\n\n");
  } catch (err) {
    console.error("[llm-test] stream error", err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
