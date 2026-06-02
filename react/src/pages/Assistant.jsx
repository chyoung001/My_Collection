import { useState, useRef, useEffect } from "react";
import { apiFetch, relTime } from "@/api";
import { Loader2, Send, Bot, Brain, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";

const CHIPS = [
  "가장 많이 오른 카드는?",
  "내 PSA 10 총 가치는?",
  "다시 모아야 할 카드는?",
  "미실현·실현 손익 요약해줘",
];

export default function Assistant() {
  const [messages, setMessages] = useState([]); // { role, content, reasoning?, streaming? }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [asOf, setAsOf] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // 마지막(어시스턴트) 메시지에 patch(last)=>{...} 병합
  const patchLast = (fn) => setMessages((prev) => {
    if (!prev.length) return prev;
    const copy = [...prev];
    copy[copy.length - 1] = { ...copy[copy.length - 1], ...fn(copy[copy.length - 1]) };
    return copy;
  });

  async function streamTo(endpoint, body) {
    setLoading(true);
    setMessages((p) => [...p, { role: "assistant", content: "", reasoning: "", streaming: true }]);
    try {
      const res = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = res.status === 401 ? "API 토큰이 필요합니다. 설정 > 연결에서 입력하세요."
          : res.status === 429 ? "요청이 너무 많습니다. 잠시 후 다시 시도하세요."
          : (data.message || `오류가 발생했습니다. (HTTP ${res.status})`);
        patchLast(() => ({ content: `⚠️ ${msg}` }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop();
        for (const line of lines) {
          const text = line.replace(/^data: /, "").trim();
          if (!text || text === "[DONE]") continue;
          try {
            const ev = JSON.parse(text);
            if (ev.error) { patchLast((l) => ({ content: (l.content || "") + `\n⚠️ ${ev.error}` })); continue; }
            if (ev.type === "reasoning") patchLast((l) => ({ reasoning: (l.reasoning || "") + ev.text }));
            if (ev.type === "content") patchLast((l) => ({ content: (l.content || "") + ev.text }));
            if (ev.type === "done" && ev.asOf) setAsOf(ev.asOf);
          } catch { /* 불완전 청크 무시 */ }
        }
      }
    } catch (e) {
      patchLast((l) => ({ content: (l.content || "") + `\n⚠️ 통신 오류: ${e.message}` }));
    } finally {
      setLoading(false);
      patchLast(() => ({ streaming: false }));
    }
  }

  function send(q) {
    const text = (q ?? input).trim();
    if (!text || loading) return;
    setMessages((p) => [...p, { role: "user", content: text }]);
    setInput("");
    streamTo("/api/assistant/stream", { message: text });
  }

  function runInsights() {
    if (loading) return;
    setMessages((p) => [...p, { role: "user", content: "📊 컬렉션 인사이트" }]);
    streamTo("/api/assistant/insights", {});
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-3xl mx-auto w-full">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border-base)]">
        <div className="w-9 h-9 rounded-xl bg-[rgba(212,175,55,0.15)] flex items-center justify-center">
          <Bot className="w-5 h-5 text-[var(--gold-base)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-poppins font-bold text-base text-white">AI 컬렉션 어시스턴트</h2>
          <p className="text-[11px] text-white/40">
            내 컬렉션 데이터에 근거해 답변{asOf ? ` · 기준 ${relTime(asOf)}` : ""}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={runInsights} disabled={loading} className="gap-1.5 text-xs">
          <Sparkles className="w-3.5 h-3.5" /> 인사이트
        </Button>
      </div>

      {/* 트랜스크립트 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center gap-4 py-10 text-white/40">
            <Bot className="w-12 h-12 text-white/20" />
            <p className="text-sm">내 컬렉션에 대해 무엇이든 물어보세요.</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {CHIPS.map((c) => (
                <button key={c} onClick={() => send(c)}
                  className="px-3 py-1.5 rounded-full text-xs border border-white/10 text-white/60 hover:text-white hover:border-gold/40 hover:bg-gold/5 transition-colors">
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          m.role === "user" ? (
            <div key={i} className="flex items-start gap-2.5 justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[rgba(212,175,55,0.15)] border border-[rgba(212,175,55,0.25)] px-4 py-2.5 text-sm text-white whitespace-pre-wrap">
                {m.content}
              </div>
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4 text-white/60" />
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[rgba(212,175,55,0.15)] flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-[var(--gold-base)]" />
              </div>
              <div className="max-w-[85%] flex flex-col gap-2">
                {m.reasoning && (
                  <details className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
                    <summary className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-blue-400/80 cursor-pointer select-none">
                      <Brain className="w-3 h-3" /> 추론 보기
                    </summary>
                    <div className="px-3 pb-2 max-h-48 overflow-y-auto text-[11px] text-white/40 leading-relaxed whitespace-pre-wrap font-mono">
                      {m.reasoning}
                    </div>
                  </details>
                )}
                <div className="rounded-2xl rounded-tl-sm bg-[var(--surface-1)] border border-[var(--border-base)] px-4 py-2.5 text-sm text-white/90 leading-relaxed whitespace-pre-wrap min-h-[1rem]">
                  {m.content || (m.streaming ? <span className="inline-flex items-center gap-1.5 text-white/40"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {m.reasoning ? "답변 작성 중..." : "분석 중..."}</span> : null)}
                </div>
              </div>
            </div>
          )
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 입력 */}
      <div className="px-5 py-3 border-t border-[var(--border-base)]">
        <div className="flex items-end gap-2 rounded-2xl bg-white/5 border border-white/10 px-3 py-2 focus-within:border-[rgba(212,175,55,0.4)]">
          <textarea
            rows={1}
            placeholder="내 컬렉션에 대해 물어보세요... (Enter 전송, Shift+Enter 줄바꿈)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 resize-none focus:outline-none max-h-32 py-1"
          />
          <Button onClick={() => send()} disabled={loading || !input.trim()} size="icon" className="shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
