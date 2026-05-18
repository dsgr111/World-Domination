export const AVATAR_EMOJIS = ["👑", "🏆", "⚔️", "🛡️", "🏰", "🎯", "⭐", "🔱"];

const baseCity = (id, name, baseIncome, lifeLevel = 45) => ({
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
      baseCity("ru_moscow", "Москва", 120),
      baseCity("ru_spb", "Санкт-Петербург", 105),
      baseCity("ru_novosibirsk", "Новосибирск", 90),
      baseCity("ru_ekaterinburg", "Екатеринбург", 75),
    ],
  },
  {
    id: "cn",
    name: "Китай",
    flag: "🇨🇳",
    cities: [
      baseCity("cn_beijing", "Пекин", 120),
      baseCity("cn_shanghai", "Шанхай", 105),
      baseCity("cn_shenzhen", "Шэньчжэнь", 90),
      baseCity("cn_guangzhou", "Гуанчжоу", 75),
    ],
  },
  {
    id: "us",
    name: "США",
    flag: "🇺🇸",
    cities: [
      baseCity("us_washington", "Вашингтон", 120),
      baseCity("us_newyork", "Нью-Йорк", 105),
      baseCity("us_losangeles", "Лос-Анджелес", 90),
      baseCity("us_chicago", "Чикаго", 75),
    ],
  },
  {
    id: "de",
    name: "Германия",
    flag: "🇩🇪",
    cities: [
      baseCity("de_berlin", "Берлин", 120),
      baseCity("de_munich", "Мюнхен", 105),
      baseCity("de_hamburg", "Гамбург", 90),
      baseCity("de_frankfurt", "Франкфурт", 75),
    ],
  },
  {
    id: "gb",
    name: "Великобритания",
    flag: "🇬🇧",
    cities: [
      baseCity("gb_london", "Лондон", 120),
      baseCity("gb_manchester", "Манчестер", 105),
      baseCity("gb_birmingham", "Бирмингем", 90),
      baseCity("gb_liverpool", "Ливерпуль", 75),
    ],
  },
  {
    id: "fr",
    name: "Франция",
    flag: "🇫🇷",
    cities: [
      baseCity("fr_paris", "Париж", 120),
      baseCity("fr_lyon", "Лион", 105),
      baseCity("fr_marseille", "Марсель", 90),
      baseCity("fr_nice", "Ницца", 75),
    ],
  },
  {
    id: "jp",
    name: "Япония",
    flag: "🇯🇵",
    cities: [
      baseCity("jp_tokyo", "Токио", 120),
      baseCity("jp_osaka", "Осака", 105),
      baseCity("jp_yokohama", "Йокогама", 90),
      baseCity("jp_nagoya", "Нагоя", 75),
    ],
  },
  {
    id: "in",
    name: "Индия",
    flag: "🇮🇳",
    cities: [
      baseCity("in_delhi", "Дели", 120),
      baseCity("in_mumbai", "Мумбаи", 105),
      baseCity("in_bangalore", "Бангалор", 90),
      baseCity("in_hyderabad", "Хайдарабад", 75),
    ],
  },
  {
    id: "br",
    name: "Бразилия",
    flag: "🇧🇷",
    cities: [
      baseCity("br_brasilia", "Бразилиа", 120),
      baseCity("br_saopaulo", "Сан-Паулу", 105),
      baseCity("br_rio", "Рио-де-Жанейро", 90),
      baseCity("br_salvador", "Салвадор", 75),
    ],
  },
  {
    id: "ca",
    name: "Канада",
    flag: "🇨🇦",
    cities: [
      baseCity("ca_ottawa", "Оттава", 120),
      baseCity("ca_toronto", "Торонто", 105),
      baseCity("ca_vancouver", "Ванкувер", 90),
      baseCity("ca_montreal", "Монреаль", 75),
    ],
  },
  {
    id: "au",
    name: "Австралия",
    flag: "🇦🇺",
    cities: [
      baseCity("au_canberra", "Канберра", 120),
      baseCity("au_sydney", "Сидней", 105),
      baseCity("au_melbourne", "Мельбурн", 90),
      baseCity("au_brisbane", "Брисбен", 75),
    ],
  },
  {
    id: "it",
    name: "Италия",
    flag: "🇮🇹",
    cities: [
      baseCity("it_rome", "Рим", 120),
      baseCity("it_milan", "Милан", 105),
      baseCity("it_naples", "Неаполь", 90),
      baseCity("it_turin", "Турин", 75),
    ],
  },
  {
    id: "es",
    name: "Испания",
    flag: "🇪🇸",
    cities: [
      baseCity("es_madrid", "Мадрид", 120),
      baseCity("es_barcelona", "Барселона", 105),
      baseCity("es_valencia", "Валенсия", 90),
      baseCity("es_seville", "Севилья", 75),
    ],
  },
  {
    id: "mx",
    name: "Мексика",
    flag: "🇲🇽",
    cities: [
      baseCity("mx_mexicocity", "Мехико", 120),
      baseCity("mx_guadalajara", "Гвадалахара", 105),
      baseCity("mx_monterrey", "Монтеррей", 90),
      baseCity("mx_puebla", "Пуэбла", 75),
    ],
  },
  {
    id: "kr",
    name: "Южная Корея",
    flag: "🇰🇷",
    cities: [
      baseCity("kr_seoul", "Сеул", 120),
      baseCity("kr_busan", "Пусан", 105),
      baseCity("kr_incheon", "Инчхон", 90),
      baseCity("kr_daegu", "Тэгу", 75),
    ],
  },
  {
    id: "kp",
    name: "Северная Корея",
    flag: "🇰🇵",
    cities: [
      baseCity("kp_pyongyang", "Пхеньян", 120),
      baseCity("kp_hamhung", "Хамхын", 105),
      baseCity("kp_chongjin", "Чхонджин", 90),
      baseCity("kp_nampo", "Нампхо", 75),
    ],
  },
  {
    id: "ua",
    name: "Украина",
    flag: "🇺🇦",
    cities: [
      baseCity("ua_kyiv", "Киев", 120),
      baseCity("ua_kharkiv", "Харьков", 105),
      baseCity("ua_odesa", "Одесса", 90),
      baseCity("ua_dnipro", "Днепр", 75),
    ],
  },
  {
    id: "pl",
    name: "Польша",
    flag: "🇵🇱",
    cities: [
      baseCity("pl_warsaw", "Варшава", 120),
      baseCity("pl_krakow", "Краков", 105),
      baseCity("pl_gdansk", "Гданьск", 90),
      baseCity("pl_poznan", "Познань", 75),
    ],
  },
  {
    id: "tr",
    name: "Турция",
    flag: "🇹🇷",
    cities: [
      baseCity("tr_ankara", "Анкара", 120),
      baseCity("tr_istanbul", "Стамбул", 105),
      baseCity("tr_izmir", "Измир", 90),
      baseCity("tr_bursa", "Бурса", 75),
    ],
  },
  {
    id: "sa",
    name: "Саудовская Аравия",
    flag: "🇸🇦",
    cities: [
      baseCity("sa_riyadh", "Эр-Рияд", 120),
      baseCity("sa_jeddah", "Джидда", 105),
      baseCity("sa_dammam", "Даммам", 90),
      baseCity("sa_makkah", "Мекка", 75),
    ],
  },
];

export const DEFAULT_PHASES = {
  discussionMs: 60000,
  decisionsMs: 180000,
  summaryMs: 15000,
};

export const ECONOMY_DEFAULTS = {
  startingMoney: 2000,
  nukeCost: 1200,
  nukeUnlockRound: 3,
  maxLifeLevel: 100,
  lifeDecay: 1,
  quizReward: 100,
};

export const GAME_LIMITS = {
  minTeams: 2,
  maxTeams: 20,
  minRounds: 1,
  maxRounds: 30,
  maxMessageLength: 500,
};
