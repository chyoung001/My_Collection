import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/api";
import { Loader2, Send, Zap, Bot, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SYSTEM_PRESETS = [
  { label: "기본", value: "" },
  { label: "카드 전문가", value: "You are an expert sports card collector and appraiser. Respond in Korean. Be concise and practical." },
  { label: "시세 분석가", value: "You are a sports card market analyst. Provide data-driven insights. Respond in Korean." },
];

export default function LlmTest() {
  const [mode, setMode] = useState("chat"); // "chat" | "stream"
  const [message, setMessage] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { reply, elapsedMs, model }
  const [reasoning, setReasoning] = useState("");
  const [streamContent, setStreamContent] = useState("");
  const [streamDone, setStreamDone] = useState(false);
  const reasoningRef = useRef(null);
  const contentRef = useRef(null);

  // reasoning 자동 스크롤
  useEffect(() => {
    if (reasoningRef.current) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
    }
  }, [reasoning]);

  async function handleChat() {
    if (!message.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await apiFetch("/api/llm-test/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, systemPrompt, temperature }),
      });
      const data = await res.json();
      if (!res.ok) { alert(`오류: ${data.message || data.error}`); return; }
      setResult(data);
    } catch (e) {
      alert("서버 통신 오류: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStream() {
    if (!message.trim()) return;
    setLoading(true);
    setReasoning("");
    setStreamContent("");
    setStreamDone(false);
    setResult(null);
    const startMs = Date.now();

    try {
      const res = await apiFetch("/api/llm-test/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, systemPrompt, temperature }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop(); // 마지막 불완전 청크 보존

        for (const line of lines) {
          const text = line.replace(/^data: /, "").trim();
          if (!text || text === "[DONE]") { setStreamDone(true); continue; }
          try {
            const token = JSON.parse(text);
            if (token.error) { alert("LLM 오류: " + token.error); break; }
            if (token.type === "reasoning") setReasoning((p) => p + token.text);
            if (token.type === "content") {
              setStreamContent(token.text);
              setResult({ reply: token.text, elapsedMs: Date.now() - startMs, model: "kimi-k2.6:cloud" });
            }
          } catch {}
        }
      }
    } catch (e) {
      alert("스트림 오류: " + e.message);
    } finally {
      setLoading(false);
      setStreamDone(true);
    }
  }

  function handleSubmit() {
    mode === "stream" ? handleStream() : handleChat();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">

      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[rgba(212,175,55,0.15)] flex items-center justify-center">
          <Bot className="w-5 h-5 text-[var(--gold-base)]" />
        </div>
        <div>
          <h2 className="font-poppins font-bold text-lg text-white">LLM 연동 테스트</h2>
          <p className="text-xs text-white/40">kimi-k2.6:cloud · Ollama Cloud API</p>
        </div>
        {/* 모드 토글 */}
        <div className="ml-auto flex rounded-xl border border-white/10 overflow-hidden">
          {[["chat", "단건"], ["stream", "스트리밍"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setMode(val)}
              className={`px-4 py-2 text-xs font-semibold transition-colors ${
                mode === val
                  ? "bg-[rgba(212,175,55,0.15)] text-[var(--gold-base)]"
                  : "text-white/40 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 설정 패널 */}
      <div className="glass-card flex flex-col gap-4">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">설정</p>

        {/* 시스템 프롬프트 프리셋 */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-white/50">System Prompt 프리셋</label>
          <div className="flex flex-wrap gap-2">
            {SYSTEM_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setSystemPrompt(p.value)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  systemPrompt === p.value
                    ? "bg-[rgba(212,175,55,0.15)] border-[rgba(212,175,55,0.4)] text-[var(--gold-base)]"
                    : "border-white/10 text-white/40 hover:text-white/70"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <textarea
            rows={2}
            placeholder="System prompt (직접 입력 가능)"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 resize-none focus:outline-none focus:border-[rgba(212,175,55,0.4)]"
          />
        </div>

        {/* Temperature */}
        <div className="flex items-center gap-4">
          <label className="text-xs text-white/50 shrink-0">Temperature</label>
          <input
            type="range" min={0} max={1} step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="flex-1 accent-[var(--gold-base)]"
          />
          <span className="text-xs font-poppins font-bold text-[var(--gold-base)] w-6">{temperature}</span>
        </div>
      </div>

      {/* 입력 */}
      <div className="glass-card flex flex-col gap-3">
        <textarea
          rows={4}
          placeholder="메시지를 입력하세요... (Enter로 전송, Shift+Enter 줄바꿈)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent text-sm text-white placeholder:text-white/20 resize-none focus:outline-none"
        />
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={loading || !message.trim()} className="gap-2">
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중...</>
              : mode === "stream"
              ? <><Zap className="w-4 h-4" /> 스트리밍 전송</>
              : <><Send className="w-4 h-4" /> 전송</>}
          </Button>
        </div>
      </div>

      {/* 스트리밍 모드 — Reasoning 실시간 표시 */}
      {mode === "stream" && (reasoning || loading) && (
        <div className="glass-card flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Reasoning</span>
            {loading && !streamDone && <Loader2 className="w-3 h-3 animate-spin text-blue-400 ml-auto" />}
          </div>
          <div
            ref={reasoningRef}
            className="max-h-48 overflow-y-auto text-xs text-white/50 leading-relaxed whitespace-pre-wrap font-mono scrollbar-thin"
          >
            {reasoning || <span className="text-white/20">추론 중...</span>}
          </div>
        </div>
      )}

      {/* 최종 응답 */}
      {result && (
        <div className="glass-card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[var(--gold-base)]" />
              <span className="text-xs font-semibold text-[var(--gold-base)] uppercase tracking-wider">응답</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-white/30">
              <span>{result.model}</span>
              <span>·</span>
              <span>{(result.elapsedMs / 1000).toFixed(1)}s</span>
            </div>
          </div>
          <p ref={contentRef} className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">
            {result.reply}
          </p>
        </div>
      )}

      {/* 빈 상태 */}
      {!loading && !result && !reasoning && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-white/20">
          <Bot className="w-10 h-10" />
          <p className="text-sm">메시지를 입력하고 전송하면 LLM 응답이 여기 표시됩니다.</p>
          <p className="text-xs">단건 모드: 전체 응답 반환 · 스트리밍 모드: Reasoning 실시간 + 최종 답변</p>
        </div>
      )}
    </div>
  );
}
