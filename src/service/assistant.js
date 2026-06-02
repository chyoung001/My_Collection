import { Router } from "express";
import { Ollama } from "ollama";
import { buildCollectionContext } from "../utils/collectionContext.js";
import { sendError } from "../utils/httpError.js";

const router = Router();

// 2-모델: 추론(thinking)은 kimi, 최종 답변은 일반 모델. env로 고정.
const REASONING_MODEL = process.env.OLLAMA_REASONING_MODEL || "kimi-k2.6:cloud";
const ANSWER_MODEL = process.env.OLLAMA_ANSWER_MODEL || "gemma4:31b";

let _client;
function getOllama() {
  if (_client) return _client;
  if (!process.env.OLLAMA_API_KEY) throw new Error("OLLAMA_API_KEY is not set");
  _client = new Ollama({
    host: process.env.OLLAMA_BASE_URL_NATIVE || "https://ollama.com",
    headers: { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` },
  });
  return _client;
}

// 그라운딩 시스템 프롬프트 — 모든 수치는 <data>에 선계산되어 있고, 모델은 인용만.
const systemPrompt = (ctx) =>
  `당신은 "My Collection" 카드 포트폴리오 앱의 AI 어시스턴트입니다.
아래 <data>의 사용자 컬렉션 데이터에만 근거해 한국어로 간결하고 실용적으로 답하세요.

규칙:
- 모든 수치(가치·손익·개수·비율)는 <data>에 이미 계산되어 있습니다. 그 값을 그대로 인용하고, 직접 계산하거나 추정하지 마세요.
- <data>에 없는 내용은 "해당 정보는 없습니다"라고 답하고 절대 지어내지 마세요.
- 금액은 <data>의 형식(통화 ${ctx.currency}) 그대로 쓰세요. 데이터 기준 시각: ${ctx.asOf || "없음"}.
- 표/불릿을 적절히 써서 읽기 쉽게.

<data>
요약: ${ctx.prose}
${JSON.stringify(ctx.json)}
</data>`;

const baseMessages = (ctx, question) => [
  { role: "system", content: systemPrompt(ctx) },
  { role: "user", content: question },
];

// kimi 추론 결과를 답변 모델 메시지에 합쳐줌
const answerMessages = (ctx, question, reasoning) =>
  reasoning
    ? [
        ...baseMessages(ctx, question),
        { role: "assistant", content: `[분석]\n${reasoning}` },
        { role: "user", content: "위 분석과 <data>에 근거해 사용자 질문에 한국어로 답하세요." },
      ]
    : baseMessages(ctx, question);

// 비스트리밍 2단계
async function runChat(ctx, question) {
  const o = getOllama();
  let reasoning = "";
  try {
    const r = await o.chat({ model: REASONING_MODEL, messages: baseMessages(ctx, question), think: true });
    reasoning = r.message?.thinking || "";
  } catch (e) {
    console.warn("[assistant] 추론 실패, 답변 모델만 사용:", e.message);
  }
  const a = await o.chat({ model: ANSWER_MODEL, messages: answerMessages(ctx, question, reasoning) });
  return { reply: a.message?.content || "", reasoning };
}

// SSE 2단계: kimi thinking → [reasoning], gemma 답변 → [content]
async function runStream(res, ctx, question) {
  const o = getOllama();
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  let reasoning = "";
  try {
    for await (const part of await o.chat({ model: REASONING_MODEL, messages: baseMessages(ctx, question), stream: true, think: true })) {
      const t = part.message?.thinking;
      if (t) { reasoning += t; send({ type: "reasoning", text: t }); }
    }
  } catch (e) {
    console.warn("[assistant] 추론 스트림 실패:", e.message);
  }

  for await (const part of await o.chat({ model: ANSWER_MODEL, messages: answerMessages(ctx, question, reasoning), stream: true })) {
    const t = part.message?.content;
    if (t) send({ type: "content", text: t });
  }
  send({ type: "done", asOf: ctx.asOf });
  res.write("data: [DONE]\n\n");
}

function openSse(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}

// POST /api/assistant/chat — 단건(비스트리밍)
router.post("/chat", async (req, res) => {
  const { message } = req.body || {};
  if (!message) return sendError(res, 400, "message_required");
  try {
    const ctx = await buildCollectionContext();
    const { reply, reasoning } = await runChat(ctx, message);
    res.json({ ok: true, reply, reasoning, asOf: ctx.asOf });
  } catch (err) {
    console.error("[assistant] chat error", err);
    sendError(res, 502, "assistant_error", { message: err.message });
  }
});

// POST /api/assistant/stream — SSE
router.post("/stream", async (req, res) => {
  const { message } = req.body || {};
  if (!message) return sendError(res, 400, "message_required");
  openSse(res);
  try {
    const ctx = await buildCollectionContext();
    await runStream(res, ctx, message);
  } catch (err) {
    console.error("[assistant] stream error", err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

// POST /api/assistant/insights — 입력 없이 자동 현황 요약(SSE)
const INSIGHTS_Q =
  "내 컬렉션의 현재 상태를 요약하고, 주목할 점(가장 가치 큰 카드·가장 많이 오른 카드·미실현/실현 손익)과 " +
  "다시 시세를 수집하면 좋을 카드를 알려줘. 데이터에 있는 내용만 사용해.";
router.post("/insights", async (_req, res) => {
  openSse(res);
  try {
    const ctx = await buildCollectionContext();
    await runStream(res, ctx, INSIGHTS_Q);
  } catch (err) {
    console.error("[assistant] insights error", err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
