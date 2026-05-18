import { config } from "./config.js";
import { ECONOMY_DEFAULTS } from "./constants.js";
import { calcLifeUpgradeCostRange, calcShieldCost, clamp } from "./utils.js";

const normalizeInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

export const normalizeDecision = (payload) => {
  const lifeTargets = Array.isArray(payload?.lifeTargets) ? payload.lifeTargets : [];
  const shields = Array.isArray(payload?.shields) ? payload.shields : [];
  const nukesToLaunch = Array.isArray(payload?.nukesToLaunch)
    ? payload.nukesToLaunch
    : [];
  const transfers = Array.isArray(payload?.transfers) ? payload.transfers : [];

  return {
    lifeTargets: lifeTargets
      .map((item) => ({
        cityId: item?.cityId,
        targetLevel: normalizeInt(item?.targetLevel, 0),
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
    transfers: transfers
      .map((item) => ({
        targetCountryId: item?.targetCountryId,
        amount: normalizeInt(item?.amount, 0),
      }))
      .filter((item) => item.targetCountryId && item.amount > 0),
    sanctionTargetIds: Array.isArray(payload?.sanctionTargetIds)
      ? [...new Set(payload.sanctionTargetIds.filter((item) => typeof item === "string" && item))]
      : [],
  };
};

export const calculateDecisionCost = (country, decision) => {
  let cost = 0;
  const errors = [];
  const maxLife = ECONOMY_DEFAULTS.maxLifeLevel;
  const eliminated = country.cities.every((city) => city.destroyed);

  for (const target of decision.lifeTargets) {
    const city = country.cities.find((item) => item.id === target.cityId);
    if (!city) {
      errors.push(`CITY_NOT_FOUND:${target.cityId}`);
      continue;
    }
    if (city.destroyed) {
      errors.push(`CITY_DESTROYED:${target.cityId}`);
      continue;
    }
    const targetLevel = clamp(target.targetLevel, 0, maxLife);
    cost += calcLifeUpgradeCostRange(city.lifeLevel, targetLevel);
  }

  for (const shield of decision.shields) {
    const city = country.cities.find((item) => item.id === shield.cityId);
    if (!city) {
      errors.push(`CITY_NOT_FOUND:${shield.cityId}`);
      continue;
    }
    if (city.destroyed) {
      errors.push(`CITY_DESTROYED:${shield.cityId}`);
      continue;
    }
    cost += calcShieldCost(city) * shield.count;
  }

  if (!eliminated) {
    cost += decision.nukesToBuild * config.economy.nukeCost;
    cost += decision.transfers.reduce((sum, item) => sum + item.amount, 0);
  }

  return { cost, errors };
};

export const validateDecision = ({
  country,
  decision,
  currentRound,
  money,
  allCountries = [],
  nukeUnlockRound = config.economy.nukeUnlockRound,
  sanctionHistory = [],
}) => {
  const errors = [];
  const maxLife = ECONOMY_DEFAULTS.maxLifeLevel;
  const eliminated = country.cities.every((city) => city.destroyed);
  const { cost, errors: costErrors } = calculateDecisionCost(country, decision);
  errors.push(...costErrors);

  if (cost > money) {
    errors.push("INSUFFICIENT_FUNDS");
  }

  if (eliminated) {
    if (decision.lifeTargets.length > 0 || decision.shields.length > 0 || decision.nukesToBuild > 0) {
      errors.push("COUNTRY_ELIMINATED");
    }
  }

  const totalBombs = decision.nukesToLaunch.reduce(
    (sum, item) => sum + item.bombs,
    0
  );

  if (decision.nukesToLaunch.length > 0 && currentRound < nukeUnlockRound) {
    errors.push("NUKES_LOCKED");
  }

  if (totalBombs > country.nukesReady) {
    errors.push("NOT_ENOUGH_NUKES");
  }

  if (decision.nukesToLaunch.length > 0 && allCountries.length > 0) {
    for (const launch of decision.nukesToLaunch) {
      const targetCountry = allCountries.find(
        (item) => item.id === launch.targetCountryId
      );
      if (!targetCountry) {
        errors.push(`TARGET_COUNTRY_NOT_FOUND:${launch.targetCountryId}`);
        continue;
      }
      const targetEliminated = targetCountry.cities.every(
        (city) => city.destroyed || city.lifeLevel <= 0
      );
      if (targetEliminated) {
        errors.push(`TARGET_COUNTRY_DESTROYED:${launch.targetCountryId}`);
        continue;
      }
      const targetCity = targetCountry.cities.find(
        (item) => item.id === launch.targetCityId
      );
      if (!targetCity) {
        errors.push(`TARGET_CITY_NOT_FOUND:${launch.targetCityId}`);
        continue;
      }
      if (targetCity.destroyed || targetCity.lifeLevel <= 0) {
        errors.push(`TARGET_CITY_DESTROYED:${launch.targetCityId}`);
      }
    }
  }

  for (const target of decision.lifeTargets) {
    const city = country.cities.find((item) => item.id === target.cityId);
    if (!city) continue;
    const newLevel = clamp(target.targetLevel, 0, maxLife);
    if (newLevel > maxLife) {
      errors.push(`CITY_MAX_LEVEL:${city.id}`);
    }
  }

  for (const transfer of decision.transfers) {
    if (eliminated) {
      errors.push("COUNTRY_ELIMINATED");
      break;
    }
    if (transfer.amount <= 0) {
      errors.push("TRANSFER_AMOUNT_INVALID");
      continue;
    }
    if (transfer.targetCountryId === country.id) {
      errors.push("TRANSFER_SELF");
      continue;
    }
    if (allCountries.length > 0) {
      const target = allCountries.find((item) => item.id === transfer.targetCountryId);
      if (!target) {
        errors.push(`TRANSFER_TARGET_NOT_FOUND:${transfer.targetCountryId}`);
      }
    }
  }

  for (const sanctionTargetId of decision.sanctionTargetIds || []) {
    if (sanctionTargetId === country.id) {
      errors.push("SANCTION_SELF");
    } else if (allCountries.length > 0) {
      const target = allCountries.find((item) => item.id === sanctionTargetId);
      if (!target) {
        errors.push(`SANCTION_TARGET_NOT_FOUND:${sanctionTargetId}`);
      } else {
        const targetEliminated = target.cities.every(
          (city) => city.destroyed || city.lifeLevel <= 0
        );
        if (targetEliminated) {
          errors.push(`SANCTION_TARGET_DESTROYED:${sanctionTargetId}`);
        }
      }
    }
    const alreadySanctioned = sanctionHistory.some(
      (item) =>
        item?.fromCountryId === country.id &&
        item?.toCountryId === sanctionTargetId
    );
    if (alreadySanctioned) {
      errors.push("SANCTION_ALREADY_USED");
    }
  }

  return { cost, errors };
};

export const applyDecisionToCountry = ({
  country,
  decision,
  currentRound,
  nukeUnlockRound = config.economy.nukeUnlockRound,
}) => {
  const maxLife = ECONOMY_DEFAULTS.maxLifeLevel;
  const nukesLaunched = [];
  let improvedLife = false;
  const eliminated = country.cities.every((city) => city.destroyed);

  if (!eliminated) {
    for (const target of decision.lifeTargets) {
      const city = country.cities.find((item) => item.id === target.cityId);
      if (!city || city.destroyed) continue;
      const newLevel = clamp(target.targetLevel, 0, maxLife);
      if (newLevel > city.lifeLevel) {
        improvedLife = true;
        city.lifeLevel = newLevel;
      }
    }

    for (const shield of decision.shields) {
      const city = country.cities.find((item) => item.id === shield.cityId);
      if (!city || city.destroyed) continue;
      city.shields += shield.count;
    }

    if (decision.nukesToBuild > 0) {
      country.nukesQueued += decision.nukesToBuild;
    }
  }

  if (decision.nukesToLaunch.length > 0 && currentRound >= nukeUnlockRound) {
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

  return {
    nukesLaunched,
    improvedLife,
    sanctionTargetIds: decision.sanctionTargetIds || [],
  };
};
