import { config } from "./config.js";
import { ECONOMY_DEFAULTS } from "./constants.js";
import { calcLifeUpgradeCost, calcShieldCost, clamp } from "./utils.js";

const normalizeInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

export const normalizeDecision = (payload) => {
  const upgrades = Array.isArray(payload?.upgrades) ? payload.upgrades : [];
  const shields = Array.isArray(payload?.shields) ? payload.shields : [];
  const nukesToLaunch = Array.isArray(payload?.nukesToLaunch)
    ? payload.nukesToLaunch
    : [];

  return {
    upgrades: upgrades
      .map((item) => ({
        cityId: item?.cityId,
        levels: normalizeInt(item?.levels, 1),
      }))
      .filter((item) => item.cityId),
    shields: shields
      .map((item) => ({
        cityId: item?.cityId,
        count: normalizeInt(item?.count, 1),
      }))
      .filter((item) => item.cityId),
    nukesToBuild: normalizeInt(payload?.nukesToBuild, 0),
    nukesToLaunch: nukesToLaunch
      .map((item) => ({
        targetCountryId: item?.targetCountryId,
        targetCityId: item?.targetCityId,
        bombs: normalizeInt(item?.bombs, 1),
      }))
      .filter((item) => item.targetCountryId && item.targetCityId),
  };
};

export const calculateDecisionCost = (country, decision) => {
  let cost = 0;
  const errors = [];
  const maxLife = ECONOMY_DEFAULTS.maxLifeLevel;

  for (const upgrade of decision.upgrades) {
    const city = country.cities.find((item) => item.id === upgrade.cityId);
    if (!city) {
      errors.push(`CITY_NOT_FOUND:${upgrade.cityId}`);
      continue;
    }
    let level = city.lifeLevel;
    for (let i = 0; i < upgrade.levels; i += 1) {
      if (level >= maxLife) break;
      cost += calcLifeUpgradeCost({ ...city, lifeLevel: level });
      level += 1;
    }
  }

  for (const shield of decision.shields) {
    const city = country.cities.find((item) => item.id === shield.cityId);
    if (!city) {
      errors.push(`CITY_NOT_FOUND:${shield.cityId}`);
      continue;
    }
    cost += calcShieldCost(city) * shield.count;
  }

  cost += decision.nukesToBuild * config.economy.nukeCost;

  return { cost, errors };
};

export const validateDecision = ({
  country,
  decision,
  currentRound,
  money,
}) => {
  const errors = [];
  const maxLife = ECONOMY_DEFAULTS.maxLifeLevel;
  const { cost, errors: costErrors } = calculateDecisionCost(country, decision);
  errors.push(...costErrors);

  if (cost > money) {
    errors.push("INSUFFICIENT_FUNDS");
  }

  const totalBombs = decision.nukesToLaunch.reduce(
    (sum, item) => sum + item.bombs,
    0
  );

  if (decision.nukesToLaunch.length > 0 && currentRound < config.economy.nukeUnlockRound) {
    errors.push("NUKES_LOCKED");
  }

  if (totalBombs > country.nukesReady) {
    errors.push("NOT_ENOUGH_NUKES");
  }

  for (const upgrade of decision.upgrades) {
    const city = country.cities.find((item) => item.id === upgrade.cityId);
    if (!city) continue;
    const newLevel = clamp(city.lifeLevel + upgrade.levels, 0, maxLife);
    if (newLevel === city.lifeLevel && upgrade.levels > 0) {
      errors.push(`CITY_MAX_LEVEL:${city.id}`);
    }
  }

  return { cost, errors };
};

export const applyDecisionToCountry = ({
  country,
  decision,
  currentRound,
}) => {
  const maxLife = ECONOMY_DEFAULTS.maxLifeLevel;
  const nukesLaunched = [];

  for (const upgrade of decision.upgrades) {
    const city = country.cities.find((item) => item.id === upgrade.cityId);
    if (!city) continue;
    let remaining = upgrade.levels;
    while (remaining > 0 && city.lifeLevel < maxLife) {
      city.lifeLevel += 1;
      remaining -= 1;
    }
  }

  for (const shield of decision.shields) {
    const city = country.cities.find((item) => item.id === shield.cityId);
    if (!city) continue;
    city.shields += shield.count;
  }

  if (decision.nukesToBuild > 0) {
    country.nukesQueued += decision.nukesToBuild;
  }

  if (decision.nukesToLaunch.length > 0 && currentRound >= config.economy.nukeUnlockRound) {
    for (const launch of decision.nukesToLaunch) {
      if (launch.bombs <= 0) continue;
      const bombs = Math.min(launch.bombs, country.nukesReady);
      if (bombs <= 0) continue;
      country.nukesReady -= bombs;
      nukesLaunched.push({
        targetCountryId: launch.targetCountryId,
        targetCityId: launch.targetCityId,
        bombs,
      });
    }
  }

  return { nukesLaunched };
};
