import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/api";

/**
 * 카드 삭제 공통 훅.
 *
 * @param {object} options
 * @param {(id: number) => void} [options.onDelete]  - 삭제 성공 후 부모 상태 갱신 콜백 (Collection 전용)
 * @param {string} [options.navigateTo]              - 삭제 성공 후 이동할 경로 (CardDetail 전용)
 */
export function useCardDelete({ onDelete, navigateTo } = {}) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  async function deleteCard(cardId, cardSubject, e) {
    e?.stopPropagation();
    if (!confirm(`정말 삭제하시겠습니까?\n(${cardSubject})`)) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/cards/${cardId}`, { method: "DELETE" });
      if (!res.ok) { alert("카드 삭제에 실패했습니다."); return; }
      onDelete?.(cardId);
      if (navigateTo) navigate(navigateTo, { replace: true });
    } catch {
      alert("서버 통신 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  return { deleteCard, deleting };
}
