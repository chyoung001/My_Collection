// 갤러리 프레임 레이아웃 정의 — 백엔드 단일 출처.
// 프론트엔드 Gallery.jsx의 FRAME_LAYOUTS와 슬롯 수가 일치해야 함.
// 새 레이아웃 추가 시 양쪽 모두 갱신.

export const FRAME_LAYOUTS = {
  "1x1": 1,
  "1x2": 2,
  "1x3": 3,
  "2x2": 4,
  "2x3": 6,
  "3x3": 9,
};

export function slotsOf(layout) {
  return FRAME_LAYOUTS[layout] ?? 9;
}

export function isValidLayout(layout) {
  return typeof layout === "string"
    && Object.prototype.hasOwnProperty.call(FRAME_LAYOUTS, layout);
}
