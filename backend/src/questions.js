import { COUNTRY_TEMPLATES } from "./constants.js";
import { COUNTRY_FACTS } from "./questions-data.js";

export const QUESTION_COUNT = 100;

const unique = (items) => Array.from(new Set(items.filter(Boolean)));

const COUNTRY_IDS = COUNTRY_TEMPLATES.map((country) => country.id);
const DEFAULT_COUNTRY_ID = COUNTRY_IDS[0];

const allFacts = COUNTRY_IDS.map((id) => COUNTRY_FACTS[id]).filter(Boolean);

const GLOBAL = {
  cities: unique(allFacts.flatMap((fact) => fact.cities)),
  landmarks: unique(allFacts.flatMap((fact) => fact.landmarks)),
  rivers: unique(allFacts.flatMap((fact) => fact.rivers ?? [])),
  mountains: unique(allFacts.flatMap((fact) => fact.mountains ?? [])),
  seas: unique(allFacts.flatMap((fact) => fact.seas ?? [])),
  currencies: unique(allFacts.map((fact) => fact.currency)),
  languages: unique(allFacts.flatMap((fact) => fact.languages ?? [])),
  governments: unique(allFacts.map((fact) => fact.government)),
  capitals: unique(allFacts.map((fact) => fact.capital)),
  continents: unique(allFacts.map((fact) => fact.continent).filter(Boolean)),
  countryNames: unique([
    ...allFacts.map((fact) => fact.name),
    ...allFacts.flatMap((fact) => fact.neighbors ?? []),
  ]),
  leaders: unique(allFacts.flatMap((fact) => fact.leaders ?? [])),
  eventNames: unique(allFacts.flatMap((fact) => (fact.events ?? []).map((event) => event.event))),
  eventYears: unique(allFacts.flatMap((fact) => (fact.events ?? []).map((event) => String(event.year)))),
};

const TEMPLATES = {
  leader: [
    "Кто из этих правителей управлял {country}?",
    "Какой из этих лидеров связан с управлением {country}?",
  ],
  eventYear: [
    "В каком году в истории {country} произошло событие: {event}?",
    "Назовите год события «{event}» в истории {country}.",
  ],
  city: [
    "Какой из этих городов является крупным городом {country}?",
    "Выберите город, относящийся к {country}.",
  ],
  landmark: [
    "Какая из этих достопримечательностей находится в {country}?",
    "Что из перечисленного относится к достопримечательностям {country}?",
  ],
  capital: [
    "Столица {country} — это...",
    "Какой город является столицей {country}?",
  ],
  currency: [
    "Официальная валюта {country} — это...",
    "Какая валюта используется в {country}?",
  ],
  government: [
    "Какая форма правления у {country}?",
    "Тип государственного устройства {country} — это...",
  ],
  language: [
    "Какой язык является основным в {country}?",
    "Какой официальный язык относится к {country}?",
  ],
  largestCity: [
    "Какой город является крупнейшим в {country}?",
  ],
};

const hashString = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createRng = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffle = (items, rng) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const BOOL_OPTIONS = ["Верно", "Ложь"];


const pickWrong = (pool, exclude, rng) => {
  const deny = new Set(Array.isArray(exclude) ? exclude : [exclude]);
  const candidates = unique(pool).filter((item) => !deny.has(item));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
};

const fillTemplate = (template, data) =>
  template.replace(/\{(\w+)\}/g, (_, key) => String(data[key] ?? ""));

const buildOptions = (correct, wrongPool, fallbackPool, rng) => {
  const wrongCandidates = unique([...(wrongPool ?? []), ...(fallbackPool ?? [])]).filter(
    (item) => item !== correct
  );
  const picked = shuffle(wrongCandidates, rng).slice(0, 3);
  while (picked.length < 3 && wrongCandidates.length > 0) {
    picked.push(wrongCandidates[picked.length % wrongCandidates.length]);
  }
  const options = shuffle([String(correct), ...picked.map(String)], rng);
  return {
    options,
    correctIndex: options.indexOf(String(correct)),
  };
};

