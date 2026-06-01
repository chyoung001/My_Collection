const PSA_API_BASE =
  process.env.PSA_API_BASE || "https://api.psacard.com/publicapi";

/**
 * PSA 에러 응답에 토큰이 echo back되거나 너무 긴 본문이 들어가지 않도록 마스킹.
 */
function sanitizePsaErrorBody(text, token) {
  if (!text) return "";
  let safe = text.slice(0, 200);
  if (token && safe.includes(token)) {
    safe = safe.replaceAll(token, "[REDACTED_TOKEN]");
  }
  return safe;
}

async function doJsonGet(url, token) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `bearer ${token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const safe = sanitizePsaErrorBody(text, token);
    throw new Error(
      `PSA API error: ${res.status} ${res.statusText}${safe ? ` - ${safe}` : ""}`
    );
  }

  return res.json();
}

/**
 * PSA cert 번호로 실제 PSA Public API 두 개를 호출해
 * 기존 스텁과 동일한 형태의 데이터를 반환한다.
 *
 * - /cert/GetByCertNumberForFileAppend/{certNumber}
 * - /cert/GetImagesByCertNumber/{certNumber}
 *
 * @param {string|number} certNumber
 * @param {string} token        프론트에서 전달받은 PSA 토큰
 * @returns {Promise<{ psaLookup: any, psaImages: any[] }>}
 */
export async function fetchPsaLookupAndImages(certNumber, token) {
  const cn = String(certNumber).trim();
  if (!cn) {
    throw new Error("certNumber is empty");
  }
  if (!token) {
    throw new Error("PSA token is required");
  }

  const base = PSA_API_BASE.replace(/\/+$/, "");

  const lookupUrl = `${base}/cert/GetByCertNumberForFileAppend/${encodeURIComponent(
    cn
  )}`;
  const imagesUrl = `${base}/cert/GetImagesByCertNumber/${encodeURIComponent(
    cn
  )}`;

  const [lookup, imagesResult] = await Promise.all([
    doJsonGet(lookupUrl, token),
    doJsonGet(imagesUrl, token).catch(() => null),
  ]);

  const psaImages = Array.isArray(imagesResult) ? imagesResult : imagesResult ? [imagesResult] : [];

  return {
    psaLookup: lookup,
    psaImages,
  };
}

