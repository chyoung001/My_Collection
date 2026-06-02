import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson, relTime } from "../api.js";
import { CardImage } from "@/components/CardImage";
import { usePreferences } from "@/contexts/PreferencesContext";
import PortfolioTrendChart from "@/components/charts/PortfolioTrendChart";
import GradeDonut from "@/components/charts/GradeDonut";
import GainLossChart from "@/components/charts/GainLossChart";

export default function Dashboard() {
  const { fmtMoney } = usePreferences();
  const [summary, setSummary] = useState(null);
  const [snapshotSummary, setSnapshotSummary] = useState(null);
  const [topGainer, setTopGainer] = useState(null);
  const [topPerformers, setTopPerformers] = useState(null);
  const [history, setHistory] = useState(null);   // portfolio-history [{t, value}]
  const [gain, setGain] = useState(null);          // { total, pct, perCard, count } — 미실현(보유)
  const [realized, setRealized] = useState(null);  // 실현 손익 요약 (판매 카드)
  const [error, setError] = useState(null);

  const loadSummary = useCallback(async () => setSummary(await apiJson("/api/dashboard/summary")), []);
  const loadSnapshotSummary = useCallback(async () => setSnapshotSummary(await apiJson("/api/snapshots/summary")), []);
  const loadTopGainer = useCallback(async () => setTopGainer(await apiJson("/api/dashboard/top-gainer")), []);

  const loadTopPerformers = useCallback(async () => {
    const snaps = await apiJson("/api/snapshots/latest");
    const withPrice = (snaps || [])
      .map((s) => ({ ...s, displayPrice: Number(s.representativePrice ?? s.avgPrice) || null }))
      .filter((s) => s.displayPrice);
    setTopPerformers(withPrice.sort((a, b) => b.displayPrice - a.displayPrice).slice(0, 8));
  }, []);

  const loadHistory = useCallback(async () => {
    setHistory(await apiJson("/api/snapshots/portfolio-history"));
  }, []);

  // 구매가 대비 손익 — /api/cards가 purchasePrice + currentPrice를 모두 제공 → 클라에서 계산
  const loadGain = useCallback(async () => {
    const cards = await apiJson("/api/cards?status=active");
    const withCost = (cards || [])
      .filter((c) => c.purchasePrice != null && c.currentPrice != null)
      .map((c) => ({ subject: c.subject, purchase: Number(c.purchasePrice), current: Number(c.currentPrice) }))
      .filter((c) => Number.isFinite(c.purchase) && c.purchase > 0 && Number.isFinite(c.current) && c.current > 0);
    const totalCost = withCost.reduce((s, c) => s + c.purchase, 0);
    const totalCurrent = withCost.reduce((s, c) => s + c.current, 0);
    const total = totalCurrent - totalCost;
    const pct = totalCost > 0 ? (total / totalCost) * 100 : 0;
    const perCard = withCost
      .map((c) => ({ subject: c.subject, gain: c.current - c.purchase, pct: c.purchase > 0 ? ((c.current - c.purchase) / c.purchase) * 100 : 0 }))
      .sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain))
      .slice(0, 6)
      .reverse(); // 가로 막대는 아래→위로 그려지므로 큰 값이 위로 오게 reverse
    setGain({ total, pct, perCard, count: withCost.length });
  }, []);

  const loadRealized = useCallback(async () => setRealized(await apiJson("/api/dashboard/realized")), []);

  const loadAll = useCallback(async () => {
    setError(null);
    const results = await Promise.allSettled([
      loadSummary(), loadSnapshotSummary(), loadTopGainer(), loadTopPerformers(), loadHistory(), loadGain(), loadRealized(),
    ]);
    const failed = results.find((r) => r.status === "rejected");
    if (failed) {
      const allFailed = results.every((r) => r.status === "rejected");
      setError(allFailed ? (failed.reason?.message || "대시보드를 불러오지 못했습니다.") : "일부 정보를 불러오지 못했습니다.");
    }
  }, [loadSummary, loadSnapshotSummary, loadTopGainer, loadTopPerformers, loadHistory, loadGain, loadRealized]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") loadAll(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadAll]);

  // 포트폴리오 가치/변화율 — portfolio-history의 마지막/처음 값으로 통일(헤드라인·차트·뱃지 일치)
  const pfValue = history?.length ? history[history.length - 1].value : (snapshotSummary?.totalMarketValue ?? null);
  const pfFirst = history?.length ? history[0].value : null;
  const pfPct = pfFirst && pfFirst > 0 ? ((pfValue - pfFirst) / pfFirst) * 100 : null;
  const pfUp = (pfPct ?? 0) >= 0;
  const lastUpdated = snapshotSummary?.latestSnapshot ? relTime(snapshotSummary.latestSnapshot) : "—";

  return (
    <div className="flex flex-col gap-3 p-5 max-[820px]:p-3.5 max-[820px]:gap-2.5">

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(244,67,54,0.4)] bg-[rgba(244,67,54,0.1)] px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] text-[#ff8a80]">
            <i className="ri-error-warning-line text-base" />
            {error}
          </span>
          <button onClick={loadAll} className="shrink-0 rounded-lg border border-[rgba(244,67,54,0.4)] px-3 py-1 text-xs font-semibold text-[#ff8a80] hover:bg-[rgba(244,67,54,0.15)]">
            다시 시도
          </button>
        </div>
      )}

      {/* 2단 구조: 좌(메인) | 우(Top Performers, 전체 높이) */}
      <div className="grid gap-[10px] items-stretch grid-cols-[1fr_360px] max-[1300px]:grid-cols-[1fr_320px] max-[900px]:grid-cols-1">

        {/* ── 좌측 컬럼 ── */}
        <div className="flex flex-col gap-[10px] min-w-0">

          {/* 스탯 4 */}
          <div className="grid grid-cols-4 gap-[10px] max-[1100px]:grid-cols-2">
            <StatCard
              icon="ri-money-dollar-circle-line"
              label="Portfolio Value"
              value={pfValue != null ? fmtMoney(pfValue) : "—"}
              sub={pfPct != null ? `${pfUp ? "+" : ""}${pfPct.toFixed(2)}%` : undefined}
              subColor={pfPct != null ? (pfUp ? "var(--price-up)" : "var(--price-down)") : undefined}
            />
            <StatCard
              icon="ri-stack-line"
              label="Total Cards"
              value={summary?.totalCards ?? "—"}
              sub={snapshotSummary?.snapshotCount ? `${snapshotSummary.snapshotCount}개 시세 수집` : undefined}
            />
            <StatCard
              icon="ri-trophy-line"
              label="PSA 10 Gems"
              value={summary?.psa10Count ?? "—"}
              sub={snapshotSummary?.latestSnapshot ? `마지막 수집 ${lastUpdated}` : undefined}
            />
            <StatCard
              icon={gain && gain.count && gain.total < 0 ? "ri-arrow-down-line" : "ri-line-chart-line"}
              label="Unrealized P&L"
              value={gain && gain.count ? `${gain.total >= 0 ? "+" : ""}${fmtMoney(gain.total)}` : "—"}
              sub={gain && gain.count ? `${gain.total >= 0 ? "+" : ""}${gain.pct.toFixed(1)}% · ${gain.count}장 기준` : "구매가 입력 필요"}
              subColor={gain && gain.count ? (gain.total >= 0 ? "var(--price-up)" : "var(--price-down)") : undefined}
              iconColor={gain && gain.count && gain.total < 0 ? "rgba(244,67,54,0.15)" : "rgba(76,175,80,0.15)"}
              iconTextColor={gain && gain.count && gain.total < 0 ? "var(--price-down)" : "var(--price-up)"}
              highlight
            />
          </div>

          {/* Portfolio Trend (정확한 시계열) */}
          <ChartCard
            title="Portfolio Trend"
            badge={pfPct != null ? { up: pfUp, text: `${Math.abs(pfPct).toFixed(2)}%` } : null}
            right={lastUpdated}
          >
            <PortfolioTrendChart data={history} height={260} />
            {history?.length >= 2 && (
              <div className="flex justify-between mt-1.5 text-[11px] text-[var(--text-secondary)]">
                <span>시작 <b>{fmtMoney(pfFirst)}</b></span>
                <span>현재 <b className="text-gold">{fmtMoney(pfValue)}</b></span>
              </div>
            )}
          </ChartCard>

          {/* 등급 분포 | 구매가 대비 손익 */}
          <div className="grid grid-cols-2 gap-[10px] max-[700px]:grid-cols-1">
            <ChartCard title="등급 분포">
              <GradeDonut data={summary?.gradeDistribution} height={224} />
            </ChartCard>
            <ChartCard
              title="구매가 대비 손익 (상위)"
              right={realized?.soldCount
                ? <span style={{ color: Number(realized.realizedGain) >= 0 ? "var(--price-up)" : "var(--price-down)" }}>실현 {Number(realized.realizedGain) >= 0 ? "+" : ""}{fmtMoney(Number(realized.realizedGain))}</span>
                : undefined}
            >
              <GainLossChart data={gain?.perCard} height={224} />
            </ChartCard>
          </div>
        </div>

        {/* ── 우측 컬럼 — Top Performers (전체 높이) ── */}
        <div className="flex flex-col bg-[var(--surface-1)] border border-[var(--border-base)] rounded-xl p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="font-poppins text-sm font-bold text-white">Top Performers</span>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
            {topPerformers === null ? null
              : topPerformers.length === 0
              ? <p className="text-xs text-[var(--text-secondary)] py-3">시세 수집 후 표시됩니다.</p>
              : topPerformers.map((s, i) => (
                <Link key={s.cardId ?? i} to={`/collection/${s.cardId}`} className="flex items-center gap-3 px-2 py-2 rounded-[10px] cursor-pointer transition-colors hover:bg-white/5 no-underline">
                  <span className="text-[11px] font-bold text-white/25 w-3.5 text-center shrink-0" style={{ color: i === 0 ? "var(--gold-base)" : undefined }}>{i + 1}</span>
                  <div className="w-[48px] h-[68px] rounded-[6px] overflow-hidden bg-[#0a0f1e] shrink-0 border border-white/[0.08]">
                    <CardImage src={s.imageUrl} alt={s.subject} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="text-[13px] font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis">{s.subject}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">{[s.year, s.setName, s.grade].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-poppins text-xs font-bold text-[var(--gold-base)]">{fmtMoney(s.displayPrice)}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{s.saleCount != null ? `${s.saleCount}건` : "PSA"}</p>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 차트 카드 래퍼 ────────────────────────────────────────────
function ChartCard({ title, badge, right, children }) {
  return (
    <div className="flex flex-col bg-[var(--surface-1)] border border-[var(--border-base)] rounded-xl p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="font-poppins text-sm font-bold text-white">{title}</span>
          {badge && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold font-poppins"
              style={{ background: badge.up ? "rgba(76,175,80,0.15)" : "rgba(244,67,54,0.15)", color: badge.up ? "#4caf50" : "#f44336" }}
            >
              {badge.up ? "▲" : "▼"} {badge.text}
            </span>
          )}
        </div>
        {right && <span className="text-[11px] text-[var(--text-secondary)] ml-2">{right}</span>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

// ── 스탯 카드 ─────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, subColor, iconColor, iconTextColor, highlight }) {
  return (
    <div className="flex items-center gap-3 bg-[var(--surface-1)] border border-[var(--border-base)] rounded-xl px-4 py-[14px] backdrop-blur-xl transition-colors hover:border-[rgba(212,175,55,0.3)]">
      <div className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: iconColor || "var(--gold-muted)" }}>
        <i className={`${icon} text-[1.1rem]`} style={{ color: iconTextColor || "var(--gold-base)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-[0.06em] font-semibold mb-0.5">{label}</p>
        <p className="font-poppins text-[1.35rem] font-bold leading-[1.2] whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: highlight ? "var(--gold-base)" : "white" }}>
          {value}
        </p>
        {sub && <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: subColor }}>{sub}</p>}
      </div>
    </div>
  );
}
