const STORAGE_KEY = "my_collection_api_base";
const DEFAULT_BASE = "http://localhost:4000";

export function getApiBase() {
  const fromUrl = new URLSearchParams(window.location.search).get("apiBase");
  if (fromUrl) {
    try {
      sessionStorage.setItem(STORAGE_KEY, fromUrl);
    } catch {}
    return fromUrl;
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY) || DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

export function apiFetch(path, opts = {}) {
  const base = getApiBase();
  const headers = new Headers(opts.headers);
  if (/ngrok-free\.app|ngrok\.io|ngrok\.app/i.test(base)) {
    headers.set("ngrok-skip-browser-warning", "true");
  }
  return fetch(base + path, { ...opts, headers });
}

// 백엔드 에러 응답({ error, message })을 실어 나르는 에러 타입.
// 호출자는 err.message(사용자용)와 err.code(분기용 snake_case)를 사용할 수 있다.
export class ApiError extends Error {
  constructor(message, { status = 0, code = null, body = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

// apiFetch는 4xx/5xx에도 throw하지 않고 raw Response를 돌려주므로, 호출자가 res.ok를 빼먹으면
// 실패가 조용히 묻힌다. apiJson은 ok 검사 + JSON 파싱 + 실패 시 ApiError throw를 대신 해준다.
// 성공 시 파싱된 JSON(본문 없으면 null)을 반환한다.
export async function apiJson(path, opts = {}) {
  let res;
  try {
    res = await apiFetch(path, opts);
  } catch {
    // 네트워크 단계 실패: 서버 다운, CORS, 잘못된 apiBase 등
    throw new ApiError("서버에 연결할 수 없습니다. (API 주소·연결 상태를 확인하세요)", {
      code: "network_error",
    });
  }
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  if (!res.ok) {
    const msg = (body && body.message) || `요청에 실패했습니다. (HTTP ${res.status})`;
    throw new ApiError(msg, { status: res.status, code: body && body.error, body });
  }
  return body;
}

export function fmtUSD(v) {
  return (
    "$" +
    Number(v).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

export function relTime(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return "방금 전";
  if (diff < 3600) return Math.floor(diff / 60) + "분 전";
  if (diff < 86400) return Math.floor(diff / 3600) + "시간 전";
  return Math.floor(diff / 86400) + "일 전";
}
