import { Gem } from "lucide-react";
import { rarityTier } from "@/lib/rarityUtils";

// 인구수 기반 희소 뱃지. pop=1 → MASTERPIECE, pop 2~5 → LOW POP · N.
// 위치/여백은 className으로 호출측에서 지정.
export default function RarityBadge({ card, className = "" }) {
  const r = rarityTier(card);
  if (!r) return null;

  if (r.tier === "masterpiece") {
    return (
      <span className={`rarity-badge rarity-badge--mp ${className}`}>
        <Gem className="w-3 h-3" /> MASTERPIECE
      </span>
    );
  }
  return (
    <span className={`rarity-badge rarity-badge--low ${className}`}>
      LOW POP · {r.pop}
    </span>
  );
}
