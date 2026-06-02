// PSA 무료 Public API의 PSAPopulation 구조 확인 (ZenRows 비용 없음, 100콜/일 한도).
// 사용법: node scripts/debugPsaApi.js <certNumber>
import dotenv from "dotenv";
import { fetchPsaLookupAndImages } from "../src/utils/psaClient.js";

dotenv.config();

const cert = process.argv[2];
if (!cert) { console.error("사용법: node scripts/debugPsaApi.js <certNumber>"); process.exit(1); }
const token = process.env.PSA_TOKEN;
if (!token) { console.error("PSA_TOKEN 미설정"); process.exit(1); }

const { psaLookup } = await fetchPsaLookupAndImages(cert, token);
console.log("=== PSACert (등급) ===");
console.log("Grade:", psaLookup.PSACert?.Grade, "| GradeDescription:", psaLookup.PSACert?.GradeDescription);
console.log("Subject:", psaLookup.PSACert?.Subject);
console.log("\n=== PSAPopulation (원본) ===");
console.log(JSON.stringify(psaLookup.PSAPopulation, null, 2));
