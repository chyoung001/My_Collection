import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  X, ChevronLeft, ChevronRight, Settings2,
  Plus, Pencil, Trash2, Check, FolderInput, MoreVertical, Loader2, AlertTriangle,
} from "lucide-react";
import { apiFetch, apiJson } from "@/api";
import { CardImage } from "@/components/CardImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

// ── 정렬 키 ─────────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: "curated",   label: "내 순서 (큐레이션)" },
  { value: "grade",     label: "등급 높은 순" },
  { value: "year-desc", label: "연도 최신순" },
  { value: "year-asc",  label: "연도 오래된순" },
  { value: "subject",   label: "선수 이름" },
];

// ── 프레임 레이아웃 정의 ────────────────────────────────────────
// rows × cols 형태로 CSS grid에 직접 매핑
const FRAME_LAYOUTS = {
  "1x1": { rows: 1, cols: 1, slots: 1, label: "1 × 1", desc: "단독 진열" },
  "1x2": { rows: 1, cols: 2, slots: 2, label: "1 × 2", desc: "2장 가로" },
  "1x3": { rows: 1, cols: 3, slots: 3, label: "1 × 3", desc: "3장 가로" },
  "2x2": { rows: 2, cols: 2, slots: 4, label: "2 × 2", desc: "4장 정사각" },
  "2x3": { rows: 2, cols: 3, slots: 6, label: "2 × 3", desc: "6장 진열" },
  "3x3": { rows: 3, cols: 3, slots: 9, label: "3 × 3", desc: "9장 진열" },
};
const FRAME_KEYS = Object.keys(FRAME_LAYOUTS);
const DEFAULT_FRAME = "3x3";

function frameSlots(layout) {
  return FRAME_LAYOUTS[layout]?.slots ?? 9;
}

function gradeRank(grade) {
  const m = (grade || "").match(/\d+(\.\d+)?/);
  if (!m) return 0;
  return parseFloat(m[0]);
}

function sortCards(cards, key) {
  const arr = [...cards];
  switch (key) {
    case "grade":     return arr.sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade));
    case "year-desc": return arr.sort((a, b) => (b.year || "").localeCompare(a.year || ""));
    case "year-asc":  return arr.sort((a, b) => (a.year || "").localeCompare(b.year || ""));
    case "subject":   return arr.sort((a, b) => (a.subject || "").localeCompare(b.subject || ""));
    case "curated":
    default:
      // 백엔드에서 gallery_order 정렬해 보내주므로 그대로 유지
      return arr;
  }
}

