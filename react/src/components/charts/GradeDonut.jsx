import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { PALETTE } from "./chartTheme";

// data: [{ grade, count }]
export default function GradeDonut({ data, height = 220 }) {
  const items = (data || []).filter((d) => Number(d.count) > 0);
  if (!items.length) {
    return (
      <div className="flex items-center justify-center text-white/25 text-sm" style={{ height }}>
        데이터 없음
      </div>
    );
  }

  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="rounded-lg border border-white/10 bg-[#15151b]/95 backdrop-blur px-3 py-1.5 text-xs">
        <span className="text-white font-semibold">{p.grade}</span>
        <span className="text-white/50"> · {p.count}장</span>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={items} dataKey="count" nameKey="grade" cx="50%" cy="50%"
          innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="none"
        >
          {items.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip content={<Tip />} />
        <Legend
          iconType="circle" iconSize={8}
          formatter={(v) => <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
