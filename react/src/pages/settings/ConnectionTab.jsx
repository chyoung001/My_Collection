import { useState, useEffect } from "react";
import {
  apiFetch,
  getApiBase,
  setApiBase,
  getApiToken,
  setApiToken,
} from "@/api";
import {
  Server, Plug, KeyRound, Loader2, RotateCcw,
  Eye, EyeOff, CheckCircle2, XCircle,
} from "lucide-react";
import { Section, Row, TextInput, HealthRow } from "./controls";

export default function ConnectionTab() {
  // ── 서버 주소 ──
  const [base, setBase] = useState(getApiBase());

  // ── API 토큰 ──
  const [token, setToken] = useState(getApiToken());
  const [showToken, setShowToken] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, msg }

  // ── 외부 API 상태 ──
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  async function loadHealth() {
    setHealthLoading(true);
    try {
      const res = await apiFetch("/api/preferences/health");
      if (res.ok) setHealth(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setHealthLoading(false);
    }
  }
  useEffect(() => { loadHealth(); }, []);

  function saveBase() {
    setApiBase(base);
    // PreferencesProvider 등 모든 데이터가 새 주소로 다시 로드되도록 새로고침.
    window.location.reload();
  }

  function saveToken() {
    setApiToken(token);
    setTokenSaved(true);
    setTestResult(null);
    setTimeout(() => setTokenSaved(false), 2000);
  }

  async function testConnection() {
    setApiToken(token); // 입력값을 먼저 저장 → 입력한 토큰으로 테스트
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/api/auth/check", { method: "POST" });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setTestResult({
          ok: true,
          msg: data.authRequired ? "토큰 유효 — 연결됨" : "연결됨 (서버가 토큰을 요구하지 않음)",
        });
      } else if (res.status === 401) {
        setTestResult({ ok: false, msg: "토큰이 없거나 일치하지 않습니다 (401)" });
      } else if (res.status === 503) {
        setTestResult({ ok: false, msg: "서버에 API_TOKEN이 설정되지 않았습니다 (503)" });
      } else {
        setTestResult({ ok: false, msg: `예상치 못한 응답 (HTTP ${res.status})` });
      }
    } catch {
      setTestResult({ ok: false, msg: "서버에 연결할 수 없습니다 (주소·네트워크 확인)" });
    } finally {
      setTesting(false);
    }
  }

  const btn =
    "px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40";

  return (
    <div className="flex flex-col gap-6">
      {/* ── 서버 연결 ── */}
      <Section icon={Server} title="서버 연결">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-white/80">API 서버 주소</p>
          <p className="text-[11px] text-white/35 -mt-1">백엔드 주소 (예: http://localhost:4000, ngrok URL)</p>
          <div className="flex gap-2">
            <TextInput
              value={base}
              onChange={setBase}
              placeholder="http://localhost:4000"
              className="flex-1 font-mono text-xs"
            />
            <button
              onClick={saveBase}
              disabled={!base.trim() || base.trim() === getApiBase()}
              className={`${btn} bg-[rgba(212,175,55,0.15)] text-[var(--gold-base)] hover:bg-[rgba(212,175,55,0.25)] shrink-0`}
            >
              저장 &amp; 새로고침
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
          <div className="flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-white/50" />
            <p className="text-sm text-white/80">API 토큰</p>
          </div>
          <p className="text-[11px] text-white/35 -mt-1">
            카드 추가·삭제·시세 갱신 등 쓰기 작업 인증용. 이 기기에만 저장됩니다.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <TextInput
                value={token}
                onChange={setToken}
                type={showToken ? "text" : "password"}
                placeholder="백엔드 .env 의 API_TOKEN"
                className="w-full font-mono text-xs pr-9"
              />
              <button
                type="button"
                onClick={() => setShowToken((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                aria-label={showToken ? "토큰 숨기기" : "토큰 표시"}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={saveToken}
              className={`${btn} bg-white/5 text-white/70 hover:bg-white/10 border border-white/10 shrink-0`}
            >
              {tokenSaved ? "저장됨 ✓" : "저장"}
            </button>
            <button
              onClick={testConnection}
              disabled={testing}
              className={`${btn} bg-[rgba(212,175,55,0.15)] text-[var(--gold-base)] hover:bg-[rgba(212,175,55,0.25)] shrink-0 inline-flex items-center gap-1.5`}
            >
              {testing && <Loader2 className="w-3 h-3 animate-spin" />}
              연결 테스트
            </button>
          </div>
          {testResult && (
            <div className={`flex items-center gap-1.5 text-xs mt-0.5 ${testResult.ok ? "text-green-400" : "text-red-400"}`}>
              {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {testResult.msg}
            </div>
          )}
        </div>
      </Section>

      {/* ── 외부 API 연결 상태 ── */}
      <Section icon={Plug} title="외부 API 연결 상태">
        {healthLoading && !health ? (
          <div className="flex justify-center py-4 text-white/20">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : health ? (
          <>
            <HealthRow item={health.psa} />
            <HealthRow item={health.zenrows} />
            <HealthRow item={health.ebay} />
            <HealthRow item={health.ollama} />
            <button
              onClick={loadHealth}
              disabled={healthLoading}
              className="self-start flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mt-1"
            >
              {healthLoading
                ? <><Loader2 className="w-3 h-3 animate-spin" /> 점검 중...</>
                : <><RotateCcw className="w-3 h-3" /> 다시 점검</>}
            </button>
          </>
        ) : (
          <p className="text-sm text-white/30">상태를 불러올 수 없습니다.</p>
        )}
      </Section>
    </div>
  );
}
