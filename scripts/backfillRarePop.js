// 저Population 카드 소급 처리 — 기존 cards의 psa_population.TotalPopulation을 읽어
// 임계값 이하이면 is_rare=true 로 표시(자동 시세수집 차단). ZenRows 비용 없음(DB만).
//
// 사용법:
//   node scripts/backfillRarePop.js           (dry-run: 무엇이 바뀔지만 출력)
//   node scripts/backfillRarePop.js --apply    (실제 UPDATE 적용)
//
// 안전장치: is_rare=false → true 로만 바꾼다(이미 rare인 카드/수동 지정은 건드리지 않음).

import "dotenv/config"; // db.js가 import 시점에 DATABASE_URL을 읽으므로 반드시 먼저 로드
import { pool } from "../src/utils/db.js";

const APPLY = process.argv.includes("--apply");
const THRESHOLD = Number(process.env.RARE_POP_THRESHOLD) || 5;

const { rows } = await pool.query(
  `SELECT id, subject, grade, grader, is_rare,
          psa_population->>'TotalPopulation' AS pop
   FROM cards`
);

const popNum = (r) => parseInt(r.pop, 10);
const withPop = rows.filter((r) => Number.isFinite(popNum(r)));
const tier1 = withPop.filter((r) => popNum(r) === 1);
const tier2to5 = withPop.filter((r) => popNum(r) >= 2 && popNum(r) <= 5);
const lowPop = withPop.filter((r) => popNum(r) <= THRESHOLD);          // 0~THRESHOLD
const toMark = lowPop.filter((r) => !r.is_rare);                       // 새로 표시될 대상

console.log(`전체 카드: ${rows.length} | Population 있는 카드: ${withPop.length}`);
console.log(`  pop=1 (MasterPiece): ${tier1.length}`);
console.log(`  pop 2~5 (Low Pop):   ${tier2to5.length}`);
console.log(`  pop<=${THRESHOLD} 전체: ${lowPop.length} (이미 is_rare: ${lowPop.length - toMark.length})`);
console.log(`\n새로 is_rare 처리될 카드: ${toMark.length}`);
for (const r of toMark) {
  console.log(`  #${r.id} pop=${r.pop} [${r.grader} ${r.grade}] ${r.subject}`);
}

if (!APPLY) {
  console.log(`\n[dry-run] 실제 적용하려면 --apply 플래그를 붙여 다시 실행하세요.`);
} else if (toMark.length) {
  const ids = toMark.map((r) => r.id);
  const { rowCount } = await pool.query(
    `UPDATE cards SET is_rare = true, updated_at = NOW() WHERE id = ANY($1)`,
    [ids]
  );
  console.log(`\n[적용] ${rowCount}개 카드를 is_rare=true 로 갱신했습니다.`);
} else {
  console.log(`\n[적용] 새로 표시할 대상이 없습니다.`);
}

await pool.end();
