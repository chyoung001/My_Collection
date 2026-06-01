import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson, relTime } from "../api.js";
import { smoothPath } from "@/lib/chartUtils";
import { CardImage } from "@/components/CardImage";
import { usePreferences } from "@/contexts/PreferencesContext";

export default function Dashboard() {
  const { fmtMoney } = usePreferences();
  const [summary, setSummary] = useState(null);
  const [snapshotSummary, setSnapshotSummary] = useState(null);
  const [topGainer, setTopGainer] = useState(null);
  const [topPerformers, setTopPerformers] = useState(null);
  const [trend, setTrend] = useState(null);
  const [error, setError] = useState(null);

  const loadSummary = useCallback(async () => {
    setSummary(await apiJson("/api/dashboard/summary"));
  }, []);

  const loadSnapshotSummary = useCallback(async () => {
    setSnapshotSummary(await apiJson("/api/snapshots/summary"));
  }, []);

  const loadTopGainer = useCallback(async () => {
    setTopGainer(await apiJson("/api/dashboard/top-gainer"));
  }, []);

  const loadTopPerformers = useCallback(async () => {
    const snaps = await apiJson("/api/snapshots/latest");
    const withPrice = (snaps || [])
      .map((s) => ({ ...s, displayPrice: Number(s.representativePrice ?? s.avgPrice) || null }))
      .filter((s) => s.displayPrice);
    setTopPerformers(withPrice.sort((a, b) => b.displayPrice - a.displayPrice).slice(0, 5));
  }, []);

  const loadTrend = useCallback(async () => {
    const topCards = await apiJson("/api/dashboard/top-cards?limit=5");
    if (!topCards || !topCards.length) return;

    const histories = await Promise.all(
      topCards.map((c) =>
        apiJson(`/api/snapshots/${c.id}/history?limit=20`)
          .then((d) => (Array.isArray(d) ? d : []))
          .catch(() => [])
      )
    );

      const timeMap = {};
      histories.forEach((hist) => {
        hist.forEach((pt) => {
          const t = new Date(pt.fetchedAt).toISOString().substring(0, 13);
          const price = parseFloat(pt.representativePrice ?? pt.avgPrice) || 0;
          timeMap[t] = (timeMap[t] || 0) + price;
        });
      });

      const points = Object.entries(timeMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([t, v]) => ({ t, v }));
      if (points.length < 2) return;

      const W = 500, H = 160;
      const PAD_LEFT = 52, PAD_RIGHT = 16, PAD_TOP = 14, PAD_BOTTOM = 28;
      const chartW = W - PAD_LEFT - PAD_RIGHT;
      const chartH = H - PAD_TOP - PAD_BOTTOM;

      const vals = points.map((p) => p.v);
      const minV = Math.min(...vals);
      const maxV = Math.max(...vals);
      const range = maxV - minV || 1;

      const coords = points.map((p, i) => ({
        x: PAD_LEFT + (i / (points.length - 1)) * chartW,
        y: PAD_TOP + chartH - ((p.v - minV) / range) * chartH,
        t: p.t,
        v: p.v,
      }));

      const isUp = points[points.length - 1].v >= points[0].v;
      const trendColor = isUp ? "#D4AF37" : "#f44336";
      const changePct = points[0].v > 0
        ? ((points[points.length - 1].v - points[0].v) / points[0].v) * 100
        : 0;

      const linePath = smoothPath(coords);
      const last = coords[coords.length - 1];
      const first = coords[0];
      const areaPath = linePath
        + ` L${last.x.toFixed(1)},${(PAD_TOP + chartH).toFixed(1)}`
        + ` L${first.x.toFixed(1)},${(PAD_TOP + chartH).toFixed(1)} Z`;

      const yTicks = [0, 0.33, 0.67, 1].map((t) => ({
        v: minV + t * range,
        y: PAD_TOP + chartH - t * chartH,
      }));

      const xTickCount = Math.min(5, points.length);
      const xTicks = Array.from({ length: xTickCount }, (_, i) => {
        const idx = Math.round((i / (xTickCount - 1)) * (points.length - 1));
        return coords[idx];
      });

      setTrend({ linePath, areaPath, trendColor, minV, maxV, changePct, isUp, coords, yTicks, xTicks, W, H, PAD_LEFT, PAD_RIGHT, PAD_TOP, PAD_BOTTOM });
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    // 각 로더는 실패 시 throw. 일부만 실패해도 성공분은 그대로 렌더하고, 실패가 하나라도 있으면 배너로 알린다.
    const results = await Promise.allSettled([
      loadSummary(), loadSnapshotSummary(), loadTopGainer(), loadTopPerformers(), loadTrend(),
    ]);
    const failed = results.find((r) => r.status === "rejected");
    if (failed) {
      const allFailed = results.every((r) => r.status === "rejected");
      setError(
        allFailed
          ? (failed.reason?.message || "대시보드를 불러오지 못했습니다.")
          : "일부 정보를 불러오지 못했습니다."
      );
    }
  }, [loadSummary, loadSnapshotSummary, loadTopGainer, loadTopPerformers, loadTrend]);

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

  const pct = parseFloat(snapshotSummary?.portfolioChangePercent) || 0;
  const pctSign = pct >= 0 ? "+" : "";
  const pctColor = snapshotSummary?.portfolioChangePercent != null
    ? pct >= 0 ? "var(--price-up)" : "var(--price-down)"
    : "var(--text-secondary)";
  const trendUpdated = snapshotSummary?.latestSnapshot ? relTime(snapshotSummary.latestSnapshot) : "—";

  return (
    <div className="flex flex-col gap-3 p-5 max-[820px]:p-3.5 max-[820px]:gap-2.5">

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(244,67,54,0.4)] bg-[rgba(244,67,54,0.1)] px-4 py-3"
        >
          <span className="flex items-center gap-2 text-[13px] text-[#ff8a80]">
            <i className="ri-error-warning-line text-base" />
            {error}
          </span>
          <button
            onClick={loadAll}
            className="shrink-0 rounded-lg border border-[rgba(244,67,54,0.4)] px-3 py-1 text-xs font-semibold text-[#ff8a80] hover:bg-[rgba(244,67,54,0.15)]"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* ── 메인 그리드 ── */}
      <div
        className="grid gap-[10px] items-stretch max-[820px]:grid-cols-1 max-[1100px]:grid-cols-[1fr_300px] max-[1400px]:grid-cols-[1fr_360px]"
        style={{ gridTemplateColumns: "1fr 420px" }}
      >
        {/* 왼쪽 컬럼 */}
        <div className="flex flex-col gap-[10px]">

          {/* 스탯 1×4 */}
          <div className="grid grid-cols-4 gap-[10px] max-[1100px]:grid-cols-2">
            <StatCard
              icon="ri-money-dollar-circle-line"
              label="Portfolio Value"
              value={snapshotSummary?.totalMarketValue ? fmtMoney(snapshotSummary.totalMarketValue) : "—"}
              sub={snapshotSummary?.portfolioChangePercent != null ? `${pctSign}${pct.toFixed(2)}%` : undefined}
              subColor={pctColor}
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
              sub={snapshotSummary?.latestSnapshot ? `마지막 수집 ${relTime(snapshotSummary.latestSnapshot)}` : undefined}
            />
            <StatCard
              icon="ri-arrow-up-line"
              label="Top Gainer"
              value={topGainer?.currentPrice ? fmtMoney(topGainer.currentPrice) : "—"}
              sub={topGainer ? [topGainer.subject, topGainer.grade].filter(Boolean).join(" · ") : undefined}
              iconColor="rgba(76,175,80,0.15)"
              iconTextColor="var(--price-up)"
              highlight
            />
          </div>

          {/* 차트 카드 */}
          <div className="flex-1 flex flex-col bg-[var(--surface-1)] border border-[var(--border-base)] rounded-xl p-4 backdrop-blur-xl min-h-[230px]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <span className="font-poppins text-sm font-bold text-white">Portfolio Trend</span>
                {trend && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold font-poppins"
                    style={{
                      background: trend.isUp ? "rgba(76,175,80,0.15)" : "rgba(244,67,54,0.15)",
                      color: trend.isUp ? "#4caf50" : "#f44336",
                    }}
                  >
                    {trend.isUp ? "▲" : "▼"} {Math.abs(trend.changePct).toFixed(2)}%
                  </span>
                )}
              </div>
              <span className="text-[11px] text-[var(--text-secondary)] ml-2">{trendUpdated}</span>
            </div>
            <div className="flex-1 min-h-0">
              {trend ? (
                <svg viewBox={`0 0 ${trend.W} ${trend.H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", overflow: "visible" }}>
                  <defs>
                    <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={trend.trendColor} stopOpacity="0.25" />
                      <stop offset="100%" stopColor={trend.trendColor} stopOpacity="0" />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="2" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>
                  {trend.yTicks.map((tick, i) => (
                    <g key={i}>
                      <line x1={trend.PAD_LEFT} y1={tick.y.toFixed(1)} x2={trend.W - trend.PAD_RIGHT} y2={tick.y.toFixed(1)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                      <text x={(trend.PAD_LEFT - 6).toFixed(1)} y={tick.y.toFixed(1)} textAnchor="end" dominantBaseline="middle" fill="rgba(255,255,255,0.3)" fontSize="9" style={{ fontFamily: "Poppins, sans-serif" }}>{fmtMoney(tick.v)}</text>
                    </g>
                  ))}
                  {trend.xTicks.map((tick, i) => {
                    const d = new Date(tick.t + ":00:00Z");
                    const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
                    return (
                      <text key={i} x={tick.x.toFixed(1)} y={(trend.H - trend.PAD_BOTTOM + 14).toFixed(1)} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="9" style={{ fontFamily: "Poppins, sans-serif" }}>{label}</text>
                    );
                  })}
                  <path d={trend.areaPath} fill="url(#tg)" />
                  <path d={trend.linePath} fill="none" stroke={trend.trendColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
                  {(() => {
                    const last = trend.coords[trend.coords.length - 1];
                    return (
                      <g>
                        <circle cx={last.x.toFixed(1)} cy={last.y.toFixed(1)} r="5" fill={trend.trendColor} opacity="0.25" />
                        <circle cx={last.x.toFixed(1)} cy={last.y.toFixed(1)} r="3" fill={trend.trendColor} />
                      </g>
                    );
                  })()}
                </svg>
              ) : (
                <svg viewBox="0 0 500 160" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
                  <text x="250" y="80" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="12">시세 수집 후 차트가 표시됩니다</text>
                </svg>
              )}
            </div>
            {trend && (
              <div className="flex justify-between mt-1.5 text-[11px] text-[var(--text-secondary)]">
                <span>최저 <b>{fmtMoney(trend.minV)}</b></span>
                <span>최고 <b style={{ color: trend.trendColor }}>{fmtMoney(trend.maxV)}</b></span>
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽: Top Performers */}
        <div className="flex flex-col bg-[var(--surface-1)] border border-[var(--border-base)] rounded-xl p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="font-poppins text-sm font-bold text-white">Top Performers</span>
            <Link to="/market-trends" className="text-xs text-[var(--gold-base)] no-underline font-semibold whitespace-nowrap hover:opacity-80">View All</Link>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
            {topPerformers === null ? null
              : topPerformers.length === 0
              ? <p className="text-xs text-[var(--text-secondary)] py-3">시세 수집 후 표시됩니다.</p>
              : topPerformers.map((s, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2 rounded-[10px] cursor-pointer transition-colors hover:bg-white/5">
                  <span className="text-[11px] font-bold text-white/25 w-3.5 text-center shrink-0" style={{ color: i === 0 ? "var(--gold-base)" : undefined }}>{i + 1}</span>
                  <div className="w-[54px] h-[76px] rounded-[6px] overflow-hidden bg-[#0a0f1e] shrink-0 border border-white/[0.08]">
                    <CardImage src={s.imageUrl} alt={s.subject} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="text-[13px] font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis">{s.subject}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">{[s.year, s.setName, s.grade].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-poppins text-xs font-bold text-[var(--gold-base)]">{fmtMoney(s.displayPrice)}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{s.saleCount}건 거래</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

    </div>
  );
}

// ── 스탯 카드 ─────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, subColor, iconColor, iconTextColor, highlight }) {
  return (
    <div className="flex items-center gap-3 bg-[var(--surface-1)] border border-[var(--border-base)] rounded-xl px-4 py-[14px] backdrop-blur-xl transition-colors hover:border-[rgba(212,175,55,0.3)]">
      <div
        className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0"
        style={{ background: iconColor || "var(--gold-muted)" }}
      >
        <i className={`${icon} text-[1.1rem]`} style={{ color: iconTextColor || "var(--gold-base)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-[0.06em] font-semibold mb-0.5">{label}</p>
        <p
          className="font-poppins text-[1.35rem] font-bold leading-[1.2] whitespace-nowrap overflow-hidden text-ellipsis"
          style={{ color: highlight ? "var(--gold-base)" : "white" }}
        >
          {value}
        </p>
        {sub && <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: subColor }}>{sub}</p>}
      </div>
    </div>
  );
}
