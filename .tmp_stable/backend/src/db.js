import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { config } from "./config.js";

const dir = path.dirname(config.dbPath);
fs.mkdirSync(dir, { recursive: true });

export const db = new Database(config.dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL,
  addressee_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  responded_at INTEGER,
  UNIQUE (requester_id, addressee_id)
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE TABLE IF NOT EXISTS lobbies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host_user_id INTEGER NOT NULL,
  password_hash TEXT,
  max_teams INTEGER NOT NULL,
  total_rounds INTEGER NOT NULL,
  status TEXT NOT NULL,
  invite_code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lobby_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lobby_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  country_id TEXT,
  joined_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lobby_players_user
  ON lobby_players (user_id);

CREATE INDEX IF NOT EXISTS idx_lobby_players_lobby
  ON lobby_players (lobby_id);

CREATE TABLE IF NOT EXISTS game_state (
  lobby_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lobby_id TEXT NOT NULL,
  type TEXT NOT NULL,
  sender_user_id INTEGER NOT NULL,
  sender_country_id TEXT,
  target_country_id TEXT,
  negotiation_id TEXT,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_lobby
  ON messages (lobby_id);

CREATE TABLE IF NOT EXISTS negotiations (
  id TEXT PRIMARY KEY,
  lobby_id TEXT NOT NULL,
  country_a_id TEXT NOT NULL,
  country_b_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS round_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lobby_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  country_id TEXT NOT NULL,
  decisions_json TEXT NOT NULL,
  confirmed_at INTEGER,
  updated_at INTEGER NOT NULL,
  UNIQUE (lobby_id, round_number, country_id)
);

CREATE TABLE IF NOT EXISTS nuke_attacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lobby_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  attacker_country_id TEXT NOT NULL,
  target_country_id TEXT NOT NULL,
  target_city_id TEXT NOT NULL,
  bombs INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`);
