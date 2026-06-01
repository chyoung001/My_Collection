// 이미지 URL 또는 data URL을 받아 안전한지 검증.
// 허용:
//   - http(s):// URL (DB엔 그대로 저장; 이미지 자체는 클라이언트가 fetch)
//   - data:image/png;base64,... / image/jpeg / image/webp / image/gif (1MB 제한)
//
// 거부:
//   - file://, javascript:, data:text/... 등 비이미지 스킴
//   - 매직바이트 불일치 (Content-Type sniffing 우회 차단)
//   - 1MB 초과 base64

const MAX_BASE64_BYTES = 1024 * 1024; // 1MB
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

// 이미지 포맷별 매직바이트 (디코드된 첫 바이트 시퀀스)
const MAGIC_BYTES = {
  "image/png":  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/webp": null, // RIFF...WEBP (특수)
  "image/gif":  [0x47, 0x49, 0x46, 0x38], // "GIF8"
};

function matchesMagic(buf, mime) {
  if (mime === "image/webp") {
    // RIFF (0-3) + size (4-7) + WEBP (8-11)
    return buf.length >= 12
      && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
  }
  const magic = MAGIC_BYTES[mime];
  if (!magic) return false;
  if (buf.length < magic.length) return false;
  return magic.every((b, i) => buf[i] === b);
}

/**
 * @param {string} input
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateImageInput(input) {
  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, error: "missing_imageUrl" };
  }
  const value = input.trim();

  // data URL 분기
  if (value.startsWith("data:")) {
    const m = value.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return { ok: false, error: "invalid_data_url" };
    const mime = m[1].toLowerCase();
    const b64 = m[2];

    if (!ALLOWED_MIME.has(mime)) {
      return { ok: false, error: "unsupported_image_mime" };
    }
    // base64 크기 — 4 chars당 3 bytes
    const approxBytes = Math.floor((b64.length * 3) / 4);
    if (approxBytes > MAX_BASE64_BYTES) {
      return { ok: false, error: "image_too_large", limit: MAX_BASE64_BYTES, got: approxBytes };
    }

    // 매직바이트 검증
    let buf;
    try {
      buf = Buffer.from(b64, "base64");
    } catch {
      return { ok: false, error: "invalid_base64" };
    }
    if (!matchesMagic(buf, mime)) {
      return { ok: false, error: "image_magic_mismatch" };
    }

    return { ok: true, value };
  }

  // http(s) URL
  let u;
  try {
    u = new URL(value);
  } catch {
    return { ok: false, error: "invalid_image_url" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "unsupported_image_protocol" };
  }
  return { ok: true, value };
}
