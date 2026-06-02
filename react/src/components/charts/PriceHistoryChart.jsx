import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot, ResponsiveContainer } from "recharts";
import { usePreferences } from "@/contexts/PreferencesContext";
import { GOLD, UP, DOWN, AXIS, GRID, makeTimeTickFormatter, paddedDomain } from "./chartTheme";

const priceOf = (s) => {
  const p = Number(s?.representativePrice ?? s?.avgPrice);
  return Number.isFinite(p) && p > 0 ? p : null;
};

// data: 카드 시세 이력 [{ fetchedAt, representativePrice|avgPrice, ... }] (오래된 순)
export default function PriceHistoryChart({ data, height = 240 }) {
  const { fmtMoney } = usePreferences();
  const series = (data || [])
    .map((s) => ({ ts: new Date(s.fetchedAt).getTime(), price: priceOf(s) }))
    .filter((d) => Number.isFinite(d.ts) && d.price != null);

  if (series.length < 2) {
    return (
      <div className="flex items-center justify-center text-white/25 text-sm" style={{ height }}>
        시세를 2회 이상 수집하면 차트가 표시됩니다
      </div>
    );
  }

  const prices = series.map((d) => d.price);
  const minV = Math.min(...prices);
  const maxV = Math.max(...prices);
  const minPt = series.find((d) => d.price === minV);
  const maxPt = series.find((d) => d.price === maxV);
  const up = series[series.length - 1].price >= series[0].price;
  const color = up ? GOLD : DOWN;

  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="rounded-lg border border-white/10 bg-[#15151b]/95 backdrop-blur px-3 py-2 text-xs shadow-xl">
        <div className="text-white/50">{new Date(p.ts).toLocaleString()}</div>
        <div className="font-bold mt-0.5" style={{ color }}>{fmtMoney(p.price)}</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={series} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="ph-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]}
          tickFormatter={makeTimeTickFormatter(series)} stroke={AXIS} tick={{ fontSize: 10, fill: AXIS }}
          tickLine={false} axisLine={false} minTickGap={28}
        />
        <YAxis
          tickFormatter={(v) => fmtMoney(v)} stroke={AXIS} tick={{ fontSize: 10, fill: AXIS }}
          tickLine={false} axisLine={false} width={62} domain={paddedDomain(prices)}
        />
        <Tooltip content={<Tip />} />
        <Area
          type="monotone" dataKey="price" stroke={color} strokeWidth={2.5}
          fill="url(#ph-grad)" dot={false} activeDot={{ r: 4, fill: color }}
        />
        {minV !== maxV && minPt && <ReferenceDot x={minPt.ts} y={minV} r={3.5} fill={DOWN} stroke="none" isFront />}
        {minV !== maxV && maxPt && <ReferenceDot x={maxPt.ts} y={maxV} r={3.5} fill={UP} stroke="none" isFront />}
      </AreaChart>
    </ResponsiveContainer>
  );
}
