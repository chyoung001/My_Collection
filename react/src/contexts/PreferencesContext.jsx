import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { apiFetch } from "@/api";

// 백엔드 DEFAULT_PREFERENCES와 동일하게 유지 (네트워크 실패 시 폴백)
const DEFAULTS = {
  currency: "USD",
  currencyDecimals: 0,
  defaultSort: "value",
  language: "ko",
  goldTone: "#d4af37",
  priceUpColor: "#4caf50",
  priceDownColor: "#f44336",
  exchangeRates: { KRW: 1350, JPY: 155 }, // 1 USD 당 환율 (시세는 USD로 수집됨)
  cacheWindowHours: 1,
  portfolioChangeWindowHours: 6,
};

const CURRENCY_SYMBOLS = { USD: "$", KRW: "₩", JPY: "¥" };

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef(null);
  const pendingRef = useRef({});

  // 최초 1회 로드
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : DEFAULTS))
      .then((data) => {
        if (cancelled) return;
        setPrefs({ ...DEFAULTS, ...data });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, []);

  // 테마 CSS 변수 주입 — prefs 변경 시 전체 페이지 즉시 반영
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--gold-base", prefs.goldTone);
    root.style.setProperty("--price-up", prefs.priceUpColor);
    root.style.setProperty("--price-down", prefs.priceDownColor);
  }, [prefs.goldTone, prefs.priceUpColor, prefs.priceDownColor]);

  // 낙관적 업데이트 + debounce PATCH
  const setPreference = useCallback((key, value) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    pendingRef.current[key] = value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const patch = pendingRef.current;
      pendingRef.current = {};
      apiFetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch((e) => console.error("preferences PATCH 실패", e));
    }, 500);
  }, []);

  // 여러 키 한번에 기본값으로 (테마 초기화 등)
  const resetPreferences = useCallback((keys) => {
    const patch = {};
    keys.forEach((k) => { patch[k] = DEFAULTS[k]; });
    setPrefs((prev) => ({ ...prev, ...patch }));
    apiFetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch((e) => console.error("preferences reset 실패", e));
  }, []);

  // 설정 기반 통화 포맷터.
  // 입력값(v)은 항상 USD 기준(시세 수집 단위). 비USD 통화면 환율로 환산해 표시한다.
  const fmtMoney = useCallback((v) => {
    if (v == null || isNaN(Number(v))) return "—";
    const cur = prefs.currency;
    const rate = cur === "USD" ? 1 : Number(prefs.exchangeRates?.[cur]) || 1;
    const converted = Number(v) * rate;
    const symbol = CURRENCY_SYMBOLS[cur] ?? "$";
    const decimals = Number(prefs.currencyDecimals) || 0;
    return symbol + converted.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }, [prefs.currency, prefs.currencyDecimals, prefs.exchangeRates]);

  const value = { prefs, loaded, setPreference, resetPreferences, fmtMoney, DEFAULTS };
  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
