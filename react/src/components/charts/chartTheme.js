// 차트 공통 색/토큰 (다크·골드 테마)
export const GOLD = "#d4af37";
export const UP = "#4caf50";
export const DOWN = "#f44336";
export const AXIS = "rgba(255,255,255,0.30)";
export const GRID = "rgba(255,255,255,0.06)";

// 등급/카테고리 분포 도넛용 팔레트
export const PALETTE = [
  "#d4af37", "#e6c865", "#8ad6ff", "#c06bff",
  "#6bffb3", "#ff8ec4", "#ffa94d", "#7f8794",
];

// Y축 도메인: 0부터 시작하지 않고 데이터 변동 범위에 여백을 줘서 확대(작은 변동도 잘 보이게).
// values: number[] → [lo-pad, hi+pad]
export function paddedDomain(values, ratio = 0.15) {
  const nums = (values || []).filter((v) => Number.isFinite(v));
  if (!nums.length) return ["auto", "auto"];
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const pad = (hi - lo || Math.abs(hi) * 0.05 || 1) * ratio;
  return [lo - pad, hi + pad];
}

// 시계열 X축 적응형 포맷터: 데이터 범위가 ~36시간 이내면 HH:MM, 길면 M/D
// series: [{ ts: number }] (시간 오름차순)
export function makeTimeTickFormatter(series) {
  if (!series?.length) return () => "";
  const span = series[series.length - 1].ts - series[0].ts;
  const withinDay = span < 36 * 3600 * 1000;
  return (ts) => {
    const d = new Date(ts);
    return withinDay
      ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
      : `${d.getMonth() + 1}/${d.getDate()}`;
  };
}
