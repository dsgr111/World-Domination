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
  return Math.max(0, city.baseIncome + city.lifeLevel * 40);
};

export const calcShieldCost = (city) => {
  return Math.round(calcCityIncome(city) * 2.5);
};

export const calcLifeUpgradeCost = (city) => {
  return Math.round(600 + city.lifeLevel * 120);
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
