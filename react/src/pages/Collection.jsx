import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Search, Trash2,
  LayoutGrid, List, Loader2, X, SlidersHorizontal, AlertTriangle,
} from "lucide-react";
import { apiFetch, apiJson } from "@/api";
import { usePreferences } from "@/contexts/PreferencesContext";
import { gradeVariant, gradeBadgeClass } from "@/lib/gradeUtils";
import { rarityTier } from "@/lib/rarityUtils";
import RarityBadge from "@/components/RarityBadge";
import { useCardDelete } from "@/hooks/useCardDelete";
import { CardImage } from "@/components/CardImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── 카드 서브타이틀 ────────────────────────────────────────────
function cardSubtitle(card) {
  return [card.year, card.setName, card.cardNumber && `#${card.cardNumber}`, card.variety]
    .filter(Boolean)
    .join(" · ");
}

// ── 카드 타일 컴포넌트 ─────────────────────────────────────────
function CardTile({ card, onDelete }) {
  const navigate = useNavigate();
  const { deleteCard, deleting } = useCardDelete({ onDelete });
  const { fmtMoney } = usePreferences();
  const rarity = rarityTier(card);

  function handleCardClick() {
    navigate(`/collection/${card.id}`, { state: { card } });
  }

  return (
    <article
      onClick={handleCardClick}
      className={`group relative flex flex-col rounded-2xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur-md hover:-translate-y-1 hover:border-gold/30 hover:shadow-lg hover:shadow-gold/10 transition-all duration-300 cursor-pointer ${rarity ? `rarity-${rarity.tier}` : ""}`}
    >
      {/* 이미지 영역 */}
      <div className="relative aspect-[5/7] overflow-hidden bg-[#0a0f1e] flex items-center justify-center">
        <CardImage
          src={card.imageUrl}
          alt={card.subject || "card"}
          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
        />
        {/* 등급 뱃지 — 좌상단 고정 */}
        <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-xs font-black tracking-wide shadow-lg border ${gradeBadgeClass(card.grade)}`}>
          {card.grade || "N/A"}
        </div>
        {/* 희소 뱃지 (PSA Population 기반) — 하단 중앙 (등급·삭제버튼과 분리) */}
        {rarity && (
          <RarityBadge card={card} className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 shadow-lg" />
        )}
        {/* 삭제 버튼 */}
        <button
          onClick={(e) => deleteCard(card.id, card.subject, e)}
          disabled={deleting}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white/60 hover:text-red-400 hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-all duration-200 disabled:opacity-50"
          aria-label="delete card"
        >
          {deleting
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* 카드 정보 */}
      <div className="flex flex-col gap-2 p-3">
        <div>
          <h3 className="font-poppins font-bold text-sm text-white truncate">{card.subject || "Unknown"}</h3>
          <p className="text-xs text-white/40 truncate mt-0.5">{cardSubtitle(card)}</p>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Current Value</p>
            <p className="font-poppins font-bold text-sm text-gold">
              {card.currentPrice ? fmtMoney(card.currentPrice) : "—"}
            </p>
          </div>
          <span className="text-xs font-semibold text-white/50">{card.grader || "—"}</span>
        </div>
        {card.certNumber && (
          <p className="text-[10px] text-white/30 font-mono">Cert: {card.certNumber}</p>
        )}
      </div>
    </article>
  );
}

// ── 필터 칩 ───────────────────────────────────────────────────
function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gold/15 border border-gold/30 text-gold text-xs font-semibold">
      {label}
      <button onClick={onRemove} className="ml-0.5 hover:text-white transition-colors">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ── 수동 등록 폼 초기값 ────────────────────────────────────────
const MANUAL_INIT = {
  subject: "", year: "", setName: "", cardNumber: "",
  variety: "", category: "", grade: "", certNumber: "", imageUrl: "",
};

// ── Collection 메인 ────────────────────────────────────────────
export default function Collection() {
  const { prefs } = usePreferences();

  // 카드 데이터
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // 기본 필터 — 정렬 초기값은 설정(defaultSort) 따름
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState(prefs.defaultSort || "value");
  const [viewMode, setViewMode] = useState("grid");

  // 필터 모달
  const [filterOpen, setFilterOpen] = useState(false);

  const FILTER_INIT = {
    grader: "all", grade: "all",
    years: new Set(), brands: new Set(), categories: new Set(),
    image: "all",
  };
  const [filters, setFilters] = useState(FILTER_INIT);

  // 카드 등록 모달
  const [modalOpen, setModalOpen] = useState(false);

  // 자동 등록 상태
  const [autoCertNumber, setAutoCertNumber] = useState("");
  const [autoCompany, setAutoCompany] = useState("PSA");
  const [autoLoading, setAutoLoading] = useState(false);

  // 수동 등록 상태
  const [manual, setManual] = useState(MANUAL_INIT);
  const [manualLoading, setManualLoading] = useState(false);

  // ── 카드 로드 ───────────────────────────────────────────────
  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson("/api/cards?status=active");
      setCards(Array.isArray(data) ? data : []);
      setLoadError(null);
    } catch (e) {
      // 실패를 조용히 묻지 않는다 — "비어 있음"과 "불러오기 실패"를 구분해 배너로 표시.
      setLoadError(e?.message || "카드 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  // 탭 활성화 / 포커스 복귀 시 자동 새로고침 (CardDetail에서 시세 수집 후 돌아왔을 때 반영)
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") loadCards();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadCards]);

  // ── 카드 데이터에서 필터 옵션 동적 도출 ────────────────────────
  const filterOptions = useMemo(() => ({
    years:      [...new Set(cards.map((c) => c.year).filter(Boolean))].sort((a, b) => b - a),
    brands:     [...new Set(cards.map((c) => c.setName).filter(Boolean))].sort(),
    categories: [...new Set(cards.map((c) => c.category).filter(Boolean))].sort(),
  }), [cards]);

  // ── 필터 헬퍼 ──────────────────────────────────────────────
  function setFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }
  function toggleSetFilter(key, value) {
    setFilters((prev) => {
      const next = new Set(prev[key]);
      next.has(value) ? next.delete(value) : next.add(value);
      return { ...prev, [key]: next };
    });
  }
  function resetFilters() {
    setFilters({ grader: "all", grade: "all", years: new Set(), brands: new Set(), categories: new Set(), image: "all" });
  }

  // ── 활성 필터 개수 ──────────────────────────────────────────
  const activeFilterCount = [
    filters.grader !== "all",
    filters.grade !== "all",
    filters.years.size > 0,
    filters.brands.size > 0,
    filters.categories.size > 0,
    filters.image !== "all",
  ].filter(Boolean).length;

  // ── 필터링 & 정렬 ───────────────────────────────────────────
  const filtered = useMemo(() =>
    cards
      .filter((c) => {
        const q = search.toLowerCase();
        const matchSearch =
          !q ||
          c.subject?.toLowerCase().includes(q) ||
          c.certNumber?.toLowerCase().includes(q) ||
          c.setName?.toLowerCase().includes(q);
        const matchGrader   = filters.grader === "all" || c.grader === filters.grader;
        const matchGrade    = filters.grade === "all" || c.grade?.toUpperCase().includes(filters.grade.toUpperCase());
        const matchYear     = filters.years.size === 0 || filters.years.has(c.year);
        const matchBrand    = filters.brands.size === 0 || filters.brands.has(c.setName);
        const matchCategory = filters.categories.size === 0 || filters.categories.has(c.category);
        const matchImage    = filters.image === "all"
                            || (filters.image === "with" && !!c.imageUrl)
                            || (filters.image === "without" && !c.imageUrl);
        return matchSearch && matchGrader && matchGrade && matchYear && matchBrand && matchCategory && matchImage;
      })
      .sort((a, b) => {
        if (sortBy === "value") return (b.currentPrice || 0) - (a.currentPrice || 0);
        if (sortBy === "subject") return (a.subject || "").localeCompare(b.subject || "");
        if (sortBy === "year") return (b.year || "").localeCompare(a.year || "");
        return 0;
      }),
    [cards, search, sortBy, filters]
  );

  // ── 삭제 콜백 ───────────────────────────────────────────────
  function handleDelete(id) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  // ── 수동 등록 ───────────────────────────────────────────────
  async function handleManualSave() {
    const { subject, year, setName, cardNumber } = manual;
    if (!subject || !year || !setName || !cardNumber) {
      alert("Player Name / Year / Brand / Card Number는 필수입니다.");
      return;
    }
    if (year.length > 4) { alert("Year는 4자리로 입력해주세요."); return; }

    setManualLoading(true);
    try {
      const res = await apiFetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...manual,
          grader: manual.grade.toLowerCase().includes("raw") ? "RAW" : "PSA",
        }),
      });
      if (!res.ok) { alert("카드 등록에 실패했습니다."); return; }
      const data = await res.json();
      alert(`카드가 등록되었습니다. (id: ${data.id})`);
      setManual(MANUAL_INIT);
      setModalOpen(false);
      await loadCards();
    } catch {
      alert("서버 통신 중 오류가 발생했습니다.");
    } finally {
      setManualLoading(false);
    }
  }

  // ── 자동 등록 ───────────────────────────────────────────────
  async function handleAutoLookup() {
    if (!autoCertNumber.trim()) { alert("Cert Number를 입력해 주세요."); return; }
    setAutoLoading(true);
    try {
      const res = await apiFetch("/api/cards/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certNumber: autoCertNumber, certificationType: autoCompany }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert("자동 등록 실패\n" + (data.message || data.error || `status: ${res.status}`));
        return;
      }
      alert("PSA Cert 정보로 카드가 등록되었습니다.");
      setAutoCertNumber("");
      setModalOpen(false);
      await loadCards();
    } catch (e) {
      alert("자동 등록 중 오류가 발생했습니다.");
      console.error(e);
    } finally {
      setAutoLoading(false);
    }
  }

  // ── 렌더 ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-6">

      {/* 검색창 + 필터 버튼 + 카드 등록 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input
            className="pl-9 pr-9 h-11"
            placeholder="선수 이름 또는 PSA/BGS 인증 번호로 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {/* 필터 버튼 */}
        <button
          onClick={() => setFilterOpen(true)}
          className={`relative h-11 px-4 flex items-center gap-2 rounded-xl border text-sm font-semibold transition-colors shrink-0
            ${activeFilterCount > 0
              ? "border-gold/50 bg-gold/10 text-gold"
              : "border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20"}`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          필터
          {activeFilterCount > 0 && (
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gold text-black text-[10px] font-black">
              {activeFilterCount}
            </span>
          )}
        </button>
        <Button onClick={() => setModalOpen(true)} className="shrink-0 h-11 px-5">
          <Plus className="w-4 h-4" />
          카드 등록
        </Button>
      </div>

      {/* 활성 필터 칩 + 정렬/뷰 */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 활성 필터 칩 */}
        {filters.grader !== "all" && (
          <FilterChip label={`등급사: ${filters.grader}`} onRemove={() => setFilter("grader", "all")} />
        )}
        {filters.grade !== "all" && (
          <FilterChip label={`등급: ${filters.grade}`} onRemove={() => setFilter("grade", "all")} />
        )}
        {[...filters.years].map((y) => (
          <FilterChip key={y} label={`연도: ${y}`} onRemove={() => toggleSetFilter("years", y)} />
        ))}
        {[...filters.brands].map((b) => (
          <FilterChip key={b} label={b} onRemove={() => toggleSetFilter("brands", b)} />
        ))}
        {[...filters.categories].map((cat) => (
          <FilterChip key={cat} label={cat} onRemove={() => toggleSetFilter("categories", cat)} />
        ))}
        {filters.image !== "all" && (
          <FilterChip label={filters.image === "with" ? "이미지 있음" : "이미지 없음"} onRemove={() => setFilter("image", "all")} />
        )}
        {activeFilterCount > 0 && (
          <button onClick={resetFilters} className="text-xs text-white/30 hover:text-white/60 transition-colors px-1">
            전체 초기화
          </button>
        )}

        {/* 정렬 + 카드 수 + 뷰 토글 */}
        <div className="ml-auto flex items-center gap-2">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="value">가치순</SelectItem>
              <SelectItem value="subject">선수명순</SelectItem>
              <SelectItem value="year">연도순</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-white/40 whitespace-nowrap">
            총 <span className="text-white font-semibold">{filtered.length}</span>장
          </span>
          <div className="flex rounded-xl border border-white/10 overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 transition-colors ${viewMode === "grid" ? "bg-gold/20 text-gold" : "text-white/40 hover:text-white"}`}
              aria-label="grid view"
            ><LayoutGrid className="w-4 h-4" /></button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 transition-colors ${viewMode === "list" ? "bg-gold/20 text-gold" : "text-white/40 hover:text-white"}`}
              aria-label="list view"
            ><List className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* 카드 그리드 */}
      {loading ? (
        <div className="flex justify-center py-20 text-white/30">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3" role="alert">
          <p className="flex items-center gap-2 text-sm text-[#ff8a80]">
            <AlertTriangle className="w-4 h-4" /> {loadError}
          </p>
          <Button variant="secondary" size="sm" onClick={loadCards}>
            다시 시도
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-white/30">
          <p className="text-sm">
            {cards.length === 0
              ? "등록된 카드가 없습니다. 새로운 카드를 등록해보세요."
              : "검색 결과가 없습니다."}
          </p>
          {cards.length === 0 && (
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" /> 카드 등록하기
            </Button>
          )}
        </div>
      ) : (
        <div className={
          viewMode === "grid"
            ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
            : "flex flex-col gap-3"
        }>
          {filtered.map((card) =>
            viewMode === "grid" ? (
              <CardTile key={card.id} card={card} onDelete={handleDelete} />
            ) : (
              <ListRow key={card.id} card={card} onDelete={handleDelete} />
            )
          )}
        </div>
      )}

      {/* 카드 추가 모달 */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>카드 추가</DialogTitle>
            <DialogDescription>Cert 기반 자동 등록 또는 직접 입력으로 카드를 등록합니다.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="auto">
            <TabsList>
              <TabsTrigger value="auto">Cert 번호로 자동 등록</TabsTrigger>
              <TabsTrigger value="manual">직접 입력 (수동)</TabsTrigger>
            </TabsList>

            {/* 자동 등록 탭 */}
            <TabsContent value="auto" className="space-y-4">
              <p className="text-sm text-white/50">
                PSA 등 그레이딩 회사의 API를 이용해 Cert 번호로 기본 정보를 불러옵니다.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-white/50 uppercase tracking-wider">그레이딩 회사</label>
                  <Select value={autoCompany} onValueChange={setAutoCompany}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PSA">PSA</SelectItem>
                      <SelectItem value="BGS">BGS</SelectItem>
                      <SelectItem value="SGC">SGC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-white/50 uppercase tracking-wider">Cert Number</label>
                  <Input
                    placeholder="예: 76348771"
                    value={autoCertNumber}
                    onChange={(e) => setAutoCertNumber(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAutoLookup()}
                  />
                </div>
              </div>
              <Button onClick={handleAutoLookup} disabled={autoLoading} className="w-full">
                {autoLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> 조회 중...</>
                  : <><Search className="w-4 h-4" /> 조회하기</>}
              </Button>
            </TabsContent>

            {/* 수동 등록 탭 */}
            <TabsContent value="manual" className="space-y-4">
              <p className="text-sm text-white/50">
                Raw 카드이거나 Cert 조회가 되지 않을 때 직접 정보를 입력해 등록합니다.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "subject",    label: "Player Name *",  placeholder: "예: SHOHEI OHTANI" },
                  { key: "year",       label: "Year *",          placeholder: "예: 2018" },
                  { key: "setName",    label: "Brand / Set *",   placeholder: "예: TOPPS GOLD LABEL" },
                  { key: "cardNumber", label: "Card Number *",   placeholder: "예: 17, BDC14" },
                  { key: "variety",    label: "Variety",          placeholder: "예: CLASS 1" },
                  { key: "category",   label: "Category",         placeholder: "예: BASEBALL CARDS" },
                  { key: "grade",      label: "Grade",            placeholder: "예: GEM MT 10" },
                  { key: "certNumber", label: "Cert Number",      placeholder: "Optional" },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1.5">
                    <label className="text-xs text-white/50 uppercase tracking-wider">{label}</label>
                    <Input
                      placeholder={placeholder}
                      value={manual[key]}
                      onChange={(e) => setManual((p) => ({ ...p, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-white/50 uppercase tracking-wider">이미지 URL</label>
                <Input
                  placeholder="예: https://... 카드 정면 사진"
                  value={manual.imageUrl}
                  onChange={(e) => setManual((p) => ({ ...p, imageUrl: e.target.value }))}
                />
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setModalOpen(false)}>취소</Button>
                <Button onClick={handleManualSave} disabled={manualLoading}>
                  {manualLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> 등록 중...</>
                    : "카드 등록"}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* 필터 모달 */}
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>필터</DialogTitle>
            <DialogDescription>원하는 조건으로 카드를 필터링합니다.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5 max-h-[60vh] overflow-y-auto pr-1">

            {/* 등급사 */}
            <FilterSection title="등급사">
              {["all", "PSA", "BGS", "SGC", "RAW"].map((g) => (
                <FilterPill
                  key={g}
                  label={g === "all" ? "전체" : g}
                  active={filters.grader === g}
                  onClick={() => setFilter("grader", g)}
                />
              ))}
            </FilterSection>

            {/* 등급 */}
            <FilterSection title="등급">
              {["all", "10", "9.5", "9", "8", "7"].map((g) => (
                <FilterPill
                  key={g}
                  label={g === "all" ? "전체" : `PSA ${g}`}
                  active={filters.grade === g}
                  onClick={() => setFilter("grade", g)}
                />
              ))}
            </FilterSection>

            {/* 연도 */}
            {filterOptions.years.length > 0 && (
              <FilterSection title="연도">
                {filterOptions.years.map((y) => (
                  <FilterPill
                    key={y}
                    label={y}
                    active={filters.years.has(y)}
                    onClick={() => toggleSetFilter("years", y)}
                    multi
                  />
                ))}
              </FilterSection>
            )}

            {/* 브랜드 / 세트 */}
            {filterOptions.brands.length > 0 && (
              <FilterSection title="브랜드 / 세트">
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {filterOptions.brands.map((b) => (
                    <FilterPill
                      key={b}
                      label={b}
                      active={filters.brands.has(b)}
                      onClick={() => toggleSetFilter("brands", b)}
                      multi
                    />
                  ))}
                </div>
              </FilterSection>
            )}

            {/* 카테고리 */}
            {filterOptions.categories.length > 0 && (
              <FilterSection title="카테고리">
                {filterOptions.categories.map((cat) => (
                  <FilterPill
                    key={cat}
                    label={cat}
                    active={filters.categories.has(cat)}
                    onClick={() => toggleSetFilter("categories", cat)}
                    multi
                  />
                ))}
              </FilterSection>
            )}

            {/* 이미지 유무 */}
            <FilterSection title="이미지">
              {[
                { value: "all", label: "전체" },
                { value: "with", label: "이미지 있음" },
                { value: "without", label: "이미지 없음" },
              ].map(({ value, label }) => (
                <FilterPill
                  key={value}
                  label={label}
                  active={filters.image === value}
                  onClick={() => setFilter("image", value)}
                />
              ))}
            </FilterSection>

          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={resetFilters} className="text-white/50">
              초기화
            </Button>
            <Button onClick={() => setFilterOpen(false)}>
              적용 ({filtered.length}장)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── 필터 섹션 레이아웃 ─────────────────────────────────────────
function FilterSection({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

// ── 필터 필 버튼 ───────────────────────────────────────────────
function FilterPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
        active
          ? "bg-gold/20 border-gold/50 text-gold"
          : "bg-white/5 border-white/10 text-white/50 hover:border-white/20 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

// ── 리스트 뷰 행 ───────────────────────────────────────────────
function ListRow({ card, onDelete }) {
  const navigate = useNavigate();
  const { deleteCard, deleting } = useCardDelete({ onDelete });
  const { fmtMoney } = usePreferences();

  return (
    <div
      onClick={() => navigate(`/collection/${card.id}`, { state: { card } })}
      className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 hover:border-gold/20 hover:bg-white/5 transition-all cursor-pointer"
    >
      <div className="w-12 h-16 rounded-lg shrink-0 bg-[#0a0f1e] flex items-center justify-center overflow-hidden">
        <CardImage
          src={card.imageUrl}
          alt={card.subject}
          className="w-full h-full object-contain"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-poppins font-bold text-sm text-white truncate">{card.subject || "Unknown"}</p>
        <p className="text-xs text-white/40 truncate">{cardSubtitle(card)}</p>
      </div>
      <Badge variant={gradeVariant(card.grade)} className="shrink-0">{card.grade || "N/A"}</Badge>
      <p className="font-poppins font-bold text-sm text-gold w-20 text-right shrink-0">
        {card.currentPrice ? fmtMoney(card.currentPrice) : "—"}
      </p>
      <span className="text-xs text-white/40 w-12 text-right shrink-0">{card.grader || "—"}</span>
      <button
        onClick={(e) => deleteCard(card.id, card.subject, e)}
        disabled={deleting}
        className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
      >
        {deleting
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Trash2 className="w-4 h-4" />}
      </button>
    </div>
  );
}
