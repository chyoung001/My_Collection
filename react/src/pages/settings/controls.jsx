import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";

// ── 섹션 카드 ──────────────────────────────────────────────────
export function Section({ icon: Icon, title, children }) {
  return (
    <div className="glass-card flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-[var(--gold-base)]" />
        <h3 className="font-poppins font-bold text-sm text-white">{title}</h3>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

// ── 한 줄 설정 (라벨 + 컨트롤) ─────────────────────────────────
export function Row({ label, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-white/80">{label}</p>
        {hint && <p className="text-[11px] text-white/35 mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ── 세그먼트 토글 ──────────────────────────────────────────────
export function Segmented({ value, options, onChange }) {
  return (
    <div className="flex rounded-xl border border-white/10 overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === opt.value
              ? "bg-[rgba(212,175,55,0.15)] text-[var(--gold-base)]"
              : "text-white/40 hover:text-white"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── 색상 피커 ──────────────────────────────────────────────────
export function ColorPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer"
      />
      <span className="text-xs font-mono text-white/50 w-16">{value}</span>
    </div>
  );
}

// ── 숫자 스텝 입력 ─────────────────────────────────────────────
export function NumberInput({ value, onChange, min = 1, max = 168, suffix, widthClass = "w-16" }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className={`${widthClass} bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-[rgba(212,175,55,0.4)]`}
      />
      {suffix && <span className="text-xs text-white/40">{suffix}</span>}
    </div>
  );
}

// ── 텍스트 / 비밀번호 입력 ─────────────────────────────────────
export function TextInput({ value, onChange, placeholder, type = "text", className = "", ...rest }) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[rgba(212,175,55,0.4)] ${className}`}
      {...rest}
    />
  );
}

// ── 외부 API 상태 행 ───────────────────────────────────────────
export function HealthRow({ item }) {
  let Icon, color, text;
  if (!item.configured) { Icon = MinusCircle; color = "text-white/30"; text = "미설정"; }
  else if (item.ok === true) { Icon = CheckCircle2; color = "text-green-400"; text = "연결됨"; }
  else if (item.ok === false) { Icon = XCircle; color = "text-red-400"; text = "연결 실패"; }
  else { Icon = CheckCircle2; color = "text-white/50"; text = "설정됨"; }
  return (
    <div className="flex items-center gap-3 py-1">
      <Icon className={`w-4 h-4 ${color}`} />
      <span className="text-sm text-white/70 flex-1">{item.label}</span>
      <span className={`text-xs ${color}`}>{text}</span>
    </div>
  );
}
