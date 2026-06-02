import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, ExternalLink, Loader2, Camera, Link2, Upload, X, Trash2, Pencil, RefreshCw } from "lucide-react";
import { apiFetch, relTime } from "@/api";
import { usePreferences } from "@/contexts/PreferencesContext";
import PriceHistoryChart from "@/components/charts/PriceHistoryChart";
import { gradeBadgeClass } from "@/lib/gradeUtils";
import { useCardDelete } from "@/hooks/useCardDelete";
import { CardImage } from "@/components/CardImage";
import RarityBadge from "@/components/RarityBadge";
import { rarityTier } from "@/lib/rarityUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// 스냅샷에서 표시용 대표 가격 추출 (대표가 우선, 평균 폴백)
function snapPrice(s) {
  return Number(s?.representativePrice ?? s?.avgPrice) || null;
}

// priceSource → 표시 라벨
function priceSourceLabel(ps) {
  switch (ps) {
    case "psa_estimate": return "PSA 추정가";
    case "last_sale":    return "마지막 거래가";
    case "median":       return "중앙값";
    default:             return "시세";
  }
}

// ── SVG 차트 빌더 ─────────────────────────────────────────────
// 헤더 뱃지/범례용 가격 통계 (차트 자체는 <PriceHistoryChart>가 그림)
function priceStats(history) {
  const prices = (history || []).map(snapPrice).filter((p) => p);
  if (prices.length < 2) return null;
  const minV = Math.min(...prices);
  const maxV = Math.max(...prices);
  const first = prices[0];
  const last = prices[prices.length - 1];
  const isUp = last >= first;
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
  return { minV, maxV, isUp, changePct, trendColor: isUp ? "#d4af37" : "#f44336" };
}

// ── 상세 행 컴포넌트 ───────────────────────────────────────────
function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] text-white/40 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-white font-medium">{value}</p>
    </div>
  );
}

// ── 스탯 카드 ─────────────────────────────────────────────────
function StatCard({ label, value, sub, highlight, color, badge }) {
  const textColor = color === "up"   ? "text-green-400"
                  : color === "down" ? "text-red-400"
                  : highlight        ? "text-gold"
                  :                    "text-white";
  return (
    <div className="glass-card !p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-white/40 uppercase tracking-wider">{label}</p>
        {badge}
      </div>
      <p className={`font-poppins font-bold text-xl ${textColor}`}>{value}</p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </div>
  );
}

