import crypto from "crypto";
import { ECONOMY_DEFAULTS } from "./constants.js";

export const now = () => Date.now();

export const createLobbyId = () => {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
};

export const createInviteCode = () => {
  return crypto.randomBytes(4).toString("hex");
};

export const normalizeEmail = (email) => email.trim().toLowerCase();

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const calcCityIncome = (city) => {
  if (city.destroyed) return 0;
  return Math.max(0, city.baseIncome + city.lifeLevel * 6);
};

export const calcShieldCost = (city) => {
  return Math.round(calcCityIncome(city) * 1.6);
};

const LIFE_COST_TIERS = [
  { min: 0, max: 20, cost: 35 },
  { min: 20, max: 30, cost: 50 },
  { min: 30, max: 40, cost: 60 },
  { min: 40, max: 50, cost: 75 },
  { min: 50, max: 60, cost: 90 },
  { min: 60, max: 70, cost: 110 },
  { min: 70, max: 80, cost: 135 },
  { min: 80, max: 90, cost: 160 },
  { min: 90, max: 101, cost: 190 },
];

export const getLifeCostPerPercent = (level) => {
  const clamped = clamp(Math.floor(level), 0, 100);
  const tier = LIFE_COST_TIERS.find(
    (item) => clamped >= item.min && clamped < item.max
  );
  return tier ? tier.cost : LIFE_COST_TIERS[LIFE_COST_TIERS.length - 1].cost;
};

export const calcLifeUpgradeCost = (city) => {
  return getLifeCostPerPercent(city.lifeLevel);
};

export const calcLifeUpgradeCostRange = (fromLevel, toLevel) => {
  const from = clamp(Math.floor(fromLevel), 0, 100);
  const to = clamp(Math.floor(toLevel), 0, 100);
  if (to <= from) return 0;
  let cost = 0;
  for (let level = from; level < to; level += 1) {
    cost += getLifeCostPerPercent(level);
  }
  return cost;
};

export const averageLife = (cities) => {
  if (!cities.length) return 0;
  const total = cities.reduce((sum, city) => sum + city.lifeLevel, 0);
  return Number((total / cities.length).toFixed(2));
};

export const sanitizeMessage = (value, maxLen) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.slice(0, maxLen);
};

export const safeJsonParse = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

export const economyDefaults = {
  maxLifeLevel: ECONOMY_DEFAULTS.maxLifeLevel,
};
