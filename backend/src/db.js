import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { config } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve DB path: support both absolute and relative paths
const dbPath = path.isAbsolute(config.dbPath)
  ? config.dbPath
  : path.resolve(__dirname, "..", config.dbPath);

// Ensure the directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create all required tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT    UNIQUE NOT NULL,
    google_id       TEXT,
    nickname        TEXT    UNIQUE NOT NULL,
    password_hash   TEXT,
    avatar_emoji    TEXT    NOT NULL DEFAULT '🌍',
    about           TEXT,
    profile_header  TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        TEXT    NOT NULL DEFAULT 'pending',
    created_at    INTEGER NOT NULL,
    responded_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS support_tickets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject    TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    status     TEXT    NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friend_messages (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content           TEXT    NOT NULL,
    created_at        INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profile_comments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT    NOT NULL,
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS game_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lobby_id     TEXT    NOT NULL,
    country_id   TEXT    NOT NULL DEFAULT '',
    country_name TEXT    NOT NULL,
    score        INTEGER NOT NULL DEFAULT 0,
    result       TEXT    NOT NULL,
    created_at   INTEGER NOT NULL,
    UNIQUE(user_id, lobby_id)
  );

  CREATE TABLE IF NOT EXISTS lobbies (
    id                TEXT    PRIMARY KEY,
    name              TEXT    NOT NULL,
    host_user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash     TEXT,
    max_teams         INTEGER NOT NULL DEFAULT 6,
    total_rounds      INTEGER NOT NULL DEFAULT 5,
    status            TEXT    NOT NULL DEFAULT 'waiting',
    invite_code       TEXT    NOT NULL,
    friends_only      INTEGER NOT NULL DEFAULT 0,
    discussion_ms     INTEGER,
    decisions_ms      INTEGER,
    reveal_nukes      INTEGER NOT NULL DEFAULT 0,
    income_multiplier REAL    NOT NULL DEFAULT 1,
    nuke_unlock_round INTEGER NOT NULL DEFAULT 3,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lobby_players (
    lobby_id   TEXT    NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    country_id TEXT,
    ready      INTEGER NOT NULL DEFAULT 0,
    joined_at  INTEGER NOT NULL,
    PRIMARY KEY (lobby_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS round_decisions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    lobby_id       TEXT    NOT NULL,
    round_number   INTEGER NOT NULL,
    country_id     TEXT    NOT NULL,
    decisions_json TEXT    NOT NULL DEFAULT '{}',
    confirmed_at   INTEGER,
    updated_at     INTEGER NOT NULL,
    UNIQUE (lobby_id, round_number, country_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    lobby_id          TEXT    NOT NULL,
    type              TEXT    NOT NULL,
    sender_user_id    INTEGER,
    sender_country_id TEXT,
    target_country_id TEXT,
    negotiation_id    TEXT,
    round_number      INTEGER,
    content           TEXT    NOT NULL,
    created_at        INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS round_questions (
    id               TEXT    PRIMARY KEY,
    lobby_id         TEXT    NOT NULL,
    round_number     INTEGER NOT NULL,
    country_id       TEXT    NOT NULL,
    question_index   INTEGER NOT NULL,
    correct_index    INTEGER NOT NULL,
    assigned_at      INTEGER NOT NULL,
    answered_at      INTEGER,
    answered_correct INTEGER
  );

  CREATE TABLE IF NOT EXISTS negotiations (
    id           TEXT    PRIMARY KEY,
    lobby_id     TEXT    NOT NULL,
    country_a_id TEXT    NOT NULL,
    country_b_id TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'active',
    round_number INTEGER NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS nuke_attacks (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    lobby_id            TEXT    NOT NULL,
    round_number        INTEGER NOT NULL,
    attacker_country_id TEXT    NOT NULL,
    target_country_id   TEXT    NOT NULL,
    target_city_id      TEXT    NOT NULL,
    bombs               INTEGER NOT NULL DEFAULT 1,
    created_at          INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS game_state (
    lobby_id   TEXT    PRIMARY KEY,
    state_json TEXT    NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS email_verifications (
    email         TEXT    PRIMARY KEY,
    nickname      TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    avatar_emoji  TEXT    NOT NULL,
    code          TEXT    NOT NULL,
    expires_at    INTEGER NOT NULL,
    created_at    INTEGER NOT NULL
  );
`);
