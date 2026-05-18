import { useEffect, useMemo, useState } from "react";
import emojiData from "@emoji-mart/data";

type EmojiCategory = {
  id: string;
  name: string;
  emojis: string[];
};

type EmojiPickerProps = {
  value?: string;
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  recentKey?: string;
  closeOnSelect?: boolean;
  className?: string;
};

const EMOJI_DATA = emojiData as any;
const EMOJI_MAP: Record<string, any> = EMOJI_DATA.emojis || {};
const BASE_CATEGORIES: Array<{ id: string; name: string; emojis: string[] }> =
  (EMOJI_DATA.categories || []).map((category: any) => {
    const list =
      category.emojis?.map((emojiId: string) => {
        const info = EMOJI_MAP[emojiId];
        if (!info) return null;
        if (info.skins?.length) {
          return info.skins[0]?.native || info.native || null;
        }
        return info.native || null;
      }) || [];
    return {
      id: category.id,
      name: category.name,
      emojis: list.filter(Boolean) as string[],
    };
  });

const CATEGORY_ORDER = [
  "recent",
  "smileys-emotion",
  "people-body",
  "animals-nature",
  "food-drink",
  "activities",
  "travel-places",
  "objects",
  "symbols",
  "flags",
];

const CATEGORY_ICONS: Record<string, string> = {
  recent: "🕘",
  "smileys-emotion": "😀",
  "people-body": "🧑",
  "animals-nature": "🐱",
  "food-drink": "🍎",
  activities: "⚽",
  "travel-places": "🚗",
  objects: "💡",
  symbols: "❤️",
  flags: "🏳️",
};

const CATEGORY_LABELS: Record<string, string> = {
  recent: "Недавние",
  "smileys-emotion": "Смайлы",
  "people-body": "Люди",
  "animals-nature": "Животные",
  "food-drink": "Еда",
  activities: "Активности",
  "travel-places": "Путешествия",
  objects: "Объекты",
  symbols: "Символы",
  flags: "Флаги",
};

const CATEGORY_MAP = new Map(BASE_CATEGORIES.map((category) => [category.id, category]));

export const DEFAULT_EMOJI = "😀";

export function EmojiPicker({
  value,
  onSelect,
  onClose,
  recentKey = "emoji_recent",
  closeOnSelect,
  className,
}: EmojiPickerProps) {
  const [recent, setRecent] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("smileys-emotion");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(recentKey);
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      const clean = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      setRecent(clean);
      if (clean.length) {
        setActiveCategory("recent");
      }
    } catch {
      setRecent([]);
    }
  }, [recentKey]);

  useEffect(() => {
    if (activeCategory === "recent" && recent.length === 0) {
      setActiveCategory("smileys-emotion");
    }
  }, [activeCategory, recent]);

  const categories = useMemo<EmojiCategory[]>(() => {
    return CATEGORY_ORDER.flatMap((id) => {
      if (id === "recent") {
        return [
          {
            id,
            name: CATEGORY_LABELS[id],
            emojis: recent,
          },
        ];
      }
      const category = CATEGORY_MAP.get(id);
      if (!category) return [];
      return [
        {
          id: category.id,
          name: CATEGORY_LABELS[category.id] || category.name,
          emojis: category.emojis,
        },
      ];
    });
  }, [recent]);

  const active = categories.find((category) => category.id === activeCategory) || categories[1];

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    const next = [emoji, ...recent.filter((item) => item !== emoji)].slice(0, 36);
    setRecent(next);
    try {
      localStorage.setItem(recentKey, JSON.stringify(next));
    } catch {
      // ignore
    }
    if (closeOnSelect) {
      onClose?.();
    }
  };

  return (
    <div
      className={`rounded-[16px] p-3 ${className || ""}`}
      style={{
        background: "var(--app-surface)",
        border: "1px solid rgba(255,255,255,0.12)",
        userSelect: "none",
      }}
    >
      <div
        className="flex items-center gap-1 pb-2 border-b overflow-x-auto"
        style={{ borderColor: "rgba(255,255,255,0.12)" }}
      >
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setActiveCategory(category.id)}
            className="w-8 h-8 rounded-[10px] flex items-center justify-center text-lg transition-all"
            style={{
              background:
                activeCategory === category.id
                  ? "color-mix(in srgb, var(--app-accent) 25%, transparent)"
                  : "transparent",
              border:
                activeCategory === category.id
                  ? "1px solid color-mix(in srgb, var(--app-accent) 45%, transparent)"
                  : "1px solid transparent",
            }}
            title={category.name}
          >
            {CATEGORY_ICONS[category.id] || "🙂"}
          </button>
        ))}
      </div>

      <div className="mt-2">
        <div className="text-[11px] text-white/60 mb-2">{active?.name || "Эмодзи"}</div>
        <div className="grid grid-cols-9 gap-1 max-h-[240px] overflow-y-auto pr-1">
          {(active?.emojis || []).map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleSelect(emoji)}
              className="w-8 h-8 rounded-[8px] flex items-center justify-center text-lg transition-all"
              style={{
                background:
                  emoji === value
                    ? "color-mix(in srgb, var(--app-accent) 25%, transparent)"
                    : "rgba(255,255,255,0.04)",
                border:
                  emoji === value
                    ? "1px solid color-mix(in srgb, var(--app-accent) 50%, transparent)"
                    : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
