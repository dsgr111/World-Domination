export const AVATAR_EMOJIS = ["👑", "🏆", "⚔️", "🛡️", "🏰", "🎯", "⭐", "🔱"];

const baseCity = (id, name, baseIncome, lifeLevel = 5) => ({
  id,
  name,
  baseIncome,
  lifeLevel,
  shields: 0,
  destroyed: false,
});

export const COUNTRY_TEMPLATES = [
  {
    id: "ru",
    name: "Россия",
    flag: "🇷🇺",
    cities: [
      baseCity("ru_moscow", "Москва", 140),
      baseCity("ru_spb", "Санкт-Петербург", 120),
      baseCity("ru_novosibirsk", "Новосибирск", 100),
    ],
  },
  {
    id: "cn",
    name: "Китай",
    flag: "🇨🇳",
    cities: [
      baseCity("cn_beijing", "Пекин", 140),
      baseCity("cn_shanghai", "Шанхай", 120),
      baseCity("cn_shenzhen", "Шэньчжэнь", 100),
    ],
  },
  {
    id: "us",
    name: "США",
    flag: "🇺🇸",
    cities: [
      baseCity("us_washington", "Вашингтон", 140),
      baseCity("us_newyork", "Нью-Йорк", 120),
      baseCity("us_losangeles", "Лос-Анджелес", 100),
    ],
  },
  {
    id: "de",
    name: "Германия",
    flag: "🇩🇪",
    cities: [
      baseCity("de_berlin", "Берлин", 140),
      baseCity("de_munich", "Мюнхен", 120),
      baseCity("de_hamburg", "Гамбург", 100),
    ],
  },
  {
    id: "gb",
    name: "Великобритания",
    flag: "🇬🇧",
    cities: [
      baseCity("gb_london", "Лондон", 140),
      baseCity("gb_manchester", "Манчестер", 120),
      baseCity("gb_birmingham", "Бирмингем", 100),
    ],
  },
  {
    id: "fr",
    name: "Франция",
    flag: "🇫🇷",
    cities: [
      baseCity("fr_paris", "Париж", 140),
      baseCity("fr_lyon", "Лион", 120),
      baseCity("fr_marseille", "Марсель", 100),
    ],
  },
  {
    id: "jp",
    name: "Япония",
    flag: "🇯🇵",
    cities: [
      baseCity("jp_tokyo", "Токио", 140),
      baseCity("jp_osaka", "Осака", 120),
      baseCity("jp_yokohama", "Йокогама", 100),
    ],
  },
  {
    id: "in",
    name: "Индия",
    flag: "🇮🇳",
    cities: [
      baseCity("in_delhi", "Дели", 140),
      baseCity("in_mumbai", "Мумбаи", 120),
      baseCity("in_bangalore", "Бангалор", 100),
    ],
  },
  {
    id: "br",
    name: "Бразилия",
    flag: "🇧🇷",
    cities: [
      baseCity("br_brasilia", "Бразилиа", 140),
      baseCity("br_saopaulo", "Сан-Паулу", 120),
      baseCity("br_rio", "Рио-де-Жанейро", 100),
    ],
  },
  {
    id: "ca",
    name: "Канада",
    flag: "🇨🇦",
    cities: [
      baseCity("ca_ottawa", "Оттава", 140),
      baseCity("ca_toronto", "Торонто", 120),
      baseCity("ca_vancouver", "Ванкувер", 100),
    ],
  },
  {
    id: "au",
    name: "Австралия",
    flag: "🇦🇺",
    cities: [
      baseCity("au_canberra", "Канберра", 140),
      baseCity("au_sydney", "Сидней", 120),
      baseCity("au_melbourne", "Мельбурн", 100),
    ],
  },
  {
    id: "it",
    name: "Италия",
    flag: "🇮🇹",
    cities: [
      baseCity("it_rome", "Рим", 140),
      baseCity("it_milan", "Милан", 120),
      baseCity("it_naples", "Неаполь", 100),
    ],
  },
  {
    id: "es",
    name: "Испания",
    flag: "🇪🇸",
    cities: [
      baseCity("es_madrid", "Мадрид", 140),
      baseCity("es_barcelona", "Барселона", 120),
      baseCity("es_valencia", "Валенсия", 100),
    ],
  },
  {
    id: "mx",
    name: "Мексика",
    flag: "🇲🇽",
    cities: [
      baseCity("mx_mexicocity", "Мехико", 140),
      baseCity("mx_guadalajara", "Гвадалахара", 120),
      baseCity("mx_monterrey", "Монтеррей", 100),
    ],
  },
  {
    id: "kr",
    name: "Южная Корея",
    flag: "🇰🇷",
    cities: [
      baseCity("kr_seoul", "Сеул", 140),
      baseCity("kr_busan", "Пусан", 120),
      baseCity("kr_incheon", "Инчхон", 100),
    ],
  },
  {
    id: "kp",
    name: "Северная Корея",
    flag: "🇰🇵",
    cities: [
      baseCity("kp_pyongyang", "Пхеньян", 140),
      baseCity("kp_hamhung", "Хамхын", 120),
      baseCity("kp_chongjin", "Чхонджин", 100),
    ],
  },
  {
    id: "ua",
    name: "Украина",
    flag: "🇺🇦",
    cities: [
      baseCity("ua_kyiv", "Киев", 140),
      baseCity("ua_kharkiv", "Харьков", 120),
      baseCity("ua_odesa", "Одесса", 100),
    ],
  },
  {
    id: "pl",
    name: "Польша",
    flag: "🇵🇱",
    cities: [
      baseCity("pl_warsaw", "Варшава", 140),
      baseCity("pl_krakow", "Краков", 120),
      baseCity("pl_gdansk", "Гданьск", 100),
    ],
  },
  {
    id: "tr",
    name: "Турция",
    flag: "🇹🇷",
    cities: [
      baseCity("tr_ankara", "Анкара", 140),
      baseCity("tr_istanbul", "Стамбул", 120),
      baseCity("tr_izmir", "Измир", 100),
    ],
  },
  {
    id: "sa",
    name: "Саудовская Аравия",
    flag: "🇸🇦",
    cities: [
      baseCity("sa_riyadh", "Эр-Рияд", 140),
      baseCity("sa_jeddah", "Джидда", 120),
      baseCity("sa_dammam", "Даммам", 100),
    ],
  },
];

export const DEFAULT_PHASES = {
  discussionMs: 120000,
  decisionsMs: 300000,
  summaryMs: 15000,
};

export const ECONOMY_DEFAULTS = {
  startingMoney: 2000,
  nukeCost: 2000,
  nukeUnlockRound: 3,
  maxLifeLevel: 10,
};

export const GAME_LIMITS = {
  minTeams: 2,
  maxTeams: 10,
  minRounds: 1,
  maxRounds: 30,
  maxMessageLength: 500,
};
