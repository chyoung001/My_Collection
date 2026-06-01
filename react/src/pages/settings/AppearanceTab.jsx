import { Palette, RotateCcw } from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { Section, Row, ColorPicker } from "./controls";

export default function AppearanceTab() {
  const { prefs, setPreference, resetPreferences } = usePreferences();

  return (
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
  );
}
