import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { DEFAULT_PHASES, ECONOMY_DEFAULTS } from "./constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: parseNumber(process.env.PORT, 4000),
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET || "dev_secret_change_me",
  dbPath:
    process.env.DB_PATH ||
    path.join(__dirname, "..", "data", "app.db"),
  phases: {
    discussionMs: parseNumber(process.env.DISCUSSION_MS, DEFAULT_PHASES.discussionMs),
    decisionsMs: parseNumber(process.env.DECISIONS_MS, DEFAULT_PHASES.decisionsMs),
    summaryMs: parseNumber(process.env.SUMMARY_MS, DEFAULT_PHASES.summaryMs),
  },
  economy: {
    startingMoney: parseNumber(process.env.START_MONEY, ECONOMY_DEFAULTS.startingMoney),
    nukeCost: parseNumber(process.env.NUKE_COST, ECONOMY_DEFAULTS.nukeCost),
    nukeUnlockRound: parseNumber(process.env.NUKE_UNLOCK_ROUND, ECONOMY_DEFAULTS.nukeUnlockRound),
    lifeDecay: parseNumber(process.env.LIFE_DECAY, ECONOMY_DEFAULTS.lifeDecay),
    quizReward: parseNumber(process.env.QUIZ_REWARD, ECONOMY_DEFAULTS.quizReward),
  },
  adminKey: process.env.ADMIN_KEY || "",
  email: {
    host: process.env.SMTP_HOST || "",
    port: parseNumber(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
    secure: process.env.SMTP_SECURE === "true",
  },
};
