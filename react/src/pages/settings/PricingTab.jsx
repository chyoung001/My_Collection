import { Database } from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { Section, Row, NumberInput } from "./controls";

export default function PricingTab() {
  const { prefs, setPreference } = usePreferences();

  return (
    <Section icon={Database} title="데이터 수집">
      <Row label="시세 캐시 주기" hint="이 시간 내 재수집 시 캐시 사용 (ZenRows 크레딧 절약)">
        <NumberInput
          value={prefs.cacheWindowHours}
          onChange={(v) => setPreference("cacheWindowHours", v)}
          min={1}
          max={168}
          suffix="시간"
        />
      </Row>
      <Row label="변화율 계산 기준" hint="포트폴리오 변화율을 몇 시간 전과 비교할지">
        <NumberInput
          value={prefs.portfolioChangeWindowHours}
          onChange={(v) => setPreference("portfolioChangeWindowHours", v)}
          min={1}
          max={168}
          suffix="시간"
        />
      </Row>
    </Section>
  );
}