// ── 3D Tilt 카드 ───────────────────────────────────────────────
function TiltCard({ card, onClick, editMode, sections, onMove, onRemove }) {
  const ref = useRef(null);
  const [transform, setTransform] = useState("");
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });
  const [menuOpen, setMenuOpen] = useState(false);

  function handleMouseMove(e) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = x / rect.width;
    const py = y / rect.height;
    const rotateY = (px - 0.5) * 24;
    const rotateX = -(py - 0.5) * 24;
    setTransform(`perspective(1200px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.03, 1.03, 1.03)`);
    setGlare({ x: px * 100, y: py * 100, opacity: 0.35 });
  }

  function handleMouseLeave() {
    setTransform("perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)");
    setGlare((g) => ({ ...g, opacity: 0 }));
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className="relative block w-full cursor-zoom-in focus:outline-none"
        aria-label={`${card.subject} ${card.year} ${card.setName}`}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            ref={ref}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
              transform,
              transition: "transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)",
              transformStyle: "preserve-3d",
            }}
            className="relative w-full aspect-[5/7] rounded-2xl overflow-hidden bg-[var(--surface-1)]"
          >
            <CardImage
              src={card.imageUrl}
              alt={card.subject}
              className="w-full h-full object-contain"
              draggable={false}
            />
            <div
              className="pointer-events-none absolute inset-0 mix-blend-overlay transition-opacity duration-300"
              style={{
                opacity: glare.opacity,
                background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.0) 45%)`,
              }}
            />
            <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5" />
            <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-gold/0 group-hover:ring-gold/25 transition-all duration-500" />
          </div>

          <div className="text-center px-2 max-w-full">
            <p className="font-poppins font-bold text-sm text-white/90 truncate">
              {card.subject || "Unknown"}
            </p>
            <p className="text-[11px] text-white/40 tracking-wider mt-1 truncate">
              {[card.year, card.setName, card.cardNumber && `#${card.cardNumber}`]
                .filter(Boolean).join(" · ")}
            </p>
            {(card.grader || card.grade) && (
              <p className="text-[10px] text-gold/70 uppercase tracking-[0.2em] mt-1.5 font-semibold">
                {[card.grader, card.grade].filter(Boolean).join(" ")}
              </p>
            )}
          </div>
        </div>
      </button>

      {/* 편집 모드: 우상단 이동 버튼 (호버 시 표시) */}
      {editMode && (
        <div className="absolute top-2 right-2 z-20">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="p-2 rounded-full bg-black/70 backdrop-blur-sm text-white/70 hover:text-gold border border-white/10 transition-all"
            title="이 카드를 다른 컬렉션으로 이동"
          >
            <FolderInput className="w-4 h-4" />
          </button>

          {menuOpen && (
            <>
              {/* 바깥 클릭 닫기용 */}
              <div
                className="fixed inset-0 z-30"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
              />
              <div
                className="absolute top-12 right-0 z-40 w-56 rounded-xl border border-white/10 bg-[#1a1a1a] shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[10px] text-white/40 uppercase tracking-wider px-3 py-2 border-b border-white/5">
                  다른 컬렉션으로 이동
                </p>
                <div className="max-h-64 overflow-y-auto py-1">
                  {sections.map((sec) => (
                    <button
                      key={sec.id}
                      onClick={() => { onMove(card.id, sec.id); setMenuOpen(false); }}
                      disabled={card.sectionId === sec.id}
                      className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-between"
                    >
                      <span className="truncate">{sec.name}</span>
                      {card.sectionId === sec.id && <Check className="w-3.5 h-3.5 text-gold shrink-0" />}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { onRemove(card.id); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-red-400/80 hover:bg-red-500/10 transition-colors border-t border-white/5 flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  갤러리에서 제거
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── 라이트박스 ────────────────────────────────────────────────
function Lightbox({ cards, index, onClose, onPrev, onNext }) {
  const card = cards[index];

  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, onPrev, onNext]);

  if (!card) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(18, 18, 18, 0.96)", backdropFilter: "blur(16px)" }}
      onClick={onClose}
    >
      <button onClick={onClose} className="absolute top-6 right-6 p-3 rounded-full bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all z-10 border border-white/10" aria-label="close">
        <X className="w-5 h-5" />
      </button>
      {index > 0 && (
        <button onClick={(e) => { e.stopPropagation(); onPrev(); }} className="absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all z-10 border border-white/10" aria-label="previous">
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {index < cards.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); onNext(); }} className="absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all z-10 border border-white/10" aria-label="next">
          <ChevronRight className="w-6 h-6" />
        </button>
      )}
      <div className="flex flex-col items-center gap-8 max-h-[90vh] px-8" onClick={(e) => e.stopPropagation()}>
        <CardImage
          src={card.imageUrl}
          alt={card.subject}
          className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-[0_30px_80px_-10px_rgba(212,175,55,0.25)]"
          draggable={false}
        />
        <div className="text-center max-w-xl">
          <p className="font-poppins font-bold text-2xl text-white">{card.subject || "Unknown"}</p>
          <p className="text-sm text-white/50 mt-2 tracking-wider">
            {[card.year, card.setName, card.cardNumber && `#${card.cardNumber}`, card.variety]
              .filter(Boolean).join(" · ")}
          </p>
          {(card.grader || card.grade) && (
            <p className="text-xs text-gold uppercase tracking-[0.3em] mt-3 font-bold">
              {[card.grader, card.grade].filter(Boolean).join(" ")}
            </p>
          )}
          {card.certNumber && <p className="text-[11px] text-white/30 font-mono mt-4">CERT · {card.certNumber}</p>}
          <p className="text-[10px] text-white/20 mt-6 tracking-[0.4em] uppercase">{index + 1} / {cards.length}</p>
        </div>
      </div>
    </div>
  );
}

// ── 빈 슬롯 placeholder ───────────────────────────────────────
function EmptySlot({ editMode, onAddCards }) {
  return (
    <button
      type="button"
      onClick={editMode ? onAddCards : undefined}
      disabled={!editMode}
      className={`w-full aspect-[5/7] rounded-xl border-2 border-dashed border-gold/15 flex items-center justify-center transition-all ${
        editMode
          ? "hover:border-gold/40 hover:bg-gold/5 cursor-pointer"
          : "opacity-40 cursor-default"
      }`}
    >
      {editMode ? (
        <div className="text-center text-gold/40 group-hover:text-gold/70">
          <Plus className="w-6 h-6 mx-auto mb-1" />
          <span className="text-[10px] uppercase tracking-widest">빈 슬롯</span>
        </div>
      ) : (
        <span className="text-[10px] text-white/15 uppercase tracking-widest">empty</span>
      )}
    </button>
  );
}

// ── 액자 (Frame) ─────────────────────────────────────────────
function Frame({ layout, children }) {
  const fl = FRAME_LAYOUTS[layout] || FRAME_LAYOUTS[DEFAULT_FRAME];

  return (
    <div
      className="relative mx-auto rounded-xl"
      style={{
        // 액자 외곽: 다중 골드 라인
        background: "linear-gradient(135deg, #1a1410 0%, #0f0a06 100%)",
        boxShadow:
          "0 0 0 2px rgba(212,175,55,0.15) inset, " +
          "0 0 0 10px rgba(15, 10, 6, 0.8) inset, " +
          "0 0 0 11px rgba(212,175,55,0.5) inset, " +
          "0 0 0 14px rgba(15, 10, 6, 0.8) inset, " +
          "0 0 0 15px rgba(212,175,55,0.25) inset, " +
          "0 30px 60px -10px rgba(0,0,0,0.6)",
        padding: "32px",
        maxWidth: fl.cols === 1 ? "320px" : fl.cols === 2 ? "640px" : "920px",
      }}
    >
      <div
        className="grid gap-5"
        style={{
          gridTemplateColumns: `repeat(${fl.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${fl.rows}, auto)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── 컬렉션 섹션 (액자 진열) ────────────────────────────────────
function CollectionSection({
  section, onCardClick, editMode, sections,
  onRename, onDelete, onMoveCard, onRemoveCard, onAddCards, onChangeFrame,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.name);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function submitRename() {
    const next = draft.trim();
    if (!next || next === section.name) { setEditing(false); return; }
    onRename(section.id, next);
    setEditing(false);
  }

  const layout = section.frameLayout || DEFAULT_FRAME;
  const fl = FRAME_LAYOUTS[layout] || FRAME_LAYOUTS[DEFAULT_FRAME];
  const filledCount = section.items.length;
  const emptyCount = Math.max(0, fl.slots - filledCount);

  return (
    <section className="mb-24">
      {/* 컬렉션 헤더 (액자 위) */}
      <div className="text-center mb-8">
        <p className="text-[10px] text-gold/60 uppercase tracking-[0.4em] mb-3">Collection</p>
        {editing ? (
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              else if (e.key === "Escape") { setDraft(section.name); setEditing(false); }
            }}
            onBlur={submitRename}
            className="font-poppins font-bold text-2xl h-auto py-1 bg-transparent border-white/20 max-w-md mx-auto text-center"
          />
        ) : (
          <h2 className="font-poppins font-bold text-3xl tracking-tight text-white">
            {section.name}
          </h2>
        )}
        <p className="text-[11px] text-white/30 tracking-[0.3em] uppercase mt-3">
          {fl.label} · {filledCount} / {fl.slots} pieces
        </p>

        {/* 편집 모드 툴바 (액자 위) */}
        {editMode && (
          <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
            <button
              onClick={() => { setDraft(section.name); setEditing(true); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-white/50 border border-white/10 hover:text-gold hover:border-gold/30 transition-colors"
            >
              <Pencil className="w-3 h-3" /> 이름
            </button>

            {/* 프레임 변경 드롭다운 */}
            <Select value={layout} onValueChange={(v) => onChangeFrame(section.id, v, filledCount)}>
              <SelectTrigger className="h-7 w-32 text-[11px] bg-transparent border-white/10">
                <SelectValue placeholder="프레임" />
              </SelectTrigger>
              <SelectContent>
                {FRAME_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {FRAME_LAYOUTS[k].label} ({FRAME_LAYOUTS[k].slots}장)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              onClick={onAddCards}
              disabled={emptyCount === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-gold/15 border border-gold/40 text-gold text-[11px] font-bold hover:bg-gold/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={emptyCount === 0 ? "프레임이 가득 찼습니다" : "카드 추가"}
            >
              <Plus className="w-3 h-3" /> 카드 추가
            </button>
            <button
              onClick={() => onDelete(section.id, section.name)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-white/50 border border-white/10 hover:text-red-400 hover:border-red-500/30 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> 삭제
            </button>
          </div>
        )}
      </div>

      {/* 액자 */}
      <Frame layout={layout}>
        {section.items.map((card) => (
          <TiltCard
            key={card.id}
            card={card}
            editMode={editMode}
            sections={sections}
            onClick={() => onCardClick(card)}
            onMove={onMoveCard}
            onRemove={onRemoveCard}
          />
        ))}
        {Array.from({ length: emptyCount }).map((_, i) => (
          <EmptySlot key={`empty-${i}`} editMode={editMode} onAddCards={onAddCards} />
        ))}
      </Frame>
    </section>
  );
}

// ── Gallery 메인 ───────────────────────────────────────────────
export default function Gallery() {
  const [cards, setCards] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [sortKey, setSortKey] = useState("curated");
  const [lightboxCard, setLightboxCard] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // 새 컬렉션 모달
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createFrame, setCreateFrame] = useState(DEFAULT_FRAME);
  const [createBusy, setCreateBusy] = useState(false);

  // 카드 불러오기 모달
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addTargetSection, setAddTargetSection] = useState(null);
  const [addSelected, setAddSelected] = useState(new Set());
  const [addBusy, setAddBusy] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cardsR, sectionsR] = await Promise.allSettled([
        apiJson("/api/cards?status=all"), // 갤러리는 판매한 카드도 트로피로 유지
        apiJson("/api/gallery/sections"),
      ]);
      if (cardsR.status === "fulfilled") setCards(Array.isArray(cardsR.value) ? cardsR.value : []);
      if (sectionsR.status === "fulfilled") setSections(Array.isArray(sectionsR.value) ? sectionsR.value : []);
      // 실패를 조용히 묻지 않는다 — 하나라도 실패하면 배너로 알리고 재시도 제공.
      const failed = [cardsR, sectionsR].find((r) => r.status === "rejected");
      setLoadError(failed ? (failed.reason?.message || "갤러리를 불러오지 못했습니다.") : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── 큐레이션 액션들 ─────────────────────────────────────────
  async function handleCreateSection() {
    const name = createName.trim();
    if (!name) { alert("컬렉션 이름을 입력해 주세요."); return; }
    setCreateBusy(true);
    try {
      const res = await apiFetch("/api/gallery/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, frameLayout: createFrame }),
      });
      if (!res.ok) { alert("생성 실패"); return; }
      setCreateName("");
      setCreateFrame(DEFAULT_FRAME);
      setCreateOpen(false);
      await loadAll();
    } catch (e) {
      alert("서버 통신 오류");
      console.error(e);
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleChangeFrame(sectionId, newLayout, currentCount) {
    const newSlots = frameSlots(newLayout);
    if (currentCount > newSlots) {
      alert(
        `현재 ${currentCount}장이 진열중인데 ${newLayout} 프레임은 ${newSlots}장만 수용합니다.\n` +
        `먼저 ${currentCount - newSlots}장의 카드를 갤러리에서 제거해 주세요.`
      );
      return;
    }
    try {
      const res = await apiFetch(`/api/gallery/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameLayout: newLayout }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "프레임 변경 실패");
        return;
      }
      setSections((prev) =>
        prev.map((s) => s.id === sectionId ? { ...s, frameLayout: newLayout } : s)
      );
    } catch (e) {
      alert("서버 통신 오류");
      console.error(e);
    }
  }

  async function handleRenameSection(id, name) {
    try {
      const res = await apiFetch(`/api/gallery/sections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) { alert("이름 변경 실패"); return; }
      // 낙관적 갱신
      setSections((prev) => prev.map((s) => s.id === id ? { ...s, name } : s));
    } catch (e) {
      alert("서버 통신 오류");
      console.error(e);
    }
  }

  async function handleDeleteSection(id, name) {
    if (!confirm(`"${name}" 컬렉션을 삭제하시겠습니까?\n속한 카드는 Uncurated로 이동됩니다.`)) return;
    try {
      const res = await apiFetch(`/api/gallery/sections/${id}`, { method: "DELETE" });
      if (!res.ok) { alert("삭제 실패"); return; }
      await loadAll();
    } catch (e) {
      alert("서버 통신 오류");
      console.error(e);
    }
  }

  async function handleMoveCard(cardId, sectionId) {
    try {
      const res = await apiFetch(`/api/cards/${cardId}/section`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId }),
      });
      if (!res.ok) { alert("이동 실패"); return; }
      await loadAll();
    } catch (e) {
      alert("서버 통신 오류");
      console.error(e);
    }
  }

  async function handleRemoveCard(cardId) {
    if (!confirm("이 카드를 갤러리에서 제거하시겠습니까?\n(Collection에는 그대로 남습니다)")) return;
    try {
      const res = await apiFetch(`/api/cards/${cardId}/section`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: null }),
      });
      if (!res.ok) { alert("제거 실패"); return; }
      await loadAll();
    } catch (e) {
      alert("서버 통신 오류");
      console.error(e);
    }
  }

  function openAddCardsModal(sectionId) {
    setAddTargetSection(sectionId);
    setAddSelected(new Set());
    setAddModalOpen(true);
  }

  async function handleConfirmAddCards() {
    if (!addTargetSection) return;
    const cardIds = [...addSelected];
    if (cardIds.length === 0) { setAddModalOpen(false); return; }

    setAddBusy(true);
    try {
      const res = await apiFetch(
        `/api/gallery/sections/${addTargetSection}/cards/add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardIds }),
        }
      );
      if (!res.ok) { alert("카드 추가 실패"); return; }
      setAddModalOpen(false);
      setAddSelected(new Set());
      await loadAll();
    } catch (e) {
      alert("서버 통신 오류");
      console.error(e);
    } finally {
      setAddBusy(false);
    }
  }

  function toggleAddSelection(cardId, existingSectionName) {
    setAddSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        if (existingSectionName) {
          if (!confirm(`이 카드는 이미 "${existingSectionName}" 컬렉션에 있습니다.\n이쪽으로 이동시킬까요?`)) {
            return prev;
          }
        }
        next.add(cardId);
      }
      return next;
    });
  }

  // 카드 ID → 카드 객체 매핑
  const cardById = useMemo(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards]
  );

  // 화면에 그릴 섹션 배열 — 사용자 섹션만. Uncurated 개념 없음.
  const displaySections = useMemo(() => {
    return sections.map((sec) => ({
      id: sec.id,
      name: sec.name,
      frameLayout: sec.frameLayout || DEFAULT_FRAME,
      items: sortCards(
        sec.cardIds.map((id) => cardById.get(id)).filter(Boolean),
        sortKey
      ),
    }));
  }, [sections, cardById, sortKey]);

  // 카드 이동 메뉴에 쓸 섹션 목록
  const sectionsForMenu = useMemo(
    () => sections.map((s) => ({ id: s.id, name: s.name })),
    [sections]
  );

  // 카드가 어느 섹션에 있는지 빠른 조회
  const cardSectionMap = useMemo(() => {
    const m = new Map();
    for (const sec of sections) {
      for (const cardId of sec.cardIds) {
        m.set(cardId, { sectionId: sec.id, sectionName: sec.name });
      }
    }
    return m;
  }, [sections]);

  const flatCards = useMemo(
    () => displaySections.flatMap((s) => s.items),
    [displaySections]
  );
  const lightboxIndex = lightboxCard
    ? flatCards.findIndex((c) => c.id === lightboxCard.id)
    : -1;

  return (
    <div style={{ background: "var(--bg-base)" }} className="min-h-full">
      {/* 인트로 */}
      <div className="max-w-5xl mx-auto px-8 pt-12 pb-8">
        <p className="text-[10px] text-gold/70 uppercase tracking-[0.4em] text-center mb-3">
          Private Gallery
        </p>
        <h1 className="font-poppins font-bold text-3xl md:text-4xl text-white text-center tracking-tight">
          The Collection
        </h1>
        <div className="flex items-center justify-center gap-6 mt-6 text-xs text-white/40 flex-wrap">
          <span><b className="text-white/70 font-semibold">{cards.length}</b> 작품 소장</span>
          <span className="text-white/10">|</span>
          <span><b className="text-white/70 font-semibold">{sections.length}</b> 컬렉션</span>
          <span className="text-white/10">|</span>
          <div className="flex items-center gap-2">
            <span>정렬</span>
            <Select value={sortKey} onValueChange={setSortKey}>
              <SelectTrigger className="h-8 w-44 text-xs bg-transparent border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-white/10">|</span>
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[11px] font-medium transition-colors ${
              editMode
                ? "bg-gold/15 border-gold/40 text-gold"
                : "border-white/10 text-white/50 hover:text-white hover:border-white/20"
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            {editMode ? "편집 모드 ON" : "편집"}
          </button>
          {editMode && (
            <button
              onClick={() => { setCreateName(""); setCreateOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gold text-black text-[11px] font-bold hover:bg-gold-hover transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              새 컬렉션
            </button>
          )}
        </div>
        {editMode && (
          <p className="text-center text-[11px] text-white/40 mt-4 leading-relaxed">
            <span className="text-gold/70">편집 모드</span> · 컬렉션 이름의 <Pencil className="w-3 h-3 inline mb-0.5" /> 으로 변경, <Trash2 className="w-3 h-3 inline mb-0.5" /> 로 삭제 ·
            카드 우상단 <FolderInput className="w-3 h-3 inline mb-0.5" /> 로 다른 컬렉션으로 이동
          </p>
        )}
        <div className="mt-10 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
      </div>

      {/* 전시장 */}
      <div className="max-w-7xl mx-auto px-8 pb-24">
        {loading ? (
          <div className="text-center py-32 text-white/20 text-sm tracking-widest">
            ENTERING THE GALLERY...
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3" role="alert">
            <p className="flex items-center gap-2 text-sm text-[#ff8a80]">
              <AlertTriangle className="w-4 h-4" /> {loadError}
            </p>
            <button
              onClick={loadAll}
              className="rounded-lg border border-[rgba(244,67,54,0.4)] px-4 py-1.5 text-xs font-semibold text-[#ff8a80] hover:bg-[rgba(244,67,54,0.15)]"
            >
              다시 시도
            </button>
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-32 text-white/30">
            <p className="text-sm">아직 전시할 작품이 없습니다.</p>
            <p className="text-xs text-white/20 mt-2">카드를 등록하면 이곳에 진열됩니다.</p>
          </div>
        ) : displaySections.length === 0 ? (
          <div className="text-center py-32 text-white/30">
            <p className="text-sm">표시할 컬렉션이 없습니다.</p>
          </div>
        ) : (
          <div className="pt-8">
            {sections.length === 0 ? (
              <div className="text-center py-24 text-white/40">
                <p className="text-sm tracking-wide">아직 진열된 작품이 없습니다.</p>
                <p className="text-[11px] text-white/30 mt-3 leading-relaxed">
                  <span className="text-gold/70">편집 모드</span>를 켜고
                  <span className="text-gold/70"> 새 컬렉션</span>을 만든 다음<br />
                  컬렉션 헤더의 <span className="text-gold/70">+ 카드 추가</span>로 작품을 진열해 보세요.
                </p>
              </div>
            ) : (
              displaySections.map((section) => (
                <CollectionSection
                  key={section.id}
                  section={section}
                  editMode={editMode}
                  sections={sectionsForMenu}
                  onCardClick={(card) => setLightboxCard(card)}
                  onRename={handleRenameSection}
                  onDelete={handleDeleteSection}
                  onMoveCard={handleMoveCard}
                  onRemoveCard={handleRemoveCard}
                  onAddCards={() => openAddCardsModal(section.id)}
                  onChangeFrame={handleChangeFrame}
                />
              ))
            )}
          </div>
        )}
      </div>

      {lightboxCard && lightboxIndex >= 0 && (
        <Lightbox
          cards={flatCards}
          index={lightboxIndex}
          onClose={() => setLightboxCard(null)}
          onPrev={() => {
            const next = Math.max(0, lightboxIndex - 1);
            setLightboxCard(flatCards[next]);
          }}
          onNext={() => {
            const next = Math.min(flatCards.length - 1, lightboxIndex + 1);
            setLightboxCard(flatCards[next]);
          }}
        />
      )}

      {/* 카드 불러오기 모달 */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {(() => {
                const sec = sections.find((s) => s.id === addTargetSection);
                return sec ? `"${sec.name}" 에 카드 추가` : "카드 추가";
              })()}
            </DialogTitle>
            <DialogDescription>
              Collection에서 진열할 카드를 선택하세요. 이미 다른 컬렉션에 있는 카드는 클릭 시 이쪽으로 이동됩니다.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const sec = sections.find((s) => s.id === addTargetSection);
            const fl = sec ? FRAME_LAYOUTS[sec.frameLayout || DEFAULT_FRAME] : null;
            const filled = sec ? sec.cardIds.length : 0;
            const available = fl ? Math.max(0, fl.slots - filled) : 0;
            const over = addSelected.size > available;
            return (
              <div className={`text-xs px-3 py-2 rounded-md border mb-3 ${
                over
                  ? "border-red-500/40 bg-red-500/10 text-red-300"
                  : "border-gold/20 bg-gold/5 text-gold/80"
              }`}>
                <span className="font-semibold">{fl?.label}</span> 프레임 ·
                현재 <b className="text-white/90">{filled}</b> / {fl?.slots}장 진열중 ·
                선택 <b className="text-white/90">{addSelected.size}</b>장 ·
                {over
                  ? <span className="font-bold"> 슬롯 초과! {addSelected.size - available}장 줄여주세요</span>
                  : <span> 추가 가능 {Math.max(0, available - addSelected.size)}장</span>}
              </div>
            );
          })()}

          {cards.length === 0 ? (
            <div className="text-center py-12 text-white/40 text-sm">
              등록된 카드가 없습니다. 먼저 Collection에서 카드를 등록하세요.
            </div>
          ) : (
            <>
              <div className="text-xs text-white/40 mb-3">
                <b className="text-white/70">{addSelected.size}</b>개 선택됨 · 총 {cards.length}장
              </div>
              <div className="max-h-[60vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {cards.map((card) => {
                    const existing = cardSectionMap.get(card.id);
                    const isInTargetSection = existing?.sectionId === addTargetSection;
                    const isInOtherSection = existing && !isInTargetSection;
                    const selected = addSelected.has(card.id);
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => {
                          if (isInTargetSection) return; // 이미 이 섹션에 있으면 무시
                          toggleAddSelection(card.id, isInOtherSection ? existing.sectionName : null);
                        }}
                        disabled={isInTargetSection}
                        className={`group relative aspect-[5/7] rounded-lg overflow-hidden border-2 transition-all ${
                          selected
                            ? "border-gold ring-2 ring-gold/30"
                            : isInTargetSection
                              ? "border-green-500/40 opacity-60 cursor-not-allowed"
                              : isInOtherSection
                                ? "border-yellow-500/30 hover:border-yellow-500/60"
                                : "border-white/10 hover:border-white/30"
                        }`}
                        title={
                          isInTargetSection
                            ? "이미 이 컬렉션에 있음"
                            : isInOtherSection
                              ? `현재: ${existing.sectionName}`
                              : card.subject
                        }
                      >
                        <CardImage
                          src={card.imageUrl}
                          alt={card.subject}
                          className="w-full h-full object-contain bg-[#0a0f1e]"
                        />
                        {/* 라벨 — 하단 */}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent px-2 py-1.5">
                          <p className="text-[10px] text-white/90 truncate font-semibold">
                            {card.subject}
                          </p>
                        </div>
                        {/* 상태 배지 */}
                        {isInTargetSection && (
                          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-green-500/90 text-black text-[9px] font-bold">
                            ✓ 진열중
                          </div>
                        )}
                        {isInOtherSection && (
                          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-yellow-500/90 text-black text-[9px] font-bold truncate max-w-[80%]">
                            {existing.sectionName}
                          </div>
                        )}
                        {/* 선택 체크 */}
                        {selected && (
                          <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-gold flex items-center justify-center shadow-lg">
                            <Check className="w-4 h-4 text-black" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddModalOpen(false)}>취소</Button>
            {(() => {
              const sec = sections.find((s) => s.id === addTargetSection);
              const fl = sec ? FRAME_LAYOUTS[sec.frameLayout || DEFAULT_FRAME] : null;
              const available = fl ? Math.max(0, fl.slots - sec.cardIds.length) : 0;
              const over = addSelected.size > available;
              return (
                <Button onClick={handleConfirmAddCards} disabled={addBusy || addSelected.size === 0 || over}>
                  {addBusy
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> 추가 중...</>
                    : `${addSelected.size}장 추가`}
                </Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 새 컬렉션 모달 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>새 컬렉션</DialogTitle>
            <DialogDescription>
              이름과 진열 프레임을 선택하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* 이름 */}
            <div className="space-y-2">
              <label className="text-xs text-white/50 uppercase tracking-wider">이름</label>
              <Input
                placeholder="예: Hall of Fame"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateSection()}
                maxLength={120}
                autoFocus
              />
            </div>

            {/* 프레임 선택 — 미니 미리보기 그리드 */}
            <div className="space-y-2">
              <label className="text-xs text-white/50 uppercase tracking-wider">프레임</label>
              <div className="grid grid-cols-3 gap-2">
                {FRAME_KEYS.map((k) => {
                  const fl = FRAME_LAYOUTS[k];
                  const active = createFrame === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setCreateFrame(k)}
                      className={`p-3 rounded-lg border transition-all text-left ${
                        active
                          ? "border-gold bg-gold/10"
                          : "border-white/10 hover:border-white/25 bg-white/[0.02]"
                      }`}
                    >
                      {/* 미니 프레임 미리보기 */}
                      <div className="aspect-[5/4] mb-2 rounded p-2 bg-black/40 border border-gold/30">
                        <div
                          className="w-full h-full grid gap-1"
                          style={{
                            gridTemplateColumns: `repeat(${fl.cols}, minmax(0, 1fr))`,
                            gridTemplateRows: `repeat(${fl.rows}, minmax(0, 1fr))`,
                          }}
                        >
                          {Array.from({ length: fl.slots }).map((_, i) => (
                            <div key={i} className={`rounded-sm ${active ? "bg-gold/60" : "bg-white/20"}`} />
                          ))}
                        </div>
                      </div>
                      <p className={`text-[11px] font-bold text-center ${active ? "text-gold" : "text-white/70"}`}>
                        {fl.label}
                      </p>
                      <p className="text-[9px] text-white/40 text-center mt-0.5">{fl.slots}장</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>취소</Button>
            <Button onClick={handleCreateSection} disabled={createBusy}>
              {createBusy
                ? <><Loader2 className="w-4 h-4 animate-spin" /> 생성 중...</>
                : "만들기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
