import OpenAI from "openai";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "https://ollama.com/v1";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "qwen3-coder:480b";

let client = null;

export function getClient() {
  if (client) return client;
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) {
    throw new Error("OLLAMA_API_KEY is not set");
  }
  client = new OpenAI({ baseURL: OLLAMA_BASE_URL, apiKey });
  return client;
}

/**
 * Ollama Cloud(OpenAI 호환 엔드포인트)로 chat completion 호출.
 *
 * @param {Array<{role:"system"|"user"|"assistant", content:string}>} messages
 * @param {object} [opts]
 * @param {string} [opts.model]        기본값: OLLAMA_MODEL env 또는 qwen3-coder:480b
 * @param {number} [opts.temperature]  기본값 0.7
 * @param {number} [opts.maxTokens]    응답 길이 상한
 * @param {number} [opts.timeoutMs]    기본값 60_000
 * @returns {Promise<string>}          assistant 메시지 본문
 */
export async function chat(messages, opts = {}) {
  const res = await getClient().chat.completions.create(
    {
      model: opts.model ?? DEFAULT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens,
    },
    { timeout: opts.timeoutMs ?? 60_000 }
  );
  return res.choices?.[0]?.message?.content ?? "";
}

/**
 * 스트리밍 변형 — 토큰을 순서대로 yield. SSE 응답이 필요한 라우트에서 사용.
 */
export async function* chatStream(messages, opts = {}) {
  const stream = await getClient().chat.completions.create(
    {
      model: opts.model ?? DEFAULT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens,
      stream: true,
    },
    { timeout: opts.timeoutMs ?? 120_000 }
  );
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta;
    // kimi 등 thinking 모델은 reasoning 필드를 먼저 채우고 content는 나중에 옴
    const token = delta?.content || delta?.reasoning;
    if (token) yield { text: token, type: delta?.content ? "content" : "reasoning" };
  }
}