// ── 신뢰도 배지 ─────────────────────────────────────────────────
const CONFIDENCE_STYLES = {
  HIGH:   { bg: "bg-green-500/20 text-green-300 border-green-500/40", label: "신뢰 높음" },
  MEDIUM: { bg: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40", label: "참고치" },
  LOW:    { bg: "bg-orange-500/20 text-orange-300 border-orange-500/40", label: "신뢰 낮음" },
  NONE:   { bg: "bg-red-500/20 text-red-300 border-red-500/40", label: "데이터 없음" },
};
function ConfidenceBadge({ level, reasons, sampleSize }) {
  if (!level) return null;
  const style = CONFIDENCE_STYLES[level] || CONFIDENCE_STYLES.LOW;
  const tip = [`표본 ${sampleSize ?? 0}건`, ...(reasons || [])].join(" · ");
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border ${style.bg} font-medium tracking-tight whitespace-nowrap`}
      title={tip}
    >
      {style.label}
    </span>
  );
}

// ── CardDetail 메인 ────────────────────────────────────────────
export default function CardDetail() {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { fmtMoney } = usePreferences();

  const [card, setCard] = useState(state?.card || null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // 이미지 편집 모달
  const [imgModalOpen, setImgModalOpen] = useState(false);
  const [imgUrl, setImgUrl] = useState("");
  const [imgPreview, setImgPreview] = useState(null);
  const [imgSaving, setImgSaving] = useState(false);
  const fileInputRef = useRef(null);

  // 구매가격 편집
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [buyInput, setBuyInput] = useState("");
  const [buySaving, setBuySaving] = useState(false);
  // 판매 모달
  const [soldModalOpen, setSoldModalOpen] = useState(false);
  const [soldPriceInput, setSoldPriceInput] = useState("");
  const [soldDateInput, setSoldDateInput] = useState("");
  const [soldSaving, setSoldSaving] = useState(false);

  // 라이트박스
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // 시세 수집
  const [fetching, setFetching] = useState(false);

  // 최신 스냅샷 메타 (신뢰도, priceSource 등) — 시세 수집 직후 / latest 호출 후 갱신
  const [latestMeta, setLatestMeta] = useState(null);

  async function handleFetchPrice(force = false) {
    if (!force && !confirm("최신 시세를 수집합니다. (PSA 카드는 PSA 추정가 우선, 없으면 130point)\n(ZenRows 포인트가 소모됩니다)")) return;
    setFetching(true);
    try {
      const qs = force ? "?force=1" : "";
      const res = await apiFetch(`/api/snapshots/${card.id}/fetch${qs}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "rare_card_blocked") {
          if (confirm(`${data.message}\n\n강제로 수집할까요?`)) {
            await handleFetchPrice(true);
          }
          return;
        }
        alert(`수집 실패: ${data.message || data.error}`);
        return;
      }
      // _debug.rawHtml은 디버그(DEBUG_SCRAPE=1)일 때만 옴 — 콘솔에만 남기고 흐름은 계속.
      if (data._debug?.rawHtml) {
        console.warn("[scrape] 결과 없음, raw HTML(디버그):", data._debug.rawHtml);
      }
      const price = data.representativePrice ?? data.avgPrice;
      const noPrice = price == null;
      setCard((prev) => ({ ...prev, currentPrice: price ?? prev.currentPrice }));
      setLatestMeta({
        confidence: data.confidence,
        priceSource: data.priceSource,
        lastSale: data.lastSale,
        filterStats: data.filterStats,
        source: data.source,
        estimateRange: data.estimateRange,
      });
      await loadHistory();
      if (noPrice) {
        // PSA 추정가도, 130point 거래내역도 없음 → 가격정보 없음
        alert("가격 정보를 찾지 못했습니다.\n(PSA 추정가·130point 거래내역 모두 없음)");
      } else {
        const conf = data.confidence?.level ?? "?";
        const cntStr = data.saleCount != null ? `${data.saleCount}건 · ` : "";
        alert(
          `수집 완료!\n${priceSourceLabel(data.priceSource)} $${price ?? "—"} (${cntStr}신뢰도 ${conf})`
        );
      }
    } catch (e) {
      alert("서버 통신 중 오류가 발생했습니다.");
      console.error(e);
    } finally {
      setFetching(false);
    }
  }

  // 희소 카드 플래그 토글
  async function toggleRareFlag() {
    const next = !card.isRare;
    const action = next ? "희소 카드(1/1·SSP)로 표시" : "일반 카드로 되돌리기";
    if (!confirm(`${action}하시겠습니까?`)) return;
    try {
      const res = await apiFetch(`/api/cards/${card.id}/rare-flag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRare: next }),
      });
      if (!res.ok) { alert("플래그 변경에 실패했습니다."); return; }
      setCard((prev) => ({ ...prev, isRare: next }));
    } catch (e) {
      alert("서버 통신 중 오류가 발생했습니다.");
      console.error(e);
    }
  }

  // 카드 삭제
  const { deleteCard, deleting } = useCardDelete({ navigateTo: "/collection" });

  // 카드 단건 조회 — 항상 최신 정보로 마운트.
  // navigate state로 받은 카드는 초기 표시용으로만 유지하고, 즉시 백엔드에서 다시 가져온다.
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/cards/${id}`)
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          if (r.status === 404) navigate("/collection", { replace: true });
          return;
        }
        setCard(await r.json());
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id, navigate]);

  // 시세 이력 로드
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/api/snapshots/${id}/history?limit=30`);
      if (!res.ok) return;
      const list = await res.json();
      setHistory(list);
      // 가장 최근 스냅샷의 신뢰도 메타 추출
      const last = list[list.length - 1];
      if (last) {
        setLatestMeta({
          confidence: last.confidence,
          priceSource: last.priceSource,
          lastSale: last.lastSale,
          representativePrice: last.representativePrice,
          source: last.source,
          estimateRange: last.estimateRange,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  }, [id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Cert 번호 복사
  function copyCert() {
    if (!card?.certNumber) return;
    navigator.clipboard.writeText(card.certNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // 파일 → base64 변환
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("5MB 이하 이미지만 업로드할 수 있습니다.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImgPreview(ev.target.result);
      setImgUrl("");
    };
    reader.readAsDataURL(file);
  }

  // 이미지 저장 (URL 또는 base64)
  async function handleImgSave() {
    const finalUrl = imgPreview || imgUrl.trim();
    if (!finalUrl) { alert("이미지를 선택하거나 URL을 입력해 주세요."); return; }

    setImgSaving(true);
    try {
      const res = await apiFetch(`/api/cards/${card.id}/image`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: finalUrl }),
      });
      if (!res.ok) { alert("이미지 저장에 실패했습니다."); return; }
      setCard((prev) => ({ ...prev, imageUrl: finalUrl }));
      setImgModalOpen(false);
      setImgUrl("");
      setImgPreview(null);
    } catch {
      alert("서버 통신 중 오류가 발생했습니다.");
    } finally {
      setImgSaving(false);
    }
  }

  // priceArg가 명시되면 그 값을 저장(initialize-by-null 케이스), 아니면 buyInput에서 파싱
  async function handleBuySave(priceArg) {
    let price;
    if (priceArg !== undefined) {
      price = priceArg;
    } else {
      const trimmed = buyInput.trim();
      if (trimmed === "") {
        price = null;
      } else {
        const n = Number(trimmed.replace(/,/g, ""));
        if (isNaN(n)) { alert("올바른 숫자를 입력해 주세요."); return; }
        price = n;
      }
    }
    setBuySaving(true);
    try {
      const res = await apiFetch(`/api/cards/${card.id}/purchase-price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchasePrice: price }),
      });
      if (!res.ok) { alert("저장에 실패했습니다."); return; }
      setCard((prev) => ({ ...prev, purchasePrice: price }));
      setBuyInput(price != null ? String(price) : "");
      setBuyModalOpen(false);
    } catch {
      alert("서버 통신 중 오류가 발생했습니다.");
    } finally {
      setBuySaving(false);
    }
  }

  function openBuyModal() {
    setBuyInput(card?.purchasePrice != null ? String(card.purchasePrice) : "");
    setBuyModalOpen(true);
  }

  // 판매 등록 — 판매가/날짜 저장 → 카드가 SOLD 상태로 전환(보유·포트폴리오에서 제외, 실현손익 집계)
  async function handleSold() {
    const trimmed = soldPriceInput.trim().replace(/,/g, "");
    if (trimmed === "" || isNaN(Number(trimmed))) { alert("판매가를 입력해 주세요."); return; }
    const price = Number(trimmed);
    setSoldSaving(true);
    try {
      const res = await apiFetch(`/api/cards/${card.id}/sold`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soldPrice: price, soldAt: soldDateInput || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.message || "판매 등록에 실패했습니다."); return; }
      setCard((prev) => ({ ...prev, soldAt: data.soldAt ?? new Date().toISOString(), soldPrice: price }));
      setSoldModalOpen(false);
    } catch {
      alert("서버 통신 중 오류가 발생했습니다.");
    } finally {
      setSoldSaving(false);
    }
  }

  async function handleUnsell() {
    if (!confirm("판매를 취소하고 다시 보유 상태로 되돌릴까요?")) return;
    try {
      const res = await apiFetch(`/api/cards/${card.id}/unsell`, { method: "PATCH" });
      if (!res.ok) { alert("판매 취소에 실패했습니다."); return; }
      setCard((prev) => ({ ...prev, soldAt: null, soldPrice: null, soldNote: null }));
    } catch {
      alert("서버 통신 중 오류가 발생했습니다.");
    }
  }

  function openSoldModal() {
    setSoldPriceInput(card?.currentPrice != null ? String(card.currentPrice) : "");
    setSoldDateInput(new Date().toISOString().slice(0, 10));
    setSoldModalOpen(true);
  }

  function openImgModal() {
    setImgUrl(card?.imageUrl?.startsWith("data:") ? "" : (card?.imageUrl || ""));
    setImgPreview(null);
    setImgModalOpen(true);
  }

  const trend = useMemo(() => priceStats(history), [history]);

  const latestSnap = history[history.length - 1];
  const firstSnap  = history[0];
  const latestPrice = snapPrice(latestSnap);
  const firstPrice  = snapPrice(firstSnap);
  const priceChange =
    latestPrice && firstPrice
      ? (((latestPrice - firstPrice) / firstPrice) * 100).toFixed(1)
      : null;

  if (!card) {
    return (
      <div className="flex justify-center items-center h-64 text-white/30">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // PSA Population — 등록(PSA API: PascalCase) / 시세수집(scrape) 양쪽 키를 모두 지원.
  const popRaw = card.psaPopulation || {};
  const totalPopNum = Number(popRaw.TotalPopulation ?? popRaw.totalPopulation ?? popRaw.Pop10 ?? popRaw.pop10);
  const totalPop = Number.isFinite(totalPopNum) ? totalPopNum : null;
  const popHigherNum = Number(popRaw.PopulationHigher ?? popRaw.populationHigher);
  const popHigher = Number.isFinite(popHigherNum) ? popHigherNum : null;
  const isPsaEstimate = latestMeta?.priceSource === "psa_estimate";
  const rarity = rarityTier(card);

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* 뒤로 가기 + 브레드크럼 */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/collection")}
          className="shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/40 uppercase tracking-wider">
            My Collection{card.category ? ` / ${card.category}` : ""}
          </p>
          <h2 className="font-poppins font-bold text-lg text-white leading-tight truncate">
            {[card.year, card.setName, card.subject, card.cardNumber && `#${card.cardNumber}`]
              .filter(Boolean).join(" ")}
          </h2>
        </div>
        {card.grade && (
          <span className={`px-2.5 py-1 rounded-lg text-xs font-black border tracking-wide shrink-0 ${gradeBadgeClass(card.grade)}`}>
            {card.grade}
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <button
            onClick={toggleRareFlag}
            title={card.isRare
              ? "희소 카드로 표시됨 — 클릭하여 해제"
              : "1/1·SSP·저한정 카드로 표시 (자동 시세 수집 차단)"}
            className={`h-9 px-2.5 rounded-md text-[11px] font-medium border transition-colors ${
              card.isRare
                ? "bg-orange-500/20 text-orange-300 border-orange-500/40 hover:bg-orange-500/30"
                : "bg-white/5 text-white/40 border-white/10 hover:text-white/70"
            }`}
          >
            {card.isRare ? "★ 희소" : "희소 카드?"}
          </button>
          {card.soldAt ? (
            <>
              <span className="h-9 px-2.5 inline-flex items-center rounded-md text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                SOLD
              </span>
              <Button variant="secondary" size="sm" onClick={handleUnsell} title="판매 취소 (다시 보유)" className="h-9 px-3 gap-1.5 text-xs">
                판매 취소
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={openSoldModal} title="판매 등록" className="h-9 px-3 gap-1.5 text-xs">
                판매
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleFetchPrice(false)}
                disabled={fetching}
                title="130point.com에서 시세 수집"
                className="h-9 px-3 gap-1.5 text-xs"
              >
                {fetching
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />수집 중...</>
                  : <><RefreshCw className="w-3.5 h-3.5" />시세 수집</>}
              </Button>
            </>
          )}
          <Button
            variant="destructive"
            size="icon"
            onClick={() => deleteCard(card.id, card.subject)}
            disabled={deleting}
            title="카드 삭제"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* 본문 2컬럼 */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">

        {/* ── 왼쪽: 이미지 + 인증 정보 ── */}
        <div className="flex flex-col gap-4">
          {/* 카드 이미지 */}
          <div className="glass-card !p-3 flex flex-col gap-2">
            {/* 이미지 클릭 → 라이트박스 */}
            <div
              className={`group/img relative aspect-[5/7] rounded-xl overflow-hidden bg-[#0a0f1e] flex items-center justify-center cursor-zoom-in ${rarity ? `rarity-${rarity.tier}` : ""}`}
              onClick={() => card.imageUrl && setLightboxOpen(true)}
              title="크게 보기"
            >
              <CardImage
                src={card.imageUrl}
                alt={card.subject}
                className="w-full h-full object-contain transition-transform duration-300 group-hover/img:scale-105"
              />
              {rarity && (
                <RarityBadge card={card} className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 shadow-lg" />
              )}
            </div>

            {/* 이미지 변경 버튼 — 하단 작게 */}
            <button
              onClick={openImgModal}
              className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              {card.imageUrl ? "이미지 변경" : "이미지 등록"}
            </button>
          </div>

          {/* 인증 & 상세 정보 */}
          <div className="glass-card flex flex-col gap-4">
            <h3 className="font-poppins font-bold text-base text-gold">
              Authentication & Details
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailRow label="Year"       value={card.year} />
              <DetailRow label="Set"        value={card.setName} />
              <DetailRow label="Card #"     value={card.cardNumber} />
              <DetailRow label="Variety"    value={card.variety} />
              <DetailRow label="Category"   value={card.category} />
              <DetailRow label="Grader"     value={card.grader} />
            </div>
            {card.certNumber && (
              <div className="border-t border-white/10 pt-3">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Cert Number</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-lg text-white tracking-widest">
                    {card.certNumber}
                  </span>
                  <button
                    onClick={copyCert}
                    className="p-1 rounded text-white/30 hover:text-gold transition-colors"
                    title="복사"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  {copied && <span className="text-xs text-gold">복사됨!</span>}
                  <a
                    href={`https://www.psacard.com/cert/${card.certNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded text-white/30 hover:text-gold transition-colors"
                    title="PSA 조회"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 오른쪽: 스탯 + 차트 + 이력 ── */}
        <div className="flex flex-col gap-4">
          {/* 스탯 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            <StatCard
              label={card.soldAt ? "Realized P&L" : "Current Value"}
              value={
                card.soldAt
                  ? (card.purchasePrice != null && card.soldPrice != null
                      ? `${card.soldPrice - card.purchasePrice >= 0 ? "+" : ""}${fmtMoney(card.soldPrice - card.purchasePrice)}`
                      : (card.soldPrice != null ? fmtMoney(card.soldPrice) : "—"))
                  : (card.currentPrice ? fmtMoney(card.currentPrice) : "—")
              }
              sub={
                card.soldAt
                  ? `판매가 ${card.soldPrice != null ? fmtMoney(card.soldPrice) : "—"} · ${relTime(card.soldAt)}`
                  : latestSnap
                  ? `${relTime(latestSnap.fetchedAt)}${
                      latestMeta?.priceSource ? ` · ${priceSourceLabel(latestMeta.priceSource)}` : ""
                    }`
                  : undefined
              }
              color={
                card.soldAt && card.purchasePrice != null && card.soldPrice != null
                  ? (card.soldPrice - card.purchasePrice >= 0 ? "up" : "down")
                  : undefined
              }
              highlight
              badge={
                !card.soldAt && latestMeta?.confidence ? (
                  <ConfidenceBadge
                    level={latestMeta.confidence.level}
                    reasons={latestMeta.confidence.reasons}
                    sampleSize={latestMeta.confidence.sampleSize}
                  />
                ) : null
              }
            />
            <StatCard
              label="Price Change"
              value={priceChange !== null ? `${priceChange >= 0 ? "+" : ""}${priceChange}%` : "—"}
              sub={history.length > 1 ? `${history.length}회 기준` : undefined}
              color={priceChange === null ? undefined : priceChange >= 0 ? "up" : "down"}
            />
            <StatCard
              label="Min / Max"
              value={trend ? `${fmtMoney(trend.minV)} / ${fmtMoney(trend.maxV)}` : "—"}
              sub="수집 기간 내"
            />
            <StatCard
              label={card.grade ? `PSA Pop ${card.grade}` : "PSA Pop"}
              value={totalPop !== null ? totalPop.toLocaleString() : "—"}
              sub={popHigher !== null ? `동일 등급 · 상위 ${popHigher.toLocaleString()}` : "동일 등급 개체수"}
            />
            {/* 구매가격 카드 — 클릭하여 편집 */}
            {(() => {
              const bp = card.purchasePrice;
              const cp = card.currentPrice;
              const gain = bp && cp ? cp - bp : null;
              const gainPct = bp && cp ? ((cp - bp) / bp * 100).toFixed(1) : null;
              return (
                <button
                  onClick={openBuyModal}
                  className="glass-card !p-4 flex flex-col gap-1 text-left group hover:border-gold/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider">Buy Price</p>
                    <Pencil className="w-3 h-3 text-white/20 group-hover:text-gold/60 transition-colors" />
                  </div>
                  <p className="font-poppins font-bold text-xl text-white">
                    {bp != null ? fmtMoney(bp) : <span className="text-white/30 text-base">미입력</span>}
                  </p>
                  {gainPct !== null && (
                    <p className={`text-xs font-semibold ${gain >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {gain >= 0 ? "+" : ""}{fmtMoney(gain)} ({gainPct >= 0 ? "+" : ""}{gainPct}%)
                    </p>
                  )}
                  {bp == null && <p className="text-xs text-white/30">클릭하여 입력</p>}
                </button>
              );
            })()}
          </div>

          {/* PSA Estimate 안내 */}
          {isPsaEstimate && (
            <div className="glass-card !p-3 border border-gold/30 bg-gold/5">
              <div className="flex items-start gap-2">
                <span className="text-gold text-sm leading-tight">◆</span>
                <div className="flex-1 text-xs leading-relaxed">
                  <p className="font-medium mb-0.5 text-gold">PSA Estimate · PSA 공식 추정가</p>
                  <p className="text-white/60">
                    {latestMeta.estimateRange &&
                      `범위 ${fmtMoney(latestMeta.estimateRange.low)} ~ ${fmtMoney(latestMeta.estimateRange.high)}`}
                    {latestMeta.confidence?.psaConfidence && <> · 신뢰도 {latestMeta.confidence.psaConfidence}</>}
                    {totalPop !== null && <> · 동일 등급 {totalPop.toLocaleString()}개</>}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 낮은 신뢰도 안내 (130point 한정 — PSA 추정가는 위 배너로 대체) */}
          {latestMeta?.confidence && !isPsaEstimate && ["LOW", "NONE"].includes(latestMeta.confidence.level) && (
            <div className="glass-card !p-3 border border-orange-500/30 bg-orange-500/10">
              <div className="flex items-start gap-2">
                <span className="text-orange-300 text-sm leading-tight">⚠</span>
                <div className="flex-1 text-xs text-orange-100/90 leading-relaxed">
                  <p className="font-medium mb-0.5">시세 신뢰도가 낮습니다</p>
                  <p className="text-orange-100/70">
                    {latestMeta.confidence.level === "NONE"
                      ? "130point에서 거래 이력을 찾지 못했습니다. 수동 입력을 권장합니다."
                      : `표본이 적거나(${latestMeta.confidence.sampleSize}건) 오래된 거래입니다. 표시 가격은 참고용으로만 사용하세요.`}
                    {latestMeta.lastSale && (
                      <> · 마지막 거래: {fmtMoney(latestMeta.lastSale.price)} ({(latestMeta.lastSale.date || "").slice(0, 10)})</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 시세 차트 */}
          <div className="glass-card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <h3 className="font-poppins font-bold text-base text-white">Price History</h3>
                {trend && (
                  <span
                    style={{
                      background: trend.isUp ? "rgba(76,175,80,0.15)" : "rgba(244,67,54,0.15)",
                      color: trend.isUp ? "#4caf50" : "#f44336",
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold font-poppins"
                  >
                    {trend.isUp ? "▲" : "▼"} {Math.abs(trend.changePct).toFixed(2)}%
                  </span>
                )}
              </div>
              {trend && (
                <div className="flex gap-3 text-xs text-white/40">
                  <span>최저 <span className="text-white/70 font-medium">{fmtMoney(trend.minV)}</span></span>
                  <span>최고 <span className="font-bold" style={{ color: trend.trendColor }}>{fmtMoney(trend.maxV)}</span></span>
                </div>
              )}
            </div>

            <div style={{ width: "100%", position: "relative" }}>
              {historyLoading ? (
                <div className="flex items-center justify-center text-white/20" style={{ height: 240 }}>
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <PriceHistoryChart data={history} height={240} />
              )}
            </div>
          </div>

          {/* 최근 시세 이력 테이블 */}
          <div className="glass-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-poppins font-bold text-base text-white">Recent Snapshots</h3>
              <span className="text-xs text-white/40">{history.length}건</span>
            </div>

            {historyLoading ? (
              <div className="flex justify-center py-6 text-white/20">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-white/30 text-center py-6">아직 수집된 시세 데이터가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-[10px] text-white/40 uppercase tracking-wider pb-2 font-medium">날짜</th>
                      <th className="text-right text-[10px] text-white/40 uppercase tracking-wider pb-2 font-medium">대표 가격</th>
                      <th className="text-right text-[10px] text-white/40 uppercase tracking-wider pb-2 font-medium">최저 / 최고</th>
                      <th className="text-right text-[10px] text-white/40 uppercase tracking-wider pb-2 font-medium">거래수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().slice(0, 10).map((snap, i) => {
                      const price = snapPrice(snap);
                      return (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-2.5 text-white/60 text-xs">{relTime(snap.fetchedAt)}</td>
                          <td className="py-2.5 text-right font-poppins font-bold text-gold">
                            {price ? fmtMoney(price) : "—"}
                          </td>
                          <td className="py-2.5 text-right text-white/40 text-xs">
                            {snap.minPrice && snap.maxPrice
                              ? `${fmtMoney(snap.minPrice)} / ${fmtMoney(snap.maxPrice)}`
                              : "—"}
                          </td>
                          <td className="py-2.5 text-right text-white/40 text-xs">
                            {snap.saleCount ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 라이트박스 */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
          <CardImage
            src={card.imageUrl}
            alt={card.subject}
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* 구매가격 편집 모달 */}
      <Dialog open={buyModalOpen} onOpenChange={setBuyModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>구매가격 입력</DialogTitle>
            <DialogDescription>이 카드를 구입한 금액을 입력하세요 (USD).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs text-white/50 uppercase tracking-wider">구매가격 (USD)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="예: 250.00"
                value={buyInput}
                onChange={(e) => setBuyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBuySave()}
                autoFocus
              />
            </div>
            {buyInput && card.currentPrice && !isNaN(Number(buyInput)) && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center justify-between">
                <span className="text-xs text-white/50">예상 수익</span>
                {(() => {
                  const gain = card.currentPrice - Number(buyInput);
                  const pct = (gain / Number(buyInput) * 100).toFixed(1);
                  return (
                    <span className={`text-sm font-bold ${gain >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {gain >= 0 ? "+" : ""}{fmtMoney(gain)} ({pct >= 0 ? "+" : ""}{pct}%)
                    </span>
                  );
                })()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => handleBuySave(null)} className="text-white/40 mr-auto text-xs">
              초기화
            </Button>
            <Button variant="secondary" onClick={() => setBuyModalOpen(false)}>취소</Button>
            <Button onClick={() => handleBuySave()} disabled={buySaving}>
              {buySaving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</> : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 판매 등록 모달 */}
      <Dialog open={soldModalOpen} onOpenChange={setSoldModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>판매 등록</DialogTitle>
            <DialogDescription>판매가와 날짜를 입력하세요 (USD). 판매하면 보유 목록·포트폴리오에서 빠지고 실현 손익으로 집계됩니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs text-white/50 uppercase tracking-wider">판매가 (USD)</label>
              <Input
                type="number" min="0" step="0.01" placeholder="예: 300.00"
                value={soldPriceInput}
                onChange={(e) => setSoldPriceInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSold()}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-white/50 uppercase tracking-wider">판매일</label>
              <Input type="date" value={soldDateInput} onChange={(e) => setSoldDateInput(e.target.value)} />
            </div>
            {soldPriceInput && card.purchasePrice != null && !isNaN(Number(soldPriceInput)) && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center justify-between">
                <span className="text-xs text-white/50">실현 손익</span>
                {(() => {
                  const gain = Number(soldPriceInput) - card.purchasePrice;
                  const pct = (gain / card.purchasePrice * 100).toFixed(1);
                  return (
                    <span className={`text-sm font-bold ${gain >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {gain >= 0 ? "+" : ""}{fmtMoney(gain)} ({pct >= 0 ? "+" : ""}{pct}%)
                    </span>
                  );
                })()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSoldModalOpen(false)}>취소</Button>
            <Button onClick={() => handleSold()} disabled={soldSaving}>
              {soldSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</> : "판매 등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 이미지 편집 모달 */}
      <Dialog open={imgModalOpen} onOpenChange={(o) => { setImgModalOpen(o); if (!o) { setImgPreview(null); setImgUrl(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>이미지 변경</DialogTitle>
            <DialogDescription>URL을 입력하거나 파일을 직접 업로드하세요.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="file">
            <TabsList>
              <TabsTrigger value="file"><Upload className="w-3.5 h-3.5 mr-1.5" />파일 업로드</TabsTrigger>
              <TabsTrigger value="url"><Link2 className="w-3.5 h-3.5 mr-1.5" />URL 입력</TabsTrigger>
            </TabsList>

            {/* 파일 업로드 탭 */}
            <TabsContent value="file" className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              {imgPreview ? (
                <div className="relative rounded-xl overflow-hidden bg-[#0a0f1e] aspect-[5/7] flex items-center justify-center">
                  <img src={imgPreview} alt="preview" className="w-full h-full object-contain" />
                  <button
                    onClick={() => { setImgPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    className="absolute top-2 right-2 p-1 rounded-lg bg-black/70 text-white/60 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-[5/3] rounded-xl border-2 border-dashed border-white/20 hover:border-gold/40 hover:bg-gold/5 transition-all flex flex-col items-center justify-center gap-3 text-white/40 hover:text-white/60"
                >
                  <Upload className="w-8 h-8" />
                  <div className="text-center">
                    <p className="text-sm font-medium">클릭해서 파일 선택</p>
                    <p className="text-xs mt-0.5">JPG, PNG, WEBP · 최대 5MB</p>
                  </div>
                </button>
              )}
            </TabsContent>

            {/* URL 입력 탭 */}
            <TabsContent value="url" className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-white/50 uppercase tracking-wider">이미지 URL</label>
                <Input
                  placeholder="https://..."
                  value={imgUrl}
                  onChange={(e) => { setImgUrl(e.target.value); setImgPreview(null); }}
                />
              </div>
              {imgUrl && (
                <div className="rounded-xl overflow-hidden bg-[#0a0f1e] aspect-[5/7] flex items-center justify-center">
                  <img
                    src={imgUrl}
                    alt="preview"
                    className="w-full h-full object-contain"
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setImgModalOpen(false)}>취소</Button>
            <Button onClick={handleImgSave} disabled={imgSaving || (!imgPreview && !imgUrl.trim())}>
              {imgSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</> : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
