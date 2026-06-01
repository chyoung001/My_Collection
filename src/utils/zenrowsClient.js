const ZENROWS_BASE = "https://api.zenrows.com/v1/";

// ZenRows 작업은 page render + JS instructions까지 20초 안팎이라 60초가 안전선.
// 그 이상이면 응답이 못 올 가능성이 높으니 끊고 502로 처리.
const ZENROWS_TIMEOUT_MS = 60000;

/**
 * ZenRows를 통해 JS 렌더링이 필요한 페이지를 가져옴
 *
 * @param {string} targetUrl
 * @param {object} options
 * @param {number} options.wait            JS 실행 대기 시간(ms)
 * @param {string} options.waitFor         렌더링 완료 CSS selector
 * @param {Array}  options.jsInstructions  ZenRows JS instruction 배열
 * @returns {Promise<string>}
 */
export async function zenrowsFetch(targetUrl, { wait = 4000, waitFor, jsInstructions } = {}) {
  const apiKey = process.env.ZENROWS_API_KEY;
  if (!apiKey) throw new Error("ZENROWS_API_KEY 환경변수가 설정되지 않았습니다.");

  const params = new URLSearchParams({
    apikey:        apiKey,
    url:           targetUrl,
    js_render:     "true",
    premium_proxy: "true",
    antibot:       "true",
    proxy_country: "us",
    wait:          String(wait),
    ...(waitFor      ? { wait_for:        waitFor } : {}),
    ...(jsInstructions ? { js_instructions: JSON.stringify(jsInstructions) } : {}),
  });

  let res;
  try {
    res = await fetch(`${ZENROWS_BASE}?${params}`, {
      signal: AbortSignal.timeout(ZENROWS_TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new Error(`ZenRows 타임아웃 (${ZENROWS_TIMEOUT_MS}ms)`);
    }
    throw err;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // ZenRows 에러 응답에 API key가 echo될 위험 차단
    const safe = body.slice(0, 200).replace(apiKey, "[REDACTED_KEY]");
    throw new Error(`ZenRows 오류 ${res.status}: ${safe}`);
  }

  return res.text();
}
