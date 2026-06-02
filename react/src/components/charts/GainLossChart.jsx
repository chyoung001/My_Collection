import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine, ResponsiveContainer } from "recharts";
import { usePreferences } from "@/contexts/PreferencesContext";
import { UP, DOWN, AXIS, GRID } from "./chartTheme";

// data: [{ subject, gain, pct }]  (호출측에서 정렬·상위 N개로 전달)
export default function GainLossChart({ data, height = 220 }) {
  const { fmtMoney } = usePreferences();
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center text-center text-white/25 text-sm px-4" style={{ height }}>
        구매가가 입력된 카드가 없습니다
      </div>
    );
  }

  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    const up = p.gain >= 0;
    return (
      <div className="rounded-lg border border-white/10 bg-[#15151b]/95 backdrop-blur px-3 py-2 text-xs">
        <div className="text-white font-semibold truncate max-w-[200px]">{p.subject}</div>
        <div className="mt-0.5" style={{ color: up ? UP : DOWN }}>
          {up ? "+" : ""}{fmtMoney(p.gain)} ({up ? "+" : ""}{p.pct?.toFixed(1)}%)
        </div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
        <XAxis
          type="number" tickFormatter={(v) => fmtMoney(v)} stroke={AXIS}
          tick={{ fontSize: 9, fill: AXIS }} tickLine={false} axisLine={false}
        />
        <YAxis
          type="category" dataKey="subject" width={88} stroke={AXIS}
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }} tickLine={false} axisLine={false}
          tickFormatter={(s) => (s && s.length > 12 ? s.slice(0, 12) + "…" : s)}
        />
        <ReferenceLine x={0} stroke={GRID} />
        <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="gain" radius={[0, 3, 3, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.gain >= 0 ? UP : DOWN} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
