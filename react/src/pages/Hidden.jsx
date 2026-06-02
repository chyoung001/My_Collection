import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson, relTime } from "../api.js";
import { CardImage } from "@/components/CardImage";
import { usePreferences } from "@/contexts/PreferencesContext";

// 판매 / 보관함 — 판매된 카드와 실현 손익. (라우트는 /hidden 유지)
export default function Hidden() {
  const { fmtMoney } = usePreferences();
  const [cards, setCards] = useState(null);
  const [realized, setRealized] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, summary] = await Promise.all([
        apiJson("/api/cards?status=sold"),
        apiJson("/api/dashboard/realized").catch(() => null),
      ]);
      setCards(Array.isArray(list) ? list : []);
      setRealized(summary);
    } catch (e) {
      setError(e?.message || "판매 내역을 불러오지 못했습니다.");
      setCards([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const gainColor = (g) => g == null ? "text-white/40" : g >= 0 ? "text-[var(--price-up)]" : "text-[var(--price-down)]";
  const realizedGain = realized ? Number(realized.realizedGain) : 0;

  return (
    <div className="flex flex-col gap-4 p-5 max-[820px]:p-3.5">
      {/* 실현 손익 요약 */}
      <div className="grid grid-cols-3 gap-[10px] max-[700px]:grid-cols-1">
        <StatTile
          label="실현 손익"
          value={realized?.soldCount ? `${realizedGain >= 0 ? "+" : ""}${fmtMoney(realizedGain)}` : "—"}
          sub={realized?.realizedPct != null ? `${realized.realizedPct >= 0 ? "+" : ""}${realized.realizedPct.toFixed(1)}%` : undefined}
          color={realized?.soldCount ? (realizedGain >= 0 ? "up" : "down") : undefined}
        />
        <StatTile label="총 판매대금" value={realized ? fmtMoney(Number(realized.totalProceeds)) : "—"} />
        <StatTile label="판매한 카드" value={realized?.soldCount ?? "—"} />
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(244,67,54,0.4)] bg-[rgba(244,67,54,0.1)] px-4 py-3">
          <span className="text-[13px] text-[#ff8a80]">{error}</span>
          <button onClick={load} className="shrink-0 rounded-lg border border-[rgba(244,67,54,0.4)] px-3 py-1 text-xs font-semibold text-[#ff8a80] hover:bg-[rgba(244,67,54,0.15)]">다시 시도</button>
        </div>
      )}

      {/* 판매 카드 그리드 */}
      {cards === null ? null
        : cards.length === 0
        ? <div className="glass-card text-center py-12 text-white/40 text-sm">판매한 카드가 없습니다. 카드 상세에서 "판매"로 등록하세요.</div>
        : (
          <div className="grid gap-[10px] grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
            {cards.map((c) => {
              const gain = c.purchasePrice != null && c.soldPrice != null ? c.soldPrice - c.purchasePrice : null;
              const pct = gain != null && c.purchasePrice > 0 ? (gain / c.purchasePrice) * 100 : null;
              return (
                <Link key={c.id} to={`/collection/${c.id}`} className="glass-card !p-0 overflow-hidden no-underline group">
                  <div className="relative aspect-[5/7] bg-[#0a0f1e] flex items-center justify-center">
                    <CardImage src={c.imageUrl} alt={c.subject} className="w-full h-full object-contain opacity-80 group-hover:opacity-100 transition" />
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-500/40">SOLD</span>
                  </div>
                  <div className="p-3 flex flex-col gap-1">
                    <p className="font-bold text-sm text-white truncate">{c.subject}</p>
                    <p className="text-[11px] text-white/40 truncate">{[c.year, c.setName, c.grade].filter(Boolean).join(" · ")}</p>
                    <div className="flex items-end justify-between mt-1">
                      <div>
                        <p className="text-[10px] text-white/40 uppercase tracking-wider">판매가</p>
                        <p className="font-poppins font-bold text-sm text-gold">{c.soldPrice != null ? fmtMoney(c.soldPrice) : "—"}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-poppins text-sm font-bold ${gainColor(gain)}`}>
                          {gain == null ? "—" : `${gain >= 0 ? "+" : ""}${fmtMoney(gain)}`}
                        </p>
                        {pct != null && <p className={`text-[11px] ${gainColor(gain)}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</p>}
                      </div>
                    </div>
                    <p className="text-[10px] text-white/30 mt-0.5">
                      {c.soldAt ? `판매 ${relTime(c.soldAt)}` : ""}{gain == null && c.purchasePrice == null ? " · 구매가 미입력" : ""}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
    </div>
  );
}

function StatTile({ label, value, sub, color }) {
  const c = color === "up" ? "var(--price-up)" : color === "down" ? "var(--price-down)" : undefined;
  return (
    <div className="bg-[var(--surface-1)] border border-[var(--border-base)] rounded-xl px-4 py-[14px] backdrop-blur-xl">
      <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-[0.06em] font-semibold mb-1">{label}</p>
      <p className="font-poppins text-[1.35rem] font-bold leading-tight" style={{ color: c || "white" }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: c }}>{sub}</p>}
    </div>
  );
}
