// Ollama Cloud 연결 확인용 스크립트.
// 사용: node scripts/pingOllama.js "안녕"
import "dotenv/config";
import { chat } from "../src/utils/ollamaClient.js";

const prompt = process.argv.slice(2).join(" ") || "한 문장으로 자기소개해줘.";

try {
  const reply = await chat(
    [
      { role: "system", content: "너는 간결하게 답하는 어시스턴트야." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.5 }
  );
  console.log(reply);
} catch (err) {
  console.error("[pingOllama] 실패:", err.message);
  process.exit(1);
}
