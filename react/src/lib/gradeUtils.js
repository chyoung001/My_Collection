/**
 * grade 문자열 → shadcn Badge의 variant 토큰 반환.
 * Collection의 <Badge variant={...}> 에서 사용.
 */
export function gradeVariant(grade) {
  if (!grade) return "default";
  const g = grade.toUpperCase();
  if (g.includes("10")) return "grade10";
  if (g.includes("9.5") || g.includes("9")) return "grade9";
  if (g.includes("8")) return "grade8";
  return "default";
}

/**
 * grade 문자열 → Tailwind className 문자열 반환.
 * CardTile 인라인 배지 및 CardDetail 등급 badge에서 사용.
 */
export function gradeBadgeClass(grade) {
  const g = (grade || "").toUpperCase();
  if (g.includes("10")) return "bg-yellow-400 text-black border-yellow-300";
  if (g.includes("9.5")) return "bg-blue-500 text-white border-blue-400";
  if (g.includes("9"))   return "bg-blue-600 text-white border-blue-500";
  if (g.includes("8"))   return "bg-purple-600 text-white border-purple-500";
  return "bg-white/80 text-black border-white/60";
}
