import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { usePreferences } from "@/contexts/PreferencesContext";
import { GOLD, AXIS, GRID, makeTimeTickFormatter, paddedDomain } from "./chartTheme";

// data: [{ t: ISO, value: number }]
export default function PortfolioTrendChart({ data, height = 260 }) {
  const { fmtMoney } = usePreferences();
  const series = (data || [])
    .map((d) => ({ ts: new Date(d.t).getTime(), value: Number(d.value) }))
    .filter((d) => Number.isFinite(d.ts) && Number.isFinite(d.value));

  if (series.length < 2) {
    return (
      <div className="flex items-center justify-center text-white/25 text-sm" style={{ height }}>
        시세를 2회 이상 수집하면 추이가 표시됩니다
      </div>
    );
  }

  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="rounded-lg border border-white/10 bg-[#15151b]/95 backdrop-blur px-3 py-2 text-xs shadow-xl">
        <div className="text-white/50">{new Date(p.ts).toLocaleString()}</div>
        <div className="font-bold text-gold mt-0.5">{fmtMoney(p.value)}</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="pf-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]}
          tickFormatter={makeTimeTickFormatter(series)} stroke={AXIS} tick={{ fontSize: 10, fill: AXIS }}
          tickLine={false} axisLine={false} minTickGap={32}
        />
        <YAxis
          domain={paddedDomain(series.map((d) => d.value))}
          tickFormatter={(v) => fmtMoney(v)} stroke={AXIS} tick={{ fontSize: 10, fill: AXIS }}
          tickLine={false} axisLine={false} width={64}
        />
        <Tooltip content={<Tip />} />
        <Area
          type="monotone" dataKey="value" stroke={GOLD} strokeWidth={2}
          fill="url(#pf-grad)" dot={false} activeDot={{ r: 4, fill: GOLD }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
