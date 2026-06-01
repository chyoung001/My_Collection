import { Info, FileText, ExternalLink } from "lucide-react";
import { getApiBase } from "@/api";
import { Section, Row } from "./controls";

export default function AboutTab() {
  const docsUrl = getApiBase() + "/docs";

  return (
    <div className="flex flex-col gap-6">
      <Section icon={Info} title="앱 정보">
        <Row label="이름">
          <span className="text-sm text-white/60">My Collection</span>
        </Row>
        <Row label="설명">
          <span className="text-sm text-white/60 text-right">카드 포트폴리오 관리</span>
        </Row>
        <a
          href={docsUrl}
          target="_blank"
          rel="noreferrer"
          className="self-start flex items-center gap-1.5 text-xs text-[var(--gold-base)] hover:underline mt-1"
        >
          <FileText className="w-3.5 h-3.5" /> API 문서 (Swagger)
          <ExternalLink className="w-3 h-3" />
        </a>
      </Section>

      <Section icon={Info} title="데이터 출처">
        <p className="text-xs text-white/40 leading-relaxed">
          시세 데이터는 130point / eBay 낙찰가를 기반으로 수집되며 USD 기준입니다.
          인증 정보는 PSA Public API에서 조회합니다. 표시 가격은 참고용이며 실제 거래가와 다를 수 있습니다.
        </p>
      </Section>
    </div>
  );
}
