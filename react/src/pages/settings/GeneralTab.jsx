import { useState } from "react";
import { Eye, RefreshCw, Loader2 } from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { fetchExchangeRates } from "@/api";
import { Section, Row, Segmented, NumberInput } from "./controls";

export default function GeneralTab() {
  const { prefs, setPreference } = usePreferences();
  const cur = prefs.currency;
  const rates = prefs.exchangeRates || {};

  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState(null);
  const [fxUpdated, setFxUpdated] = useState(null); // 표시용 갱신 시각

  async function refreshRates() {
    setFxLoading(true);
    setFxError(null);
    try {
      const { rates: fresh, updatedUnix } = await fetchExchangeRates(["KRW", "JPY"]);
      setPreference("exchangeRates", { ...rates, ...fresh });
      if (updatedUnix) setFxUpdated(new Date(updatedUnix * 1000).toLocaleDateString());
    } catch (e) {
      setFxError(e.message || "환율을 가져오지 못했습니다.");
    } finally {
      setFxLoading(false);
    }
  }

  return (
    <Section icon={Eye} title="표시 & 포맷">
      <Row label="통화" hint="가격 표시에 사용되는 통화 (시세는 USD로 수집됨)">
        <Segmented
          value={cur}
          onChange={(v) => setPreference("currency", v)}
          options={[
            { value: "USD", label: "$ USD" },
            { value: "KRW", label: "₩ KRW" },
            { value: "JPY", label: "¥ JPY" },
          ]}
        />
      </Row>

      {cur !== "USD" && (
        <div className="flex flex-col gap-2">
          <Row
            label={`환율 (1 USD = ? ${cur})`}
            hint={fxUpdated ? `자동 환율 기준일: ${fxUpdated}` : "USD 시세를 이 환율로 환산해 표시합니다"}
          >
            <NumberInput
              value={rates[cur] ?? 1}
              onChange={(v) => setPreference("exchangeRates", { ...rates, [cur]: v })}
              min={1}
              max={100000}
              widthClass="w-24"
              suffix={cur}
            />
          </Row>
          <button
            onClick={refreshRates}
            disabled={fxLoading}
            className="self-start flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
          >
            {fxLoading
              ? <><Loader2 className="w-3 h-3 animate-spin" /> 가져오는 중...</>
              : <><RefreshCw className="w-3 h-3" /> 최신 환율 가져오기</>}
          </button>
          {fxError && <p className="text-xs text-red-400">{fxError}</p>}
        </div>
      )}

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
  );
}
