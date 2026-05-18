export type ThemeId =
  | "dark"
  | "light"
  | "retro"
  | "noir"
  | "neon"
  | "arctic"
  | "ember"
  | "forest"
  | "vapor"
  | "cobalt"
  | "sable"
  | "obsidian"
  | "lagoon"
  | "sunset"
  | "shader-waves"
  | "shader-ether"
  | "shader-stars"
  | "shader-lines"
  | "shader-plasma"
  | "shader-particles"
  | "shader-voronoi"
  | "shader-aurora"
  | "shader-fractal";

const THEME_KEY = "wd_theme";

export const THEMES: Array<{
  id: ThemeId;
  name: string;
  description: string;
  preview: string;
}> = [
  {
    id: "dark",
    name: "Темная",
    description: "Глубокие синие и бирюзовые акценты.",
    preview: "linear-gradient(135deg, #0b1320 0%, #101c30 55%, #0b1422 100%)",
  },
  {
    id: "light",
    name: "Светлая",
    description: "Холодный светлый туман, высокая читаемость.",
    preview: "linear-gradient(135deg, #e7eefb 0%, #d7e4f7 55%, #cfdcf3 100%)",
  },
  {
    id: "retro",
    name: "Ретро",
    description: "Оливковые и янтарные нотки 80-х.",
    preview: "linear-gradient(135deg, #1d2319 0%, #323826 55%, #1b2119 100%)",
  },
  {
    id: "noir",
    name: "Нуар",
    description: "Почти черный с ледяными бликами.",
    preview: "linear-gradient(135deg, #05070d 0%, #0c0f19 60%, #05070d 100%)",
  },
  {
    id: "neon",
    name: "Неон",
    description: "Синь с яркими неоновыми акцентами.",
    preview: "linear-gradient(135deg, #0c0c18 0%, #15152a 55%, #0b0b15 100%)",
  },
  {
    id: "arctic",
    name: "Арктика",
    description: "Холодная сталь и северный лед.",
    preview: "linear-gradient(135deg, #0c151d 0%, #0f1f2b 55%, #0c141b 100%)",
  },
  {
    id: "ember",
    name: "Янтарь",
    description: "Теплые искры на темном графите.",
    preview: "linear-gradient(135deg, #17100c 0%, #241a13 55%, #120d0a 100%)",
  },
  {
    id: "forest",
    name: "Лес",
    description: "Мшистые зеленые оттенки и глубокие тени.",
    preview: "linear-gradient(135deg, #0d1a14 0%, #15251c 55%, #0b1511 100%)",
  },
  {
    id: "vapor",
    name: "Вейпор",
    description: "Пыльный индиго с мягким розовым неоном.",
    preview: "linear-gradient(135deg, #16102a 0%, #23183f 55%, #120c22 100%)",
  },
  {
    id: "cobalt",
    name: "Кобальт",
    description: "Глубокий синий и холодные голубые акценты.",
    preview: "linear-gradient(135deg, #0b1624 0%, #112238 55%, #0a1321 100%)",
  },
  {
    id: "sable",
    name: "Соболь",
    description: "Теплый тёмный орех с медными бликами.",
    preview: "linear-gradient(135deg, #120c09 0%, #1d1410 55%, #0b0706 100%)",
  },
  {
    id: "obsidian",
    name: "Обсидиан",
    description: "Почти черный графит с алым свечением.",
    preview: "linear-gradient(135deg, #07070a 0%, #121216 55%, #07070a 100%)",
  },
  {
    id: "lagoon",
    name: "Лагуна",
    description: "Глубокая бирюза и прохладные волны.",
    preview: "linear-gradient(135deg, #0b1a1f 0%, #12323b 55%, #0a151a 100%)",
  },
  {
    id: "sunset",
    name: "Закат",
    description: "Тёплые оранжево-розовые отблески на синем фоне.",
    preview: "linear-gradient(135deg, #0b111b 0%, #141b2b 55%, #0a0f19 100%)",
  },
  {
    id: "shader-waves",
    name: "Шейдер: Волны",
    description: "Анимированный фон с мягкими волнами.",
    preview: "linear-gradient(135deg, #0a0f1c 0%, #15243d 55%, #0a0f1c 100%)",
  },
  {
    id: "shader-ether",
    name: "Шейдер: Эфир",
    description: "Пульсирующие облака и эфирные переливы.",
    preview: "linear-gradient(135deg, #0b0c18 0%, #1a1430 55%, #0b0c18 100%)",
  },
  {
    id: "shader-stars",
    name: "Шейдер: Звезды",
    description: "Мерцающее звездное поле.",
    preview: "linear-gradient(135deg, #06070f 0%, #101429 55%, #06070f 100%)",
  },
  {
    id: "shader-lines",
    name: "Шейдер: Линии",
    description: "Живые световые линии.",
    preview: "linear-gradient(135deg, #0a0c12 0%, #131a24 55%, #0a0c12 100%)",
  },
  {
    id: "shader-plasma",
    name: "Шейдер: Плазма",
    description: "Пульсирующий плазменный поток.",
    preview: "linear-gradient(135deg, #1a0f0c 0%, #2b1a12 55%, #120b09 100%)",
  },
  {
    id: "shader-particles",
    name: "Шейдер: Частицы",
    description: "Светящееся поле частиц.",
    preview: "linear-gradient(135deg, #0b121c 0%, #162336 55%, #0a1018 100%)",
  },
  {
    id: "shader-voronoi",
    name: "Шейдер: Вороной",
    description: "Движущиеся ячейки и грани.",
    preview: "linear-gradient(135deg, #0c1218 0%, #1b2836 55%, #0b1015 100%)",
  },
  {
    id: "shader-aurora",
    name: "Шейдер: Аврора",
    description: "Северные огни и волны света.",
    preview: "linear-gradient(135deg, #0b1516 0%, #132627 55%, #091011 100%)",
  },
  {
    id: "shader-fractal",
    name: "Шейдер: Фрактал",
    description: "Фрактальные шумы и текстуры.",
    preview: "linear-gradient(135deg, #0c1316 0%, #182428 55%, #0a1012 100%)",
  },
];

export const getTheme = (): ThemeId => {
  const stored = localStorage.getItem(THEME_KEY) as ThemeId | null;
  if (!stored) return "dark";
  return THEMES.some((theme) => theme.id === stored) ? stored : "dark";
};

export const setTheme = (themeId: ThemeId) => {
  const value = THEMES.some((theme) => theme.id === themeId) ? themeId : "dark";
  document.documentElement.setAttribute("data-theme", value);
  localStorage.setItem(THEME_KEY, value);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("wd:theme-change", { detail: value }));
  }
};

export const applyStoredTheme = () => {
  const current = getTheme();
  document.documentElement.setAttribute("data-theme", current);
};
