import { useState, useEffect } from "react";
import { apiFetch } from "@/api";
import { usePreferences } from "@/contexts/PreferencesContext";
import { Loader2, RotateCcw, CheckCircle2, XCircle, MinusCircle, Palette, Database, Eye, Plug } from "lucide-react";

// ── 섹션 카드 ──────────────────────────────────────────────────
function Section({ icon: Icon, title, children }) {
  return (
    <div className="glass-card flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-[var(--gold-base)]" />
        <h3 className="font-poppins font-bold text-sm text-white">{title}</h3>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

// ── 한 줄 설정 (라벨 + 컨트롤) ─────────────────────────────────
function Row({ label, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-white/80">{label}</p>
        {hint && <p className="text-[11px] text-white/35 mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ── 세그먼트 토글 ──────────────────────────────────────────────
function Segmented({ value, options, onChange }) {
  return (
    <div className="flex rounded-xl border border-white/10 overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === opt.value
              ? "bg-[rgba(212,175,55,0.15)] text-[var(--gold-base)]"
              : "text-white/40 hover:text-white"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── 색상 피커 ──────────────────────────────────────────────────
function ColorPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer"
      />
      <span className="text-xs font-mono text-white/50 w-16">{value}</span>
    </div>
  );
}

// ── 숫자 스텝 입력 ─────────────────────────────────────────────
function NumberInput({ value, onChange, min = 1, max = 168, suffix }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-[rgba(212,175,55,0.4)]"
      />
      {suffix && <span className="text-xs text-white/40">{suffix}</span>}
    </div>
  );
}

// ── 외부 API 상태 행 ───────────────────────────────────────────
function HealthRow({ item }) {
  let Icon, color, text;
  if (!item.configured) { Icon = MinusCircle; color = "text-white/30"; text = "미설정"; }
  else if (item.ok === true) { Icon = CheckCircle2; color = "text-green-400"; text = "연결됨"; }
  else if (item.ok === false) { Icon = XCircle; color = "text-red-400"; text = "연결 실패"; }
  else { Icon = CheckCircle2; color = "text-white/50"; text = "설정됨"; }
  return (
    <div className="flex items-center gap-3 py-1">
      <Icon className={`w-4 h-4 ${color}`} />
      <span className="text-sm text-white/70 flex-1">{item.label}</span>
      <span className={`text-xs ${color}`}>{text}</span>
    </div>
  );
}

export default function Settings() {
  const { prefs, setPreference, resetPreferences } = usePreferences();
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

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">

      <div>
        <h2 className="font-poppins font-bold text-lg text-white">설정</h2>
        <p className="text-xs text-white/40 mt-0.5">변경 사항은 자동 저장되며 즉시 적용됩니다.</p>
      </div>

      {/* ── 표시 & 포맷 ── */}
      <Section icon={Eye} title="표시 & 포맷">
        <Row label="통화" hint="가격 표시에 사용되는 통화 기호">
          <Segmented
            value={prefs.currency}
            onChange={(v) => setPreference("currency", v)}
            options={[
              { value: "USD", label: "$ USD" },
              { value: "KRW", label: "₩ KRW" },
              { value: "JPY", label: "¥ JPY" },
            ]}
          />
        </Row>
        <Row label="소수점 표시" hint="가격의 소수점 자리수">
          <Segmented
            value={String(prefs.currencyDecimals)}
            onChange={(v) => setPreference("currencyDecimals", Number(v))}
            options={[
              { value: "0", label: "없음" },
              { value: "2", label: "2자리" },
            ]}
          />
        </Row>
        <Row label="기본 정렬" hint="컬렉션 페이지의 기본 정렬 방식">
          <Segmented
            value={prefs.defaultSort}
            onChange={(v) => setPreference("defaultSort", v)}
            options={[
              { value: "value", label: "가치순" },
              { value: "subject", label: "선수명" },
              { value: "year", label: "연도순" },
            ]}
          />
        </Row>
        <Row label="언어" hint="상대 시간 등 표시 언어">
          <Segmented
            value={prefs.language}
            onChange={(v) => setPreference("language", v)}
            options={[
              { value: "ko", label: "한국어" },
              { value: "en", label: "English" },
            ]}
          />
        </Row>
      </Section>

      {/* ── 테마 & UI ── */}
      <Section icon={Palette} title="테마 & UI">
        <Row label="골드 톤" hint="강조 색상 (전체 페이지에 즉시 반영)">
          <ColorPicker value={prefs.goldTone} onChange={(v) => setPreference("goldTone", v)} />
        </Row>
        <Row label="가격 상승 색상">
          <ColorPicker value={prefs.priceUpColor} onChange={(v) => setPreference("priceUpColor", v)} />
        </Row>
        <Row label="가격 하락 색상">
          <ColorPicker value={prefs.priceDownColor} onChange={(v) => setPreference("priceDownColor", v)} />
        </Row>
        <button
          onClick={() => resetPreferences(["goldTone", "priceUpColor", "priceDownColor"])}
          className="self-start flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mt-1"
        >
          <RotateCcw className="w-3 h-3" /> 테마 기본값으로 초기화
        </button>
      </Section>

      {/* ── 데이터 수집 ── */}
      <Section icon={Database} title="데이터 수집">
        <Row label="시세 캐시 주기" hint="이 시간 내 재수집 시 캐시 사용 (ZenRows 크레딧 절약)">
          <NumberInput
            value={prefs.cacheWindowHours}
            onChange={(v) => setPreference("cacheWindowHours", v)}
            min={1} max={168} suffix="시간"
          />
        </Row>
        <Row label="변화율 계산 기준" hint="포트폴리오 변화율을 몇 시간 전과 비교할지">
          <NumberInput
            value={prefs.portfolioChangeWindowHours}
            onChange={(v) => setPreference("portfolioChangeWindowHours", v)}
            min={1} max={168} suffix="시간"
          />
        </Row>
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
