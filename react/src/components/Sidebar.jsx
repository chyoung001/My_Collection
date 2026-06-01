import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/dashboard", icon: "ri-dashboard-line", label: "Dashboard" },
  { to: "/collection", icon: "ri-stack-line", label: "My Collection" },
  { to: "/gallery", icon: "ri-gallery-line", label: "Gallery" },
  { to: "/market-trends", icon: "ri-line-chart-line", label: "Market Trends" },
  { to: "/settings", icon: "ri-settings-3-line", label: "Settings" },
  { to: "/llm-test", icon: "ri-robot-line", label: "LLM Test", badge: "DEV" },
];

export default function Sidebar() {
  return (
    <aside className="w-[240px] bg-[#1a1a1a] border-r border-[var(--border-base)] fixed h-screen max-[820px]:static max-[820px]:w-full max-[820px]:h-auto max-[820px]:border-r-0 max-[820px]:border-b max-[820px]:border-[var(--border-base)]">
      <div className="flex flex-col h-full">
        <div className="p-5 border-b border-[var(--border-base)]">
          <span className="font-poppins font-bold">My Collection</span>
        </div>
        <nav className="px-3 py-[18px] flex flex-col gap-1.5 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-[14px] py-3 rounded-xl no-underline transition-all duration-200 border ${
                  isActive
                    ? "bg-[var(--gold-muted)] text-[var(--text-primary)] border-transparent"
                    : "text-[var(--text-secondary)] border-transparent hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] hover:border-[rgba(212,175,55,0.12)]"
                }`
              }
            >
              <i className={`${item.icon} text-[20px]`}></i>
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[rgba(212,175,55,0.2)] text-[var(--gold-base)] tracking-wider">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-3.5 border-t border-[var(--border-base)]">
          <div className="flex items-center gap-3 p-3 rounded-[14px] bg-[var(--surface-2)] border border-[var(--border-base)]">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--gold-base)] to-[var(--gold-hover)] grid place-items-center text-[var(--bg-base)]">
              <i className="ri-user-line"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[0.9rem] font-semibold">Collector</p>
              <p className="text-[0.75rem] text-[var(--text-secondary)] mt-0.5">Premium</p>
            </div>
            <i className="ri-arrow-right-s-line text-[var(--text-secondary)] text-[20px]"></i>
          </div>
        </div>
      </div>
    </aside>
  );
}
