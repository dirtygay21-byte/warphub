import type { CardRarity } from "@/apiUtils/minigames";

/** Цвета редкостей: узнаются с первого взгляда */
export const RARITY_STYLE: Record<
  CardRarity,
  { color: string; frame: string; text: string; glow: string; gem: string }
> = {
  common: {
    color: "#9aa0a8",
    frame: "linear-gradient(160deg,#a7adb5,#4b4f55 55%,#8a9098)",
    text: "text-[#c3c8cf]",
    glow: "none",
    gem: "#9aa0a8",
  },
  uncommon: {
    color: "#52c46f",
    frame: "linear-gradient(160deg,#7fe397,#1f6b33 55%,#52c46f)",
    text: "text-[#7fe397]",
    glow: "0 0 14px rgba(82,196,111,0.35)",
    gem: "#52c46f",
  },
  rare: {
    color: "#4a95ff",
    frame: "linear-gradient(160deg,#8cc0ff,#1c4fa6 55%,#4a95ff)",
    text: "text-[#8cc0ff]",
    glow: "0 0 18px rgba(74,149,255,0.45)",
    gem: "#4a95ff",
  },
  epic: {
    color: "#b26bff",
    frame: "linear-gradient(160deg,#d6a8ff,#5b1fa6 55%,#b26bff)",
    text: "text-[#d6a8ff]",
    glow: "0 0 24px rgba(178,107,255,0.55)",
    gem: "#b26bff",
  },
  legendary: {
    color: "#f5c542",
    frame: "linear-gradient(160deg,#fff1a8,#b07a12 40%,#ffd75a 60%,#8a5a0a)",
    text: "text-[#ffd75a]",
    glow: "0 0 30px rgba(245,197,66,0.65)",
    gem: "#f5c542",
  },
};

export const RARITY_ORDER: CardRarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
