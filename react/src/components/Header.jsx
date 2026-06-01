import { useLocation } from "react-router-dom";

const titles = {
  "/dashboard":     { title: "Dashboard",     crumb: "Home > Dashboard" },
  "/collection":    { title: "My Collection", crumb: "Home > Collection" },
  "/gallery":       { title: "Gallery",        crumb: "Home > Gallery" },
  "/market-trends": { title: "Market Trends", crumb: "Home > Market Trends" },
  "/settings":      { title: "Settings",      crumb: "Home > Settings" },
  "/hidden":        { title: "Hidden",         crumb: "Home > Hidden" },
  "/llm-test":      { title: "LLM Test",       crumb: "Home > LLM Test" },
};

export default function Header() {
  const { pathname } = useLocation();
  const meta = titles[pathname] || { title: "Dashboard", crumb: "Home" };

  return (
    <header className="h-20 border-b border-[var(--border-base)] flex items-center justify-between px-8 bg-[rgba(18,18,18,0.8)] backdrop-blur-[10px] sticky top-0 z-10 max-[820px]:left-0">
      <div>
        <h2 className="font-poppins font-bold text-xl">{meta.title}</h2>
        <p className="text-xs text-[var(--text-secondary)] mt-1.5">{meta.crumb}</p>
      </div>
    </header>
  );
}