const banks = new Map();

const buildBank = (countryId) => {
  const facts = COUNTRY_FACTS[countryId] ?? COUNTRY_FACTS[DEFAULT_COUNTRY_ID];
  const rng = createRng(hashString(countryId));
  const seeds = [];

  const addSeed = (text, correct, wrongPool, fallbackPool) => {
    if (!text || !correct) {
      return;
    }
    seeds.push({
      text,
      correct: String(correct),
      wrongPool: wrongPool ?? [],
      fallbackPool: fallbackPool ?? [],
    });
  };

  const addBoolean = (text, isTrue) => {
    if (!text) return;
    seeds.push({
      text,
      kind: "boolean",
      correctIndex: isTrue ? 0 : 1,
    });
  };

  const countryName = facts.name;
  const cityWrong = GLOBAL.cities.filter((city) => !facts.cities.includes(city));
  const landmarkWrong = GLOBAL.landmarks.filter((landmark) => !facts.landmarks.includes(landmark));
  const leaderWrong = GLOBAL.leaders.filter((leader) => !(facts.leaders ?? []).includes(leader));
  const eventNameWrong = GLOBAL.eventNames.filter(
    (eventName) => !(facts.events ?? []).some((event) => event.event === eventName)
  );
  const eventYearWrong = GLOBAL.eventYears.filter(
    (year) => !(facts.events ?? []).some((event) => String(event.year) === year)
  );
  const capitalWrong = GLOBAL.capitals.filter((capital) => capital !== facts.capital);
  const currencyWrong = GLOBAL.currencies.filter((currency) => currency !== facts.currency);
  const governmentWrong = GLOBAL.governments.filter((gov) => gov !== facts.government);
  const languageWrong = GLOBAL.languages.filter((lang) => !(facts.languages ?? []).includes(lang));

  TEMPLATES.capital.forEach((template) =>
    addSeed(fillTemplate(template, { country: countryName }), facts.capital, capitalWrong, GLOBAL.capitals)
  );
  TEMPLATES.currency.forEach((template) =>
    addSeed(fillTemplate(template, { country: countryName }), facts.currency, currencyWrong, GLOBAL.currencies)
  );
  TEMPLATES.government.forEach((template) =>
    addSeed(fillTemplate(template, { country: countryName }), facts.government, governmentWrong, GLOBAL.governments)
  );
  (facts.languages ?? []).forEach((language) => {
    TEMPLATES.language.forEach((template) =>
      addSeed(fillTemplate(template, { country: countryName }), language, languageWrong, GLOBAL.languages)
    );
  });
  if (facts.largestCity) {
    TEMPLATES.largestCity.forEach((template) =>
      addSeed(fillTemplate(template, { country: countryName }), facts.largestCity, cityWrong, GLOBAL.cities)
    );
  }

  facts.cities.forEach((city) => {
    TEMPLATES.city.forEach((template) =>
      addSeed(fillTemplate(template, { country: countryName }), city, cityWrong, GLOBAL.cities)
    );
    addBoolean(`Правда ли, что город ${city} находится в ${countryName}?`, true);
    const wrongCity = pickWrong(GLOBAL.cities, facts.cities, rng);
    if (wrongCity) {
      addBoolean(`Правда ли, что город ${wrongCity} находится в ${countryName}?`, false);
    }
  });

  facts.landmarks.forEach((landmark) => {
    TEMPLATES.landmark.forEach((template) =>
      addSeed(fillTemplate(template, { country: countryName }), landmark, landmarkWrong, GLOBAL.landmarks)
    );
    addBoolean(`Правда ли, что ${landmark} находится в ${countryName}?`, true);
    const wrongLandmark = pickWrong(GLOBAL.landmarks, facts.landmarks, rng);
    if (wrongLandmark) {
      addBoolean(`Правда ли, что ${wrongLandmark} находится в ${countryName}?`, false);
    }
  });

  (facts.leaders ?? []).forEach((leader) => {
    TEMPLATES.leader.forEach((template) =>
      addSeed(fillTemplate(template, { country: countryName }), leader, leaderWrong, GLOBAL.leaders)
    );
    addBoolean(`Правда ли, что ${leader} был правителем ${countryName}?`, true);
    const wrongLeader = pickWrong(GLOBAL.leaders, facts.leaders, rng);
    if (wrongLeader) {
      addBoolean(`Правда ли, что ${wrongLeader} был правителем ${countryName}?`, false);
    }
  });

  (facts.events ?? []).forEach((event) => {
    TEMPLATES.eventYear.forEach((template) =>
      addSeed(
        fillTemplate(template, { event: event.event, country: countryName }),
        String(event.year),
        eventYearWrong,
        GLOBAL.eventYears
      )
    );
    addBoolean(
      `Верно ли, что в ${countryName} в ${event.year} произошло событие «${event.event}»?`,
      true
    );
    const wrongYear = pickWrong(GLOBAL.eventYears, String(event.year), rng);
    if (wrongYear) {
      addBoolean(
        `Верно ли, что в ${countryName} в ${wrongYear} произошло событие «${event.event}»?`,
        false
      );
    }
    const wrongEvent = pickWrong(eventNameWrong, event.event, rng);
    if (wrongEvent) {
      addBoolean(
        `Правда ли, что событие «${wrongEvent}» относится к истории ${countryName}?`,
        false
      );
    }
  });

  addBoolean(`Правда ли, что столицей ${countryName} является ${facts.capital}?`, true);
  const wrongCapital = pickWrong(GLOBAL.capitals, facts.capital, rng);
  if (wrongCapital) {
    addBoolean(`Правда ли, что столицей ${countryName} является ${wrongCapital}?`, false);
  }

  addBoolean(`Правда ли, что в ${countryName} используется валюта ${facts.currency}?`, true);
  const wrongCurrency = pickWrong(GLOBAL.currencies, facts.currency, rng);
  if (wrongCurrency) {
    addBoolean(`Правда ли, что в ${countryName} используется валюта ${wrongCurrency}?`, false);
  }

  if (facts.largestCity) {
    addBoolean(`Правда ли, что крупнейший город ${countryName} — ${facts.largestCity}?`, true);
    const wrongLargest = pickWrong(GLOBAL.cities, facts.largestCity, rng);
    if (wrongLargest) {
      addBoolean(`Правда ли, что крупнейший город ${countryName} — ${wrongLargest}?`, false);
    }
  }

  const toQuestion = (seed) => {
    if (seed.kind === "boolean") {
      return {
        text: seed.text,
        options: BOOL_OPTIONS,
        correctIndex: seed.correctIndex ?? 0,
      };
    }
    const { options, correctIndex } = buildOptions(seed.correct, seed.wrongPool, seed.fallbackPool, rng);
    return { text: seed.text, options, correctIndex };
  };

  let questions = seeds.map((seed) => toQuestion(seed));

  let seedIndex = 0;
  while (questions.length < QUESTION_COUNT && seeds.length > 0) {
    const seed = seeds[seedIndex % seeds.length];
    questions.push(toQuestion(seed));
    seedIndex += 1;
  }

  questions = shuffle(questions, rng).slice(0, QUESTION_COUNT);

  return questions.map((question, index) => ({
    id: `${countryId}-${index + 1}`,
    ...question,
  }));
};

export const getQuestionForCountry = (countryId, index) => {
  const safeCountryId = COUNTRY_FACTS[countryId] ? countryId : DEFAULT_COUNTRY_ID;
  if (!banks.has(safeCountryId)) {
    banks.set(safeCountryId, buildBank(safeCountryId));
  }
  const bank = banks.get(safeCountryId);
  if (!bank || bank.length === 0) {
    return {
      id: `${safeCountryId}-1`,
      text: "Вопрос недоступен.",
      options: ["—", "—", "—", "—"],
      correctIndex: 0,
    };
  }
  const safeIndex = ((index % QUESTION_COUNT) + QUESTION_COUNT) % QUESTION_COUNT;
  return bank[safeIndex] ?? bank[0];
};
