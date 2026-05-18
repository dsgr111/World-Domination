import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { Server as SocketIOServer } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { db } from "./db.js";
import { config } from "./config.js";
import { AVATAR_EMOJIS, COUNTRY_TEMPLATES, GAME_LIMITS } from "./constants.js";
import {
  authMiddleware,
  signToken,
  hashPassword,
  verifyPassword,
  getUserById,
} from "./auth.js";
import { GameEngine } from "./gameEngine.js";
import {
  now,
  createInviteCode,
  createLobbyId,
  normalizeEmail,
  sanitizeMessage,
} from "./utils.js";
import { normalizeDecision, validateDecision } from "./decisions.js";
import { getQuestionForCountry, QUESTION_COUNT } from "./questions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

// ── Serve built React frontend in production ──────────────────────────────────
const PUBLIC_DIR = path.join(__dirname, "..", "public");
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
}

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: true, credentials: true },
});

const engine = new GameEngine({ io });
const lobbyCountdowns = new Map();
const SITE_LOBBY_ID = "__site__";
const QUIZ_DURATION_MS = 15000;
const INVITE_PREFIX = "INVITE::";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;

const stmt = {
  getUserByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  getUserByNickname: db.prepare("SELECT * FROM users WHERE nickname = ?"),
  insertUser: db.prepare(
    "INSERT INTO users (email, google_id, nickname, password_hash, avatar_emoji, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),
  updateUser: db.prepare(
    "UPDATE users SET email = ?, nickname = ?, about = ?, profile_header = ?, avatar_emoji = ?, password_hash = ?, updated_at = ? WHERE id = ?"
  ),
  updateUserNoPassword: db.prepare(
    "UPDATE users SET email = ?, nickname = ?, about = ?, profile_header = ?, avatar_emoji = ?, updated_at = ? WHERE id = ?"
  ),

  listFriendRequests: db.prepare(
    "SELECT fr.id, fr.status, fr.created_at, fr.requester_id, fr.addressee_id, u.nickname, u.avatar_emoji " +
      "FROM friend_requests fr " +
      "JOIN users u ON u.id = fr.requester_id " +
      "WHERE fr.addressee_id = ? AND fr.status = 'pending'"
  ),
  listOutgoingRequests: db.prepare(
    "SELECT fr.id, fr.status, fr.created_at, fr.requester_id, fr.addressee_id, u.nickname, u.avatar_emoji " +
      "FROM friend_requests fr " +
      "JOIN users u ON u.id = fr.addressee_id " +
      "WHERE fr.requester_id = ? AND fr.status = 'pending'"
  ),
  listFriends: db.prepare(
    "SELECT fr.id, u.id as user_id, u.nickname, u.avatar_emoji " +
      "FROM friend_requests fr " +
      "JOIN users u ON u.id = CASE WHEN fr.requester_id = ? THEN fr.addressee_id ELSE fr.requester_id END " +
      "WHERE (fr.requester_id = ? OR fr.addressee_id = ?) AND fr.status = 'accepted'"
  ),
  areFriends: db.prepare(
    "SELECT 1 FROM friend_requests WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)) AND status = 'accepted' LIMIT 1"
  ),
  deleteFriendRelation: db.prepare(
    "DELETE FROM friend_requests WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)) AND status = 'accepted'"
  ),
  getFriendRequest: db.prepare(
    "SELECT * FROM friend_requests WHERE id = ?"
  ),
  insertFriendRequest: db.prepare(
    "INSERT INTO friend_requests (requester_id, addressee_id, status, created_at) VALUES (?, ?, 'pending', ?)"
  ),
  updateFriendRequestStatus: db.prepare(
    "UPDATE friend_requests SET status = ?, responded_at = ? WHERE id = ?"
  ),
  getPendingFriendRequestBetween: db.prepare(
    "SELECT id FROM friend_requests WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)) AND status = 'pending' LIMIT 1"
  ),

  insertSupportTicket: db.prepare(
    "INSERT INTO support_tickets (user_id, subject, message, status, created_at) VALUES (?, ?, ?, 'open', ?)"
  ),
  listSupportTickets: db.prepare(
    "SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC"
  ),

  listFriendMessages: db.prepare(
    "SELECT * FROM friend_messages WHERE ((sender_user_id = ? AND recipient_user_id = ?) OR (sender_user_id = ? AND recipient_user_id = ?)) AND created_at >= ? ORDER BY created_at ASC LIMIT 200"
  ),
  deleteOldFriendMessages: db.prepare(
    "DELETE FROM friend_messages WHERE created_at < ?"
  ),
  insertFriendMessage: db.prepare(
    "INSERT INTO friend_messages (sender_user_id, recipient_user_id, content, created_at) VALUES (?, ?, ?, ?)"
  ),
  listProfileComments: db.prepare(
    "SELECT pc.id, pc.profile_user_id, pc.author_user_id, pc.content, pc.created_at, u.nickname as author_nickname, u.avatar_emoji as author_avatar " +
      "FROM profile_comments pc " +
      "JOIN users u ON u.id = pc.author_user_id " +
      "WHERE pc.profile_user_id = ? " +
      "ORDER BY pc.created_at DESC LIMIT 100"
  ),
  insertProfileComment: db.prepare(
    "INSERT INTO profile_comments (profile_user_id, author_user_id, content, created_at) VALUES (?, ?, ?, ?)"
  ),
  getProfileComment: db.prepare(
    "SELECT * FROM profile_comments WHERE id = ?"
  ),
  deleteProfileComment: db.prepare(
    "DELETE FROM profile_comments WHERE id = ?"
  ),
  listGameHistoryByUser: db.prepare(
    "SELECT lobby_id, country_name, score, result, created_at FROM game_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
  ),
  getGameStatsByUser: db.prepare(
    "SELECT COUNT(*) as games, SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins, SUM(score) as total_score FROM game_history WHERE user_id = ?"
  ),

  insertLobby: db.prepare(
    "INSERT INTO lobbies (id, name, host_user_id, password_hash, max_teams, total_rounds, status, invite_code, friends_only, discussion_ms, decisions_ms, reveal_nukes, income_multiplier, nuke_unlock_round, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ),
  updateLobby: db.prepare(
    "UPDATE lobbies SET name = ?, max_teams = ?, total_rounds = ?, updated_at = ? WHERE id = ?"
  ),
  deleteLobby: db.prepare("DELETE FROM lobbies WHERE id = ?"),
  getLobbyById: db.prepare("SELECT * FROM lobbies WHERE id = ?"),
  listLobbies: db.prepare(
    "SELECT l.*, (SELECT COUNT(*) FROM lobby_players lp WHERE lp.lobby_id = l.id) as player_count FROM lobbies l WHERE l.status = 'waiting' ORDER BY l.created_at DESC"
  ),
  listAllLobbies: db.prepare(
    "SELECT l.*, (SELECT COUNT(*) FROM lobby_players lp WHERE lp.lobby_id = l.id) as player_count FROM lobbies l ORDER BY l.created_at DESC"
  ),
  insertLobbyPlayer: db.prepare(
    "INSERT INTO lobby_players (lobby_id, user_id, country_id, joined_at) VALUES (?, ?, ?, ?)"
  ),
  removeLobbyPlayer: db.prepare(
    "DELETE FROM lobby_players WHERE lobby_id = ? AND user_id = ?"
  ),
  clearLobbyPlayers: db.prepare(
    "DELETE FROM lobby_players WHERE lobby_id = ?"
  ),
  updateLobbyHost: db.prepare(
    "UPDATE lobbies SET host_user_id = ?, updated_at = ? WHERE id = ?"
  ),
  getUserLobby: db.prepare(
    "SELECT lobby_id FROM lobby_players WHERE user_id = ?"
  ),
  listLobbyPlayers: db.prepare(
    "SELECT lp.user_id, lp.country_id, lp.ready, u.nickname, u.avatar_emoji FROM lobby_players lp JOIN users u ON u.id = lp.user_id WHERE lp.lobby_id = ?"
  ),
  listLobbyPlayersFull: db.prepare(
    "SELECT lp.user_id, lp.country_id, lp.ready, u.nickname, u.avatar_emoji, u.email FROM lobby_players lp JOIN users u ON u.id = lp.user_id WHERE lp.lobby_id = ?"
  ),
  updatePlayerReady: db.prepare(
    "UPDATE lobby_players SET ready = ? WHERE lobby_id = ? AND user_id = ?"
  ),
  getLobbyPlayer: db.prepare(
    "SELECT * FROM lobby_players WHERE lobby_id = ? AND user_id = ?"
  ),
  updatePlayerCountry: db.prepare(
    "UPDATE lobby_players SET country_id = ? WHERE lobby_id = ? AND user_id = ?"
  ),
  checkCountryTaken: db.prepare(
    "SELECT 1 FROM lobby_players WHERE lobby_id = ? AND country_id = ?"
  ),

  upsertDecision: db.prepare(
    "INSERT INTO round_decisions (lobby_id, round_number, country_id, decisions_json, confirmed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(lobby_id, round_number, country_id) DO UPDATE SET decisions_json = excluded.decisions_json, confirmed_at = excluded.confirmed_at, updated_at = excluded.updated_at"
  ),

  insertMessage: db.prepare(
    "INSERT INTO messages (lobby_id, type, sender_user_id, sender_country_id, target_country_id, negotiation_id, round_number, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ),
  listMessages: db.prepare(
    "SELECT * FROM messages WHERE lobby_id = ? AND type = ? ORDER BY created_at DESC LIMIT 100"
  ),
  listNegotiationMessages: db.prepare(
    "SELECT * FROM messages WHERE lobby_id = ? AND type = 'negotiation' AND negotiation_id = ? ORDER BY created_at DESC LIMIT 200"
  ),
  listPrivateMessages: db.prepare(
    "SELECT * FROM messages WHERE lobby_id = ? AND type = 'private' " +
      "AND ((sender_country_id = ? AND target_country_id = ?) OR (sender_country_id = ? AND target_country_id = ?)) " +
      "AND created_at >= ? " +
      "ORDER BY created_at DESC LIMIT 100"
  ),
  deleteOldPrivateMessages: db.prepare(
    "DELETE FROM messages WHERE type = 'private' AND created_at < ?"
  ),

  getRoundQuestion: db.prepare(
    "SELECT * FROM round_questions WHERE lobby_id = ? AND round_number = ? AND country_id = ?"
  ),
  getRoundQuestionById: db.prepare(
    "SELECT * FROM round_questions WHERE id = ?"
  ),
  insertRoundQuestion: db.prepare(
    "INSERT INTO round_questions (id, lobby_id, round_number, country_id, question_index, correct_index, assigned_at, answered_at, answered_correct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ),
  answerRoundQuestion: db.prepare(
    "UPDATE round_questions SET answered_at = ?, answered_correct = ? WHERE id = ?"
  ),
  listSiteMessages: db.prepare(
    "SELECT m.*, u.nickname, u.avatar_emoji FROM messages m " +
      "JOIN users u ON u.id = m.sender_user_id " +
      "WHERE m.lobby_id = ? AND m.type IN ('site','global') " +
      "ORDER BY m.created_at DESC LIMIT 100"
  ),

  listReadyCountries: db.prepare(
    "SELECT country_id FROM round_decisions WHERE lobby_id = ? AND round_number = ? AND confirmed_at IS NOT NULL"
  ),
  clearDecisionConfirm: db.prepare(
    "UPDATE round_decisions SET confirmed_at = NULL, updated_at = ? WHERE lobby_id = ? AND round_number = ? AND country_id = ?"
  ),

  insertNegotiation: db.prepare(
    "INSERT INTO negotiations (id, lobby_id, country_a_id, country_b_id, status, round_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ),
  getNegotiationForRoundBetween: db.prepare(
    "SELECT * FROM negotiations WHERE lobby_id = ? AND round_number = ? AND ((country_a_id = ? AND country_b_id = ?) OR (country_a_id = ? AND country_b_id = ?)) LIMIT 1"
  ),
  updateNegotiation: db.prepare(
    "UPDATE negotiations SET status = ?, updated_at = ? WHERE id = ?"
  ),
  getNegotiation: db.prepare("SELECT * FROM negotiations WHERE id = ?"),
  listNegotiationsByCountry: db.prepare(
    "SELECT * FROM negotiations WHERE lobby_id = ? AND (country_a_id = ? OR country_b_id = ?)"
  ),
  deleteMessagesByLobby: db.prepare("DELETE FROM messages WHERE lobby_id = ?"),
  deleteNegotiationsByLobby: db.prepare("DELETE FROM negotiations WHERE lobby_id = ?"),
  deleteRoundDecisionsByLobby: db.prepare("DELETE FROM round_decisions WHERE lobby_id = ?"),
  deleteRoundQuestionsByLobby: db.prepare("DELETE FROM round_questions WHERE lobby_id = ?"),
  deleteNukeAttacksByLobby: db.prepare("DELETE FROM nuke_attacks WHERE lobby_id = ?"),
  deleteGameStateByLobby: db.prepare("DELETE FROM game_state WHERE lobby_id = ?"),
  getEmailVerification: db.prepare("SELECT * FROM email_verifications WHERE email = ?"),
  upsertEmailVerification: db.prepare(
    "INSERT INTO email_verifications (email, nickname, password_hash, avatar_emoji, code, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(email) DO UPDATE SET nickname = excluded.nickname, password_hash = excluded.password_hash, avatar_emoji = excluded.avatar_emoji, code = excluded.code, expires_at = excluded.expires_at, created_at = excluded.created_at"
  ),
  deleteEmailVerification: db.prepare("DELETE FROM email_verifications WHERE email = ?"),
  deleteExpiredEmailVerifications: db.prepare("DELETE FROM email_verifications WHERE expires_at < ?"),
};

const getLobbyPlayerCountry = (lobbyId, userId) => {
  const row = db
    .prepare("SELECT country_id FROM lobby_players WHERE lobby_id = ? AND user_id = ?")
    .get(lobbyId, userId);
  return row?.country_id || null;
};

const getCountryLeader = (lobbyId, countryId) => {
  const row = db
    .prepare("SELECT user_id FROM lobby_players WHERE lobby_id = ? AND country_id = ?")
    .get(lobbyId, countryId);
  return row?.user_id || null;
};

const areFriends = (userId, otherId) => {
  const row = stmt.areFriends.get(userId, otherId, otherId, userId);
  return Boolean(row);
};

const isUserInActiveGame = (userId) => {
  const lobbyRow = stmt.getUserLobby.get(userId);
  if (!lobbyRow) return false;
  const lobby = stmt.getLobbyById.get(lobbyRow.lobby_id);
  return Boolean(lobby && lobby.status === "in_progress");
};

const getReadyCountries = (lobbyId, roundNumber) => {
  return stmt.listReadyCountries
    .all(lobbyId, roundNumber)
    .map((row) => row.country_id);
};

const resolveUserFromToken = (token) => {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return getUserById(payload.sub) || null;
  } catch {
    return null;
  }
};

const parseBeaconToken = (rawBody) => {
  if (!rawBody || typeof rawBody !== "string") return null;
  const trimmed = rawBody.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.token === "string") {
        return parsed.token;
      }
    } catch {
      return null;
    }
  }
  if (trimmed.startsWith("token=")) {
    return decodeURIComponent(trimmed.slice(6));
  }
  return trimmed;
};

const buildLobbyDetail = (lobbyId) => {
  const lobby = stmt.getLobbyById.get(lobbyId);
  if (!lobby) return null;
  const players = stmt.listLobbyPlayers.all(lobbyId);
  const countdown = lobbyCountdowns.get(lobbyId);
  return {
    id: lobby.id,
    name: lobby.name,
    status: lobby.status,
    maxTeams: lobby.max_teams,
    totalRounds: lobby.total_rounds,
    hostUserId: lobby.host_user_id,
    inviteCode: lobby.invite_code,
    inviteLink: buildInviteLink(lobby.id, lobby.invite_code),
    friendsOnly: Boolean(lobby.friends_only),
    countdownEndsAt: countdown?.endsAt || null,
    settings: {
      discussionMs: lobby.discussion_ms ?? config.phases.discussionMs,
      decisionsMs: lobby.decisions_ms ?? config.phases.decisionsMs,
      revealNukes: Boolean(lobby.reveal_nukes),
      incomeMultiplier:
        lobby.income_multiplier !== null && lobby.income_multiplier !== undefined
          ? Number(lobby.income_multiplier)
          : 1,
      nukeUnlockRound:
        lobby.nuke_unlock_round ?? config.economy.nukeUnlockRound,
    },
    players,
  };
};

const emailTransport =
  config.email.host && config.email.user && config.email.pass && config.email.from
    ? nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: {
          user: config.email.user,
          pass: config.email.pass,
        },
      })
    : null;

const generateEmailCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const sendVerificationCodeEmail = async (email, code) => {
  if (!emailTransport) {
    throw new Error("EMAIL_NOT_CONFIGURED");
  }
  await emailTransport.sendMail({
    from: config.email.from,
    to: email,
    subject: "Код подтверждения Мировое Господство",
    text: `Ваш код подтверждения: ${code}. Код действует 10 минут.`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#0f1722;padding:24px;color:#ffffff">
        <h2 style="margin:0 0 16px">Мировое Господство</h2>
        <p style="margin:0 0 12px">Введите этот код для подтверждения почты:</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0">${code}</div>
        <p style="margin:0;color:#9fb0c3">Код действует 10 минут.</p>
      </div>
    `,
  });
};

const emitLobbyUpdate = (lobbyId) => {
  const lobby = buildLobbyDetail(lobbyId);
  if (lobby) {
    io.to(`lobby:${lobbyId}`).emit("lobby:update", { lobby });
  }
  return lobby;
};

const cancelLobbyCountdown = (lobbyId) => {
  const current = lobbyCountdowns.get(lobbyId);
  if (!current) return;
  clearTimeout(current.timer);
  lobbyCountdowns.delete(lobbyId);
  io.to(`lobby:${lobbyId}`).emit("lobby:countdown", { endsAt: null });
};

const startLobbyCountdown = (lobbyId) => {
  if (lobbyCountdowns.has(lobbyId)) return;
  const endsAt = now() + 5000;
  const timer = setTimeout(() => {
    lobbyCountdowns.delete(lobbyId);
    const lobby = stmt.getLobbyById.get(lobbyId);
    if (!lobby || lobby.status !== "waiting") {
      return;
    }
    const players = stmt.listLobbyPlayers.all(lobbyId);
    if (players.length !== lobby.max_teams) {
      io.to(`lobby:${lobbyId}`).emit("lobby:countdown", { endsAt: null });
      return;
    }
    const allReady =
      players.length >= 2 &&
      players.every((player) => player.ready && player.country_id);
    if (!allReady) {
      io.to(`lobby:${lobbyId}`).emit("lobby:countdown", { endsAt: null });
      return;
    }
    try {
      engine.startGame(lobbyId);
    } catch (error) {
      io.to(`lobby:${lobbyId}`).emit("lobby:countdown", { endsAt: null });
    }
  }, 5000);
  lobbyCountdowns.set(lobbyId, { endsAt, timer });
  io.to(`lobby:${lobbyId}`).emit("lobby:countdown", { endsAt });
};

const evaluateLobbyCountdown = (lobbyId) => {
  const lobby = stmt.getLobbyById.get(lobbyId);
  if (!lobby || lobby.status !== "waiting") {
    cancelLobbyCountdown(lobbyId);
    return;
  }
  const players = stmt.listLobbyPlayers.all(lobbyId);
  if (players.length < 2) {
    cancelLobbyCountdown(lobbyId);
    return;
  }
  if (players.length !== lobby.max_teams) {
    cancelLobbyCountdown(lobbyId);
    return;
  }
  const allReady = players.every((player) => player.ready && player.country_id);
  if (allReady) {
    startLobbyCountdown(lobbyId);
  } else {
    cancelLobbyCountdown(lobbyId);
  }
};

const adminMiddleware = (req, res, next) => {
  if (!config.adminKey) {
    return res.status(403).json({ error: "ADMIN_DISABLED" });
  }
  const key = req.headers["x-admin-key"];
  if (!key || key !== config.adminKey) {
    return res.status(401).json({ error: "ADMIN_UNAUTHORIZED" });
  }
  return next();
};

const listDbTables = () => {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map((row) => row.name);
};

const ensureTableName = (name) => {
  const tables = listDbTables();
  return tables.includes(name) ? name : null;
};

const leaveLobbyForUser = (userId) => {
  const lobbyRow = stmt.getUserLobby.get(userId);
  if (!lobbyRow) {
    return { status: 404, error: "NOT_IN_LOBBY" };
  }
  const lobby = stmt.getLobbyById.get(lobbyRow.lobby_id);
  if (!lobby) {
    return { status: 404, error: "LOBBY_NOT_FOUND" };
  }
  stmt.removeLobbyPlayer.run(lobby.id, userId);
  const remaining = stmt.listLobbyPlayers.all(lobby.id);
  if (lobby.status === "waiting") {
    if (remaining.length === 0) {
      stmt.deleteLobby.run(lobby.id);
    } else if (lobby.host_user_id === userId) {
      stmt.updateLobbyHost.run(remaining[0].user_id, now(), lobby.id);
    }
    emitLobbyUpdate(lobby.id);
    evaluateLobbyCountdown(lobby.id);
  } else if (lobby.status === "in_progress") {
    if (remaining.length <= 1) {
      engine.forceFinish(lobby.id);
    }
  }
  return { status: 200, lobbyId: lobby.id, remainingCount: remaining.length };
};

const isValidAvatarEmoji = (value) => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return Array.from(trimmed).length <= 8;
};

const buildInviteLink = (lobbyId, inviteCode) => {
  return `${config.appBaseUrl.replace(/\/$/, "")}/lobby?join=${lobbyId}&code=${inviteCode}`;
};

const buildLobbyInviteContent = (lobby, inviter) => {
  const payload = {
    type: "lobby_invite",
    lobbyId: lobby.id,
    lobbyName: lobby.name,
    inviteCode: lobby.invite_code,
    inviterId: inviter.id,
    inviterNickname: inviter.nickname,
    inviterAvatar: inviter.avatar_emoji,
    createdAt: now(),
  };
  return `${INVITE_PREFIX}${JSON.stringify(payload)}`;
};

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: now() });
});

app.get("/api/config", (req, res) => {
  res.json({
    avatars: AVATAR_EMOJIS,
    countries: COUNTRY_TEMPLATES.map((country) => ({
      id: country.id,
      name: country.name,
      flag: country.flag,
      cities: country.cities.map((city) => ({
        id: city.id,
        name: city.name,
        baseIncome: city.baseIncome,
        lifeLevel: city.lifeLevel,
      })),
    })),
    limits: GAME_LIMITS,
    phases: config.phases,
    economy: config.economy,
  });
});

app.get("/api/site/messages", authMiddleware, (req, res) => {
  const messages = stmt.listSiteMessages.all(SITE_LOBBY_ID).reverse();
  res.json({ messages });
});

app.post("/api/auth/register/request-code", async (req, res) => {
  try {
    const { email, password, nickname, avatarEmoji } = req.body;
    if (!email || !password || !nickname || !avatarEmoji) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }
    if (!isValidAvatarEmoji(avatarEmoji)) {
      return res.status(400).json({ error: "INVALID_AVATAR" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "WEAK_PASSWORD" });
    }
    if (nickname.length < 3) {
      return res.status(400).json({ error: "NICKNAME_TOO_SHORT" });
    }
    const normalizedEmail = normalizeEmail(email);
    if (stmt.getUserByEmail.get(normalizedEmail)) {
      return res.status(409).json({ error: "EMAIL_TAKEN" });
    }
    if (stmt.getUserByNickname.get(nickname)) {
      return res.status(409).json({ error: "NICKNAME_TAKEN" });
    }
    const passwordHash = await hashPassword(password);
    const createdAt = now();

    // If email verification is disabled or SMTP not configured — register directly
    const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION !== "false" && emailTransport;
    if (!requireVerification) {
      const result = stmt.insertUser.run(
        normalizedEmail, null, nickname, passwordHash, avatarEmoji, createdAt, createdAt
      );
      const user = {
        id: result.lastInsertRowid,
        email: normalizedEmail,
        nickname,
        avatar_emoji: avatarEmoji,
      };
      const token = signToken(user);
      return res.json({ ok: true, skipVerification: true, token, user });
    }

    const code = generateEmailCode();
    stmt.deleteExpiredEmailVerifications.run(createdAt);
    stmt.upsertEmailVerification.run(
      normalizedEmail,
      nickname,
      passwordHash,
      avatarEmoji,
      code,
      createdAt + EMAIL_CODE_TTL_MS,
      createdAt,
    );
    await sendVerificationCodeEmail(normalizedEmail, code);
    return res.json({
      ok: true,
      email: normalizedEmail,
      expiresAt: createdAt + EMAIL_CODE_TTL_MS,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "REGISTER_FAILED";
    if (code === "EMAIL_NOT_CONFIGURED") {
      return res.status(500).json({ error: "EMAIL_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "REGISTER_FAILED" });
  }
});


app.post("/api/auth/register/verify-code", async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }
    const normalizedEmail = normalizeEmail(email);
    const createdAt = now();
    stmt.deleteExpiredEmailVerifications.run(createdAt);
    const pending = stmt.getEmailVerification.get(normalizedEmail);
    if (!pending) {
      return res.status(404).json({ error: "VERIFICATION_NOT_FOUND" });
    }
    if (pending.expires_at < createdAt) {
      stmt.deleteEmailVerification.run(normalizedEmail);
      return res.status(410).json({ error: "CODE_EXPIRED" });
    }
    if (String(pending.code) !== String(code).trim()) {
      return res.status(400).json({ error: "INVALID_CODE" });
    }
    if (stmt.getUserByEmail.get(normalizedEmail)) {
      stmt.deleteEmailVerification.run(normalizedEmail);
      return res.status(409).json({ error: "EMAIL_TAKEN" });
    }
    if (stmt.getUserByNickname.get(pending.nickname)) {
      return res.status(409).json({ error: "NICKNAME_TAKEN" });
    }
    const result = stmt.insertUser.run(
      normalizedEmail,
      null,
      pending.nickname,
      pending.password_hash,
      pending.avatar_emoji,
      createdAt,
      createdAt
    );
    stmt.deleteEmailVerification.run(normalizedEmail);
    const user = {
      id: result.lastInsertRowid,
      email: normalizedEmail,
      nickname: pending.nickname,
      avatar_emoji: pending.avatar_emoji,
    };
    const token = signToken(user);
    return res.json({ token, user });
  } catch {
    return res.status(500).json({ error: "VERIFY_CODE_FAILED" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }
    const normalizedEmail = normalizeEmail(email);
    const userRow = stmt.getUserByEmail.get(normalizedEmail);
    if (!userRow) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    }
    const ok = await verifyPassword(password, userRow.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    }
    const user = {
      id: userRow.id,
      email: userRow.email,
      nickname: userRow.nickname,
      avatar_emoji: userRow.avatar_emoji,
    };
    const token = signToken(user);
    return res.json({ token, user });
  } catch (error) {
    return res.status(500).json({ error: "LOGIN_FAILED" });
  }
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/profile", authMiddleware, (req, res) => {
  const user = getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }
  const statsRow = stmt.getGameStatsByUser.get(req.user.id) || {};
  const history = stmt.listGameHistoryByUser.all(req.user.id);
  const friends = stmt.listFriends.all(req.user.id, req.user.id, req.user.id);
  const inGame = isUserInActiveGame(req.user.id);
  res.json({
    user,
    stats: {
      games: statsRow.games || 0,
      wins: statsRow.wins || 0,
      totalScore: statsRow.total_score || 0,
    },
    history,
    friends,
    inGame,
  });
});

app.patch("/api/profile", authMiddleware, async (req, res) => {
  const { email, nickname, password, about, headerImage, avatarEmoji } = req.body;
  const user = getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }

  const newEmail = email ? normalizeEmail(email) : user.email;
  const newNickname = nickname || user.nickname;
  const newAbout =
    typeof about === "string" ? about.slice(0, 500) : user.about || "";
  let newAvatar = user.avatar_emoji;
    if (typeof avatarEmoji === "string") {
      if (!isValidAvatarEmoji(avatarEmoji)) {
        return res.status(400).json({ error: "INVALID_AVATAR" });
      }
      newAvatar = avatarEmoji.trim();
    }
  let newHeader =
    user.profile_header !== undefined ? user.profile_header : null;
  if (headerImage === null) {
    newHeader = null;
  } else if (typeof headerImage === "string") {
    if (!headerImage.startsWith("data:image/")) {
      return res.status(400).json({ error: "INVALID_HEADER_IMAGE" });
    }
    if (headerImage.length > 800000) {
      return res.status(413).json({ error: "HEADER_TOO_LARGE" });
    }
    newHeader = headerImage;
  }

  if (email && stmt.getUserByEmail.get(newEmail) && newEmail !== user.email) {
    return res.status(409).json({ error: "EMAIL_TAKEN" });
  }
  if (
    nickname &&
    stmt.getUserByNickname.get(newNickname) &&
    newNickname !== user.nickname
  ) {
    return res.status(409).json({ error: "NICKNAME_TAKEN" });
  }

  if (password) {
    if (password.length < 6) {
      return res.status(400).json({ error: "WEAK_PASSWORD" });
    }
    const passwordHash = await hashPassword(password);
    stmt.updateUser.run(
      newEmail,
      newNickname,
      newAbout,
      newHeader,
      newAvatar,
      passwordHash,
      now(),
      req.user.id
    );
  } else {
    stmt.updateUserNoPassword.run(
      newEmail,
      newNickname,
      newAbout,
      newHeader,
      newAvatar,
      now(),
      req.user.id
    );
  }

  return res.json({
    user: {
      id: req.user.id,
      email: newEmail,
      nickname: newNickname,
      about: newAbout,
      avatar_emoji: newAvatar,
      profile_header: newHeader,
    },
  });
});

app.get("/api/profile/comments", authMiddleware, (req, res) => {
  const targetId = Number(req.query.userId || req.user.id);
  if (!Number.isFinite(targetId)) {
    return res.status(400).json({ error: "INVALID_USER" });
  }
  const target = getUserById(targetId);
  if (!target) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }
  const comments = stmt.listProfileComments.all(targetId);
  res.json({ comments });
});

app.post("/api/profile/comments", authMiddleware, (req, res) => {
  const { targetUserId, content } = req.body || {};
  const targetId = Number(targetUserId);
  if (!Number.isFinite(targetId)) {
    return res.status(400).json({ error: "INVALID_USER" });
  }
  const target = getUserById(targetId);
  if (!target) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }
  const message = sanitizeMessage(content || "", 400);
  if (!message) {
    return res.status(400).json({ error: "EMPTY_COMMENT" });
  }
  const createdAt = now();
  const result = stmt.insertProfileComment.run(
    targetId,
    req.user.id,
    message,
    createdAt
  );
  res.json({
    comment: {
      id: result.lastInsertRowid,
      profile_user_id: targetId,
      author_user_id: req.user.id,
      content: message,
      created_at: createdAt,
      author_nickname: req.user.nickname,
      author_avatar: req.user.avatar_emoji,
    },
  });
});

app.delete("/api/profile/comments/:id", authMiddleware, (req, res) => {
  const commentId = Number(req.params.id);
  if (!Number.isFinite(commentId)) {
    return res.status(400).json({ error: "INVALID_COMMENT" });
  }
  const comment = stmt.getProfileComment.get(commentId);
  if (!comment) {
    return res.status(404).json({ error: "COMMENT_NOT_FOUND" });
  }
  if (
    comment.author_user_id !== req.user.id &&
    comment.profile_user_id !== req.user.id
  ) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  stmt.deleteProfileComment.run(commentId);
  res.json({ ok: true });
});

app.get("/api/friends", authMiddleware, (req, res) => {
  const friends = stmt.listFriends.all(req.user.id, req.user.id, req.user.id);
  res.json({ friends });
});

app.get("/api/friends/requests", authMiddleware, (req, res) => {
  const incoming = stmt.listFriendRequests.all(req.user.id);
  const outgoing = stmt.listOutgoingRequests.all(req.user.id);
  res.json({ incoming, outgoing });
});

app.get("/api/friends/search", authMiddleware, (req, res) => {
  const query = (req.query.q || "").toString().trim();
  if (!query) {
    return res.json({ results: [] });
  }
  const results = db
    .prepare(
      "SELECT id, nickname, avatar_emoji FROM users WHERE nickname LIKE ? LIMIT 20"
    )
    .all(`%${query}%`);
  return res.json({ results });
});

app.post("/api/friends/request", authMiddleware, (req, res) => {
  const { nickname } = req.body;
  if (!nickname) {
    return res.status(400).json({ error: "MISSING_NICKNAME" });
  }
  const target = stmt.getUserByNickname.get(nickname);
  if (!target) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }
  if (target.id === req.user.id) {
    return res.status(400).json({ error: "CANNOT_ADD_SELF" });
  }
  if (areFriends(req.user.id, target.id)) {
    return res.status(409).json({ error: "ALREADY_FRIENDS" });
  }
  const pending = stmt.getPendingFriendRequestBetween.get(
    req.user.id,
    target.id,
    target.id,
    req.user.id
  );
  if (pending) {
    return res.status(409).json({ error: "REQUEST_EXISTS" });
  }
  try {
    stmt.insertFriendRequest.run(req.user.id, target.id, now());
    io.to(`user:${target.id}`).emit("friends:request", {
      requester: {
        id: req.user.id,
        nickname: req.user.nickname,
        avatar_emoji: req.user.avatar_emoji,
      },
    });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(409).json({ error: "REQUEST_EXISTS" });
  }
});

app.post("/api/friends/accept", authMiddleware, (req, res) => {
  const { requestId } = req.body;
  if (!requestId) {
    return res.status(400).json({ error: "MISSING_REQUEST_ID" });
  }
  const request = stmt.getFriendRequest.get(requestId);
  if (!request || request.addressee_id !== req.user.id) {
    return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
  }
  stmt.updateFriendRequestStatus.run("accepted", now(), requestId);
  return res.json({ ok: true });
});

app.post("/api/friends/decline", authMiddleware, (req, res) => {
  const { requestId } = req.body;
  if (!requestId) {
    return res.status(400).json({ error: "MISSING_REQUEST_ID" });
  }
  const request = stmt.getFriendRequest.get(requestId);
  if (!request || request.addressee_id !== req.user.id) {
    return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
  }
  stmt.updateFriendRequestStatus.run("declined", now(), requestId);
  return res.json({ ok: true });
});

app.post("/api/friends/remove", authMiddleware, (req, res) => {
  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: "MISSING_USER" });
  }
  stmt.deleteFriendRelation.run(req.user.id, userId, userId, req.user.id);
  return res.json({ ok: true });
});

app.get("/api/friends/messages", authMiddleware, (req, res) => {
  const targetId = Number(req.query.userId);
  if (!Number.isFinite(targetId)) {
    return res.status(400).json({ error: "INVALID_USER" });
  }
  if (!areFriends(req.user.id, targetId)) {
    return res.status(403).json({ error: "NOT_FRIENDS" });
  }
  const cutoff = now() - WEEK_MS;
  stmt.deleteOldFriendMessages.run(cutoff);
  const messages = stmt.listFriendMessages.all(
    req.user.id,
    targetId,
    targetId,
    req.user.id,
    cutoff
  );
  res.json({ messages });
});

app.post("/api/friends/messages", authMiddleware, (req, res) => {
  const { targetUserId, message } = req.body || {};
  if (!targetUserId || !message) {
    return res.status(400).json({ error: "INVALID_MESSAGE" });
  }
  const targetId = Number(targetUserId);
  if (!Number.isFinite(targetId)) {
    return res.status(400).json({ error: "INVALID_USER" });
  }
  if (!areFriends(req.user.id, targetId)) {
    return res.status(403).json({ error: "NOT_FRIENDS" });
  }
  if (isUserInActiveGame(req.user.id) || isUserInActiveGame(targetId)) {
    return res.status(409).json({ error: "IN_GAME" });
  }
  const content = sanitizeMessage(message, GAME_LIMITS.maxMessageLength);
  if (!content) {
    return res.status(400).json({ error: "INVALID_MESSAGE" });
  }
  const createdAt = now();
  stmt.deleteOldFriendMessages.run(createdAt - WEEK_MS);
  stmt.insertFriendMessage.run(req.user.id, targetId, content, createdAt);
  const payload = {
    senderUserId: req.user.id,
    recipientUserId: targetId,
    content,
    createdAt,
  };
  io.to(`user:${req.user.id}`).emit("friend:message", payload);
  io.to(`user:${targetId}`).emit("friend:message", payload);
  return res.json({ ok: true, message: payload });
});

app.get("/api/users/:id", authMiddleware, (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ error: "INVALID_USER" });
  }
  const user = getUserById(userId);
  if (!user) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }
  const statsRow = stmt.getGameStatsByUser.get(userId) || {};
  res.json({
    user,
    stats: {
      games: statsRow.games || 0,
      wins: statsRow.wins || 0,
      totalScore: statsRow.total_score || 0,
    },
    isFriend: areFriends(req.user.id, userId),
  });
});

app.post("/api/users/stats", authMiddleware, (req, res) => {
  const ids = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
  const uniqueIds = Array.from(
    new Set(
      ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
    )
  ).slice(0, 200);
  if (!uniqueIds.length) {
    return res.json({ stats: {} });
  }
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT user_id, COUNT(*) as games, SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins
       FROM game_history
       WHERE user_id IN (${placeholders})
       GROUP BY user_id`
    )
    .all(...uniqueIds);
  const stats = {};
  for (const id of uniqueIds) {
    stats[id] = { games: 0, wins: 0, losses: 0 };
  }
  for (const row of rows) {
    const games = row.games || 0;
    const wins = row.wins || 0;
    stats[row.user_id] = {
      games,
      wins,
      losses: Math.max(0, games - wins),
    };
  }
  return res.json({ stats });
});

app.post("/api/support/tickets", authMiddleware, (req, res) => {
  const { subject, message } = req.body;
  if (!subject || !message) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }
  stmt.insertSupportTicket.run(req.user.id, subject, message, now());
  return res.json({ ok: true });
});

app.get("/api/support/tickets", authMiddleware, (req, res) => {
  const tickets = stmt.listSupportTickets.all(req.user.id);
  res.json({ tickets });
});

app.get("/api/admin/summary", adminMiddleware, (req, res) => {
  const getCount = (sql, params = []) => db.prepare(sql).get(...params).count || 0;
  const summary = {
    users: getCount("SELECT COUNT(*) as count FROM users"),
    lobbies: getCount("SELECT COUNT(*) as count FROM lobbies"),
    lobbiesWaiting: getCount("SELECT COUNT(*) as count FROM lobbies WHERE status = 'waiting'"),
    lobbiesActive: getCount("SELECT COUNT(*) as count FROM lobbies WHERE status = 'in_progress'"),
    lobbiesFinished: getCount("SELECT COUNT(*) as count FROM lobbies WHERE status = 'finished'"),
    messages: getCount("SELECT COUNT(*) as count FROM messages"),
    ticketsOpen: getCount("SELECT COUNT(*) as count FROM support_tickets WHERE status = 'open'"),
  };
  res.json({ summary });
});

app.get("/api/admin/lobbies", adminMiddleware, (req, res) => {
  const includePlayers = req.query.includePlayers === "1";
  const lobbies = stmt.listAllLobbies.all().map((lobby) => {
    const host = db
      .prepare("SELECT nickname, email FROM users WHERE id = ?")
      .get(lobby.host_user_id);
    const item = {
      id: lobby.id,
      name: lobby.name,
      status: lobby.status,
      maxTeams: lobby.max_teams,
      totalRounds: lobby.total_rounds,
      playersCount: lobby.player_count,
      inviteCode: lobby.invite_code,
      createdAt: lobby.created_at,
      updatedAt: lobby.updated_at,
      host: host
        ? { id: lobby.host_user_id, nickname: host.nickname, email: host.email }
        : null,
    };
    if (includePlayers) {
      item.players = stmt.listLobbyPlayersFull.all(lobby.id);
    }
    return item;
  });
  res.json({ lobbies });
});

app.post("/api/admin/lobbies/:id/finish", adminMiddleware, (req, res) => {
  const lobbyId = req.params.id;
  const lobby = stmt.getLobbyById.get(lobbyId);
  if (!lobby) {
    return res.status(404).json({ error: "LOBBY_NOT_FOUND" });
  }
  if (lobby.status === "in_progress") {
    const state = engine.forceFinish(lobbyId);
    return res.json({ ok: true, status: "finished", state: state ? engine.decorateState(state) : null });
  }
  if (lobby.status === "waiting") {
    stmt.clearLobbyPlayers.run(lobbyId);
    db.prepare("UPDATE lobbies SET status = ?, updated_at = ? WHERE id = ?").run(
      "finished",
      now(),
      lobbyId
    );
    return res.json({ ok: true, status: "finished" });
  }
  return res.json({ ok: true, status: lobby.status });
});

app.delete("/api/admin/lobbies/:id", adminMiddleware, (req, res) => {
  const lobbyId = req.params.id;
  const lobby = stmt.getLobbyById.get(lobbyId);
  if (!lobby) {
    return res.status(404).json({ error: "LOBBY_NOT_FOUND" });
  }
  stmt.deleteMessagesByLobby.run(lobbyId);
  stmt.deleteNegotiationsByLobby.run(lobbyId);
  stmt.deleteRoundDecisionsByLobby.run(lobbyId);
  stmt.deleteRoundQuestionsByLobby.run(lobbyId);
  stmt.deleteNukeAttacksByLobby.run(lobbyId);
  stmt.deleteGameStateByLobby.run(lobbyId);
  stmt.clearLobbyPlayers.run(lobbyId);
  stmt.deleteLobby.run(lobbyId);
  res.json({ ok: true });
});

app.get("/api/admin/tables", adminMiddleware, (req, res) => {
  const tables = listDbTables().map((name) => {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${name}`).get().count || 0;
    return { name, rows: count };
  });
  res.json({ tables });
});

app.get("/api/admin/table/:name", adminMiddleware, (req, res) => {
  const tableName = ensureTableName(req.params.name);
  if (!tableName) {
    return res.status(404).json({ error: "TABLE_NOT_FOUND" });
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const rows = db
    .prepare(`SELECT rowid as _rowid, * FROM ${tableName} LIMIT ? OFFSET ?`)
    .all(limit, offset);
  res.json({
    table: tableName,
    columns: ["_rowid", ...columns.map((col) => col.name)],
    rows,
    limit,
    offset,
  });
});

app.delete("/api/admin/table/:name/:rowid", adminMiddleware, (req, res) => {
  const tableName = ensureTableName(req.params.name);
  if (!tableName) {
    return res.status(404).json({ error: "TABLE_NOT_FOUND" });
  }
  const rowid = Number(req.params.rowid);
  if (!Number.isFinite(rowid)) {
    return res.status(400).json({ error: "INVALID_ROWID" });
  }
  const result = db.prepare(`DELETE FROM ${tableName} WHERE rowid = ?`).run(rowid);
  res.json({ ok: true, changes: result.changes || 0 });
});

app.post("/api/admin/sql", adminMiddleware, (req, res) => {
  const { query, params, unsafe } = req.body || {};
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "MISSING_QUERY" });
  }
  const trimmed = query.trim().toUpperCase();
  if (
    !unsafe &&
    !trimmed.startsWith("SELECT") &&
    !trimmed.startsWith("PRAGMA") &&
    !trimmed.startsWith("WITH")
  ) {
    return res.status(400).json({ error: "UNSAFE_QUERY" });
  }
  const statement = db.prepare(query);
  if (statement.reader) {
    const rows = statement.all(Array.isArray(params) ? params : []);
    return res.json({ rows });
  }
  const result = statement.run(Array.isArray(params) ? params : []);
  return res.json({
    changes: result.changes || 0,
    lastInsertRowid: result.lastInsertRowid || null,
  });
});

app.get("/api/lobbies", authMiddleware, (req, res) => {
  const lobbies = stmt.listLobbies.all();
  const result = [];
  for (const lobby of lobbies) {
    const friendsOnly = Boolean(lobby.friends_only);
    const isFriendLobby =
      !friendsOnly ||
      lobby.host_user_id === req.user.id ||
      areFriends(req.user.id, lobby.host_user_id);
    if (friendsOnly && !isFriendLobby) {
      continue;
    }
    result.push({
      id: lobby.id,
      name: lobby.name,
      status: lobby.status,
      maxTeams: lobby.max_teams,
      totalRounds: lobby.total_rounds,
      playersCount: lobby.player_count,
      hasPassword: Boolean(lobby.password_hash),
      friendsOnly,
      isFriendLobby: friendsOnly ? isFriendLobby : false,
    });
  }
  result.sort((a, b) => {
    const af = a.isFriendLobby ? 1 : 0;
    const bf = b.isFriendLobby ? 1 : 0;
    if (af !== bf) return bf - af;
    return 0;
  });
  res.json({ lobbies: result });
});

app.post("/api/lobbies", authMiddleware, async (req, res) => {
  const { name, maxTeams, totalRounds, password, settings, friendsOnly } = req.body;
  if (!name || !maxTeams || !totalRounds) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }
  if (maxTeams < GAME_LIMITS.minTeams || maxTeams > GAME_LIMITS.maxTeams) {
    return res.status(400).json({ error: "INVALID_TEAM_COUNT" });
  }
  if (totalRounds < GAME_LIMITS.minRounds || totalRounds > GAME_LIMITS.maxRounds) {
    return res.status(400).json({ error: "INVALID_ROUNDS" });
  }

  const rawDiscussionMs =
    settings?.discussionMs ?? req.body?.discussionMs ?? config.phases.discussionMs;
  const rawDecisionsMs =
    settings?.decisionsMs ?? req.body?.decisionsMs ?? config.phases.decisionsMs;
  const rawRevealNukes =
    settings?.revealNukes ?? req.body?.revealNukes ?? false;
  const rawIncomeMultiplier =
    settings?.incomeMultiplier ?? req.body?.incomeMultiplier ?? 1;
  const rawNukeUnlock =
    settings?.nukeUnlockRound ?? req.body?.nukeUnlockRound ?? config.economy.nukeUnlockRound;
  const rawFriendsOnly =
    settings?.friendsOnly ?? req.body?.friendsOnly ?? false;

  const clampNum = (value, min, max, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  };

  const discussionMs = clampNum(rawDiscussionMs, 30000, 180000, config.phases.discussionMs);
  const decisionsMs = clampNum(rawDecisionsMs, 60000, 300000, config.phases.decisionsMs);
  const incomeMultiplier = clampNum(rawIncomeMultiplier, 0.5, 3, 1);
  const nukeUnlockRound = Math.max(1, Math.min(Number(rawNukeUnlock) || config.economy.nukeUnlockRound, totalRounds));
  const revealNukes = Boolean(rawRevealNukes);
  const friendsOnlyFlag = Boolean(rawFriendsOnly);
  const existingLobby = stmt.getUserLobby.get(req.user.id);
  if (existingLobby) {
    return res.status(409).json({ error: "ALREADY_IN_LOBBY" });
  }

  let lobbyId = createLobbyId();
  while (stmt.getLobbyById.get(lobbyId)) {
    lobbyId = createLobbyId();
  }
  const inviteCode = createInviteCode();
  const createdAt = now();
  let passwordHash = null;
  if (password) {
    passwordHash = await hashPassword(password);
  }
  stmt.insertLobby.run(
    lobbyId,
    name,
    req.user.id,
    passwordHash,
    maxTeams,
    totalRounds,
    inviteCode,
    friendsOnlyFlag ? 1 : 0,
    discussionMs,
    decisionsMs,
    revealNukes ? 1 : 0,
    incomeMultiplier,
    nukeUnlockRound,
    createdAt,
    createdAt
  );
  stmt.insertLobbyPlayer.run(lobbyId, req.user.id, null, createdAt);
  res.json({
    lobby: {
      id: lobbyId,
      name,
      status: "waiting",
      maxTeams,
      totalRounds,
      inviteCode,
      inviteLink: buildInviteLink(lobbyId, inviteCode),
      friendsOnly: friendsOnlyFlag,
      settings: {
        discussionMs,
        decisionsMs,
        revealNukes,
        incomeMultiplier,
        nukeUnlockRound,
      },
    },
  });
});

app.post("/api/lobbies/join", authMiddleware, async (req, res) => {
  const { lobbyId, password } = req.body;
  if (!lobbyId) {
    return res.status(400).json({ error: "MISSING_LOBBY_ID" });
  }
  const lobby = stmt.getLobbyById.get(lobbyId);
  if (!lobby) {
    return res.status(404).json({ error: "LOBBY_NOT_FOUND" });
  }
  if (lobby.friends_only) {
    const allowed =
      lobby.host_user_id === req.user.id ||
      areFriends(req.user.id, lobby.host_user_id);
    if (!allowed) {
      return res.status(403).json({ error: "FRIENDS_ONLY" });
    }
  }
  if (lobby.status !== "waiting") {
    return res.status(409).json({ error: "LOBBY_IN_PROGRESS" });
  }
  const existingLobby = stmt.getUserLobby.get(req.user.id);
  if (existingLobby) {
    if (existingLobby.lobby_id === lobby.id) {
      return res.json({ ok: true, already: true });
    }
    const currentLobby = stmt.getLobbyById.get(existingLobby.lobby_id);
    if (currentLobby && currentLobby.status === "in_progress") {
      return res.status(409).json({ error: "ALREADY_IN_LOBBY" });
    }
    leaveLobbyForUser(req.user.id);
  }
  const players = stmt.listLobbyPlayers.all(lobbyId);
  if (players.length >= lobby.max_teams) {
    return res.status(409).json({ error: "LOBBY_FULL" });
  }
  if (lobby.password_hash) {
    const ok = await verifyPassword(password || "", lobby.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "INVALID_PASSWORD" });
    }
  }
  stmt.insertLobbyPlayer.run(lobbyId, req.user.id, null, now());
  emitLobbyUpdate(lobbyId);
  evaluateLobbyCountdown(lobbyId);
  res.json({ ok: true });
});

app.post("/api/lobbies/join-invite", authMiddleware, async (req, res) => {
  const { lobbyId, inviteCode } = req.body || {};
  if (!lobbyId || !inviteCode) {
    return res.status(400).json({ error: "MISSING_INVITE" });
  }
  const lobby = stmt.getLobbyById.get(lobbyId);
  if (!lobby) {
    return res.status(404).json({ error: "LOBBY_NOT_FOUND" });
  }
  if (lobby.invite_code !== inviteCode) {
    return res.status(401).json({ error: "INVALID_INVITE" });
  }
  if (lobby.friends_only) {
    const allowed =
      lobby.host_user_id === req.user.id ||
      areFriends(req.user.id, lobby.host_user_id);
    if (!allowed) {
      return res.status(403).json({ error: "FRIENDS_ONLY" });
    }
  }
  if (lobby.status !== "waiting") {
    return res.status(409).json({ error: "LOBBY_IN_PROGRESS" });
  }
  const existingLobby = stmt.getUserLobby.get(req.user.id);
  if (existingLobby) {
    return res.status(409).json({ error: "ALREADY_IN_LOBBY" });
  }
  const players = stmt.listLobbyPlayers.all(lobbyId);
  if (players.length >= lobby.max_teams) {
    return res.status(409).json({ error: "LOBBY_FULL" });
  }
  stmt.insertLobbyPlayer.run(lobbyId, req.user.id, null, now());
  emitLobbyUpdate(lobbyId);
  evaluateLobbyCountdown(lobbyId);
  res.json({ ok: true });
});

app.post("/api/lobbies/:id/invite", authMiddleware, (req, res) => {
  const lobbyId = req.params.id;
  const { targetUserId } = req.body || {};
  const targetId = Number(targetUserId);
  if (!Number.isFinite(targetId)) {
    return res.status(400).json({ error: "INVALID_USER" });
  }
  if (targetId === req.user.id) {
    return res.status(400).json({ error: "INVALID_TARGET" });
  }
  const lobby = stmt.getLobbyById.get(lobbyId);
  if (!lobby) {
    return res.status(404).json({ error: "LOBBY_NOT_FOUND" });
  }
  if (lobby.status !== "waiting") {
    return res.status(409).json({ error: "LOBBY_IN_PROGRESS" });
  }
  const me = stmt.getLobbyPlayer.get(lobbyId, req.user.id);
  if (!me) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  if (!areFriends(req.user.id, targetId)) {
    return res.status(403).json({ error: "NOT_FRIENDS" });
  }
  if (isUserInActiveGame(targetId)) {
    return res.status(409).json({ error: "IN_GAME" });
  }
  const targetLobby = stmt.getUserLobby.get(targetId);
  if (targetLobby) {
    return res.status(409).json({ error: "ALREADY_IN_LOBBY" });
  }
  const targetUser = getUserById(targetId);
  if (!targetUser) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }
  const content = sanitizeMessage(
    buildLobbyInviteContent(lobby, req.user),
    GAME_LIMITS.maxMessageLength
  );
  const createdAt = now();
  stmt.insertFriendMessage.run(req.user.id, targetId, content, createdAt);
  const payload = {
    senderUserId: req.user.id,
    recipientUserId: targetId,
    content,
    createdAt,
  };
  io.to(`user:${req.user.id}`).emit("friend:message", payload);
  io.to(`user:${targetId}`).emit("friend:message", payload);
  return res.json({ ok: true });
});

app.post("/api/lobbies/leave", authMiddleware, (req, res) => {
  const result = leaveLobbyForUser(req.user.id);
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.json({ ok: true });
});

app.post("/api/lobbies/leave-beacon", express.text({ type: "*/*", limit: "1kb" }), (req, res) => {
  const token = parseBeaconToken(req.body);
  const user = resolveUserFromToken(token);
  if (!user) {
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }
  const result = leaveLobbyForUser(user.id);
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.json({ ok: true });
});

app.get("/api/lobbies/:id", authMiddleware, (req, res) => {
  const lobby = stmt.getLobbyById.get(req.params.id);
  if (!lobby) {
    return res.status(404).json({ error: "LOBBY_NOT_FOUND" });
  }
  if (lobby.friends_only) {
    const playerLobby = stmt.getUserLobby.get(req.user.id);
    const isMember = playerLobby && playerLobby.lobby_id === lobby.id;
    const allowed =
      isMember ||
      lobby.host_user_id === req.user.id ||
      areFriends(req.user.id, lobby.host_user_id);
    if (!allowed) {
      return res.status(403).json({ error: "FRIENDS_ONLY" });
    }
  }
  const detail = buildLobbyDetail(req.params.id);
  if (!detail) {
    return res.status(404).json({ error: "LOBBY_NOT_FOUND" });
  }
  res.json({ lobby: detail });
});

app.post("/api/lobbies/:id/select-country", authMiddleware, (req, res) => {
  const { countryId } = req.body;
  if (!countryId) {
    return res.status(400).json({ error: "MISSING_COUNTRY" });
  }
  const lobby = stmt.getLobbyById.get(req.params.id);
  if (!lobby) {
    return res.status(404).json({ error: "LOBBY_NOT_FOUND" });
  }
  if (lobby.status !== "waiting") {
    return res.status(409).json({ error: "LOBBY_IN_PROGRESS" });
  }
  const playerLobby = stmt.getUserLobby.get(req.user.id);
  if (!playerLobby || playerLobby.lobby_id !== lobby.id) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  const template = COUNTRY_TEMPLATES.find((item) => item.id === countryId);
  if (!template) {
    return res.status(400).json({ error: "COUNTRY_INVALID" });
  }
  const taken = stmt.checkCountryTaken.get(lobby.id, countryId);
  if (taken) {
    return res.status(409).json({ error: "COUNTRY_TAKEN" });
  }
  stmt.updatePlayerCountry.run(countryId, lobby.id, req.user.id);
  emitLobbyUpdate(lobby.id);
  evaluateLobbyCountdown(lobby.id);
  res.json({ ok: true });
});

app.post("/api/lobbies/:id/ready", authMiddleware, (req, res) => {
  const lobbyId = req.params.id;
  const lobby = stmt.getLobbyById.get(lobbyId);
  if (!lobby) {
    return res.status(404).json({ error: "LOBBY_NOT_FOUND" });
  }
  if (lobby.status !== "waiting") {
    return res.status(409).json({ error: "LOBBY_IN_PROGRESS" });
  }
  const playerLobby = stmt.getUserLobby.get(req.user.id);
  if (!playerLobby || playerLobby.lobby_id !== lobby.id) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  const player = stmt.getLobbyPlayer.get(lobby.id, req.user.id);
  if (!player) {
    return res.status(404).json({ error: "PLAYER_NOT_FOUND" });
  }
  const requestedReady =
    typeof req.body?.ready === "boolean" ? req.body.ready : !Boolean(player.ready);
  if (requestedReady && !player.country_id) {
    return res.status(400).json({ error: "COUNTRY_NOT_SELECTED" });
  }
  stmt.updatePlayerReady.run(requestedReady ? 1 : 0, lobby.id, req.user.id);
  emitLobbyUpdate(lobby.id);
  evaluateLobbyCountdown(lobby.id);
  res.json({ ok: true, ready: requestedReady });
});

app.post("/api/lobbies/:id/kick", authMiddleware, (req, res) => {
  const lobbyId = req.params.id;
  const { userId: targetUserId } = req.body || {};
  if (!targetUserId) {
    return res.status(400).json({ error: "MISSING_TARGET" });
  }
  const lobby = stmt.getLobbyById.get(lobbyId);
  if (!lobby) {
    return res.status(404).json({ error: "LOBBY_NOT_FOUND" });
  }
  if (lobby.status !== "waiting") {
    return res.status(409).json({ error: "LOBBY_IN_PROGRESS" });
  }
  if (lobby.host_user_id !== req.user.id) {
    return res.status(403).json({ error: "NOT_HOST" });
  }
  if (Number(targetUserId) === Number(req.user.id)) {
    return res.status(400).json({ error: "CANNOT_KICK_SELF" });
  }
  const target = stmt.getLobbyPlayer.get(lobbyId, targetUserId);
  if (!target) {
    return res.status(404).json({ error: "TARGET_NOT_IN_LOBBY" });
  }
  stmt.removeLobbyPlayer.run(lobbyId, targetUserId);
  const remaining = stmt.listLobbyPlayers.all(lobbyId);
  if (remaining.length === 0) {
    stmt.deleteLobby.run(lobbyId);
  }
  emitLobbyUpdate(lobbyId);
  evaluateLobbyCountdown(lobbyId);
  res.json({ ok: true });
});

app.post("/api/lobbies/:id/start", authMiddleware, (req, res) => {
  const lobby = stmt.getLobbyById.get(req.params.id);
  if (!lobby) {
    return res.status(404).json({ error: "LOBBY_NOT_FOUND" });
  }
  if (lobby.host_user_id !== req.user.id) {
    return res.status(403).json({ error: "NOT_HOST" });
  }
  const players = stmt.listLobbyPlayers.all(lobby.id);
  if (players.length < 2) {
    return res.status(400).json({ error: "NOT_ENOUGH_PLAYERS" });
  }
  const allCountriesSelected = players.every((player) => Boolean(player.country_id));
  if (!allCountriesSelected) {
    return res.status(400).json({ error: "COUNTRIES_NOT_SELECTED" });
  }
  try {
    cancelLobbyCountdown(lobby.id);
    const state = engine.startGame(lobby.id);
    return res.json({ state: engine.decorateState(state) });
  } catch (error) {
    return res.status(400).json({ error: error.message || "START_FAILED" });
  }
});

app.get("/api/lobbies/:id/messages", authMiddleware, (req, res) => {
  const type = req.query.type || "global";
  const messages = stmt.listMessages.all(req.params.id, type).reverse();
  res.json({ messages });
});

app.get("/api/lobbies/:id/messages/private", authMiddleware, (req, res) => {
  const lobbyId = req.params.id;
  const targetCountryId = (req.query.targetCountryId || "").toString();
  if (!targetCountryId) {
    return res.status(400).json({ error: "MISSING_TARGET" });
  }
  const myCountryId = getLobbyPlayerCountry(lobbyId, req.user.id);
  if (!myCountryId) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  const cutoff = now() - WEEK_MS;
  stmt.deleteOldPrivateMessages.run(cutoff);
  const messages = stmt.listPrivateMessages
    .all(lobbyId, myCountryId, targetCountryId, targetCountryId, myCountryId, cutoff)
    .reverse();
  res.json({ messages });
});

app.get("/api/game/:lobbyId/state", authMiddleware, (req, res) => {
  const lobbyId = req.params.lobbyId;
  const state = engine.loadState(lobbyId);
  if (!state) {
    return res.status(404).json({ error: "STATE_NOT_FOUND" });
  }
  const decisionsReady = getReadyCountries(lobbyId, state.currentRound);
  const decorated = engine.decorateState({
    ...state,
    decisionsReady,
  });
  res.json({ state: decorated });
});

app.get("/api/game/:lobbyId/question", authMiddleware, (req, res) => {
  const lobbyId = req.params.lobbyId;
  const lobbyRow = stmt.getUserLobby.get(req.user.id);
  if (!lobbyRow || lobbyRow.lobby_id !== lobbyId) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  const state = engine.loadState(lobbyId);
  if (!state) {
    return res.status(404).json({ error: "STATE_NOT_FOUND" });
  }
  const countryId = getLobbyPlayerCountry(lobbyId, req.user.id);
  if (!countryId) {
    return res.status(403).json({ error: "COUNTRY_NOT_SELECTED" });
  }
  const round = state.currentRound;
  let row = stmt.getRoundQuestion.get(lobbyId, round, countryId);
  if (!row) {
    const questionIndex = (round - 1) % QUESTION_COUNT;
    const question = getQuestionForCountry(countryId, questionIndex);
    const id = uuidv4();
    stmt.insertRoundQuestion.run(
      id,
      lobbyId,
      round,
      countryId,
      questionIndex,
      question.correctIndex,
      now(),
      null,
      0
    );
    row = stmt.getRoundQuestion.get(lobbyId, round, countryId);
  }
  const question = getQuestionForCountry(countryId, row.question_index);
  res.json({
    question: {
      id: row.id,
      text: question.text,
      options: question.options,
      round,
      expiresAt: row.assigned_at + QUIZ_DURATION_MS,
      answered: Boolean(row.answered_at),
    },
  });
});

app.post("/api/game/:lobbyId/question/answer", authMiddleware, (req, res) => {
  const lobbyId = req.params.lobbyId;
  const lobbyRow = stmt.getUserLobby.get(req.user.id);
  if (!lobbyRow || lobbyRow.lobby_id !== lobbyId) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  const { questionId, optionIndex } = req.body || {};
  if (!questionId || typeof optionIndex !== "number") {
    return res.status(400).json({ error: "INVALID_ANSWER" });
  }
  const row = stmt.getRoundQuestionById.get(questionId);
  if (!row || row.lobby_id !== lobbyId) {
    return res.status(404).json({ error: "QUESTION_NOT_FOUND" });
  }
  const countryId = getLobbyPlayerCountry(lobbyId, req.user.id);
  if (!countryId || row.country_id !== countryId) {
    return res.status(403).json({ error: "NOT_ALLOWED" });
  }
  if (row.answered_at) {
    return res.json({
      ok: true,
      correct: Boolean(row.answered_correct),
      alreadyAnswered: true,
    });
  }
  const expired = now() - row.assigned_at > QUIZ_DURATION_MS;
  const correct = !expired && Number(optionIndex) === row.correct_index;
  stmt.answerRoundQuestion.run(now(), correct ? 1 : 0, row.id);
  if (correct) {
    const state = engine.loadState(lobbyId);
    if (state) {
      const country = state.countries.find((c) => c.id === countryId);
      if (country) {
        country.money += config.economy.quizReward;
        engine.saveState(state);
        io.to(`lobby:${lobbyId}`).emit("game:update", engine.decorateState(state));
      }
    }
  }
  return res.json({
    ok: true,
    correct,
    expired,
    reward: correct ? config.economy.quizReward : 0,
  });
});

app.post("/api/game/:lobbyId/transfer", authMiddleware, (req, res) => {
  const lobbyId = req.params.lobbyId;
  const { targetCountryId, amount } = req.body || {};
  if (!targetCountryId || typeof amount !== "number") {
    return res.status(400).json({ error: "INVALID_TRANSFER" });
  }
  const value = Math.max(0, Math.floor(amount));
  if (value <= 0) {
    return res.status(400).json({ error: "INVALID_TRANSFER" });
  }
  const lobbyRow = stmt.getUserLobby.get(req.user.id);
  if (!lobbyRow || lobbyRow.lobby_id !== lobbyId) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  const state = engine.loadState(lobbyId);
  if (!state) {
    return res.status(404).json({ error: "STATE_NOT_FOUND" });
  }
  if (state.phase !== "decisions") {
    return res.status(409).json({ error: "NOT_DECISION_PHASE" });
  }
  const countryId = getLobbyPlayerCountry(lobbyId, req.user.id);
  if (!countryId) {
    return res.status(403).json({ error: "COUNTRY_NOT_SELECTED" });
  }
  const sender = state.countries.find((c) => c.id === countryId);
  if (!sender) {
    return res.status(404).json({ error: "COUNTRY_NOT_FOUND" });
  }
  if (sender.money < value) {
    return res.status(400).json({ error: "INSUFFICIENT_FUNDS" });
  }
  if (sender.id === targetCountryId) {
    return res.status(400).json({ error: "TRANSFER_SELF" });
  }
  const target = state.countries.find((c) => c.id === targetCountryId);
  if (!target) {
    return res.status(404).json({ error: "TARGET_NOT_FOUND" });
  }
  sender.money -= value;
  target.money += value;
  engine.saveState(state);
  io.to(`lobby:${lobbyId}`).emit("game:update", engine.decorateState(state));
  return res.json({ ok: true });
});

app.post("/api/game/:lobbyId/decisions/draft", authMiddleware, (req, res) => {
  const lobbyId = req.params.lobbyId;
  const lobbyRow = stmt.getUserLobby.get(req.user.id);
  if (!lobbyRow || lobbyRow.lobby_id !== lobbyId) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  const state = engine.loadState(lobbyId);
  if (!state) {
    return res.status(404).json({ error: "STATE_NOT_FOUND" });
  }
  if (state.phase !== "decisions") {
    return res.status(409).json({ error: "NOT_DECISION_PHASE" });
  }
  const countryId = getLobbyPlayerCountry(lobbyId, req.user.id);
  if (!countryId) {
    return res.status(400).json({ error: "COUNTRY_NOT_SELECTED" });
  }
  const decision = normalizeDecision(req.body || {});
  stmt.upsertDecision.run(
    lobbyId,
    state.currentRound,
    countryId,
    JSON.stringify(decision),
    null,
    now()
  );
  res.json({ ok: true });
});

app.post("/api/game/:lobbyId/decisions/confirm", authMiddleware, (req, res) => {
  const lobbyId = req.params.lobbyId;
  const lobbyRow = stmt.getUserLobby.get(req.user.id);
  if (!lobbyRow || lobbyRow.lobby_id !== lobbyId) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  const state = engine.loadState(lobbyId);
  if (!state) {
    return res.status(404).json({ error: "STATE_NOT_FOUND" });
  }
  if (state.phase !== "decisions") {
    return res.status(409).json({ error: "NOT_DECISION_PHASE" });
  }
  const countryId = getLobbyPlayerCountry(lobbyId, req.user.id);
  if (!countryId) {
    return res.status(400).json({ error: "COUNTRY_NOT_SELECTED" });
  }
  const country = state.countries.find((item) => item.id === countryId);
  if (!country) {
    return res.status(404).json({ error: "COUNTRY_NOT_FOUND" });
  }
  const nukeUnlockRound =
    state.settings?.nukeUnlockRound ?? config.economy.nukeUnlockRound;
  const decision = normalizeDecision(req.body || {});
  const { cost, errors } = validateDecision({
    country,
    decision,
    currentRound: state.currentRound,
    money: country.money,
    allCountries: state.countries,
    nukeUnlockRound,
    sanctionHistory: state.sanctionHistory || [],
  });
  if (errors.length > 0) {
    return res.status(400).json({ error: "INVALID_DECISION", details: errors });
  }
  stmt.upsertDecision.run(
    lobbyId,
    state.currentRound,
    countryId,
    JSON.stringify(decision),
    now(),
    now()
  );
  const readyCountries = getReadyCountries(lobbyId, state.currentRound);
  state.decisionsReady = readyCountries;
  engine.saveState(state);
  io.to(`lobby:${lobbyId}`).emit("game:ready", { ready: readyCountries });
  if (readyCountries.length >= state.countries.length) {
    engine.endDecisionPhaseEarly(lobbyId);
  }
  res.json({ ok: true, cost, readyCountries });
});

app.post("/api/game/:lobbyId/decisions/cancel", authMiddleware, (req, res) => {
  const lobbyId = req.params.lobbyId;
  const lobbyRow = stmt.getUserLobby.get(req.user.id);
  if (!lobbyRow || lobbyRow.lobby_id !== lobbyId) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  const state = engine.loadState(lobbyId);
  if (!state) {
    return res.status(404).json({ error: "STATE_NOT_FOUND" });
  }
  if (state.phase !== "decisions") {
    return res.status(409).json({ error: "NOT_DECISION_PHASE" });
  }
  const countryId = getLobbyPlayerCountry(lobbyId, req.user.id);
  if (!countryId) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  stmt.clearDecisionConfirm.run(now(), lobbyId, state.currentRound, countryId);
  const readyCountries = getReadyCountries(lobbyId, state.currentRound);
  state.decisionsReady = readyCountries;
  engine.saveState(state);
  io.to(`lobby:${lobbyId}`).emit("game:ready", { ready: readyCountries });
  res.json({ ok: true, readyCountries });
});

app.get("/api/game/:lobbyId/negotiations", authMiddleware, (req, res) => {
  const lobbyId = req.params.lobbyId;
  const countryId = getLobbyPlayerCountry(lobbyId, req.user.id);
  if (!countryId) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  const negotiations = stmt.listNegotiationsByCountry.all(
    lobbyId,
    countryId,
    countryId
  );
  res.json({ negotiations });
});

app.get("/api/game/:lobbyId/negotiations/:id/messages", authMiddleware, (req, res) => {
  const lobbyId = req.params.lobbyId;
  const negotiation = stmt.getNegotiation.get(req.params.id);
  if (!negotiation || negotiation.lobby_id !== lobbyId) {
    return res.status(404).json({ error: "NEGOTIATION_NOT_FOUND" });
  }
  const countryId = getLobbyPlayerCountry(lobbyId, req.user.id);
  if (!countryId) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  if (negotiation.country_a_id !== countryId && negotiation.country_b_id !== countryId) {
    return res.status(403).json({ error: "NOT_ALLOWED" });
  }
  const messages = stmt.listNegotiationMessages
    .all(lobbyId, negotiation.id)
    .reverse();
  res.json({ messages });
});

app.post("/api/game/:lobbyId/negotiations/request", authMiddleware, (req, res) => {
  const lobbyId = req.params.lobbyId;
  const { targetCountryId } = req.body;
  const countryId = getLobbyPlayerCountry(lobbyId, req.user.id);
  if (!countryId) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  if (!targetCountryId || targetCountryId === countryId) {
    return res.status(400).json({ error: "INVALID_TARGET" });
  }
  const state = engine.loadState(lobbyId);
  if (!state) {
    return res.status(400).json({ error: "GAME_NOT_STARTED" });
  }
  const roundNumber = state.currentRound || 1;
  const existing = stmt.getNegotiationForRoundBetween.get(
    lobbyId,
    roundNumber,
    countryId,
    targetCountryId,
    targetCountryId,
    countryId
  );
  if (existing) {
    if (existing.status === "pending") {
      return res.status(409).json({ error: "NEGOTIATION_PENDING" });
    }
    if (existing.status === "rejected") {
      return res.status(409).json({ error: "NEGOTIATION_REJECTED" });
    }
    return res.status(409).json({ error: "NEGOTIATION_ALREADY" });
  }
  const negotiationId = uuidv4();
  stmt.insertNegotiation.run(
    negotiationId,
    lobbyId,
    countryId,
    targetCountryId,
    "pending",
    roundNumber,
    now(),
    now()
  );
  const targetLeader = getCountryLeader(lobbyId, targetCountryId);
  if (targetLeader) {
    io.to(`user:${targetLeader}`).emit("negotiation:request", {
      id: negotiationId,
      fromCountryId: countryId,
    });
  }
  res.json({ ok: true, negotiationId });
});

app.post("/api/game/:lobbyId/negotiations/:id/accept", authMiddleware, (req, res) => {
  const lobbyId = req.params.lobbyId;
  const negotiation = stmt.getNegotiation.get(req.params.id);
  if (!negotiation || negotiation.lobby_id !== lobbyId) {
    return res.status(404).json({ error: "NEGOTIATION_NOT_FOUND" });
  }
  const countryId = getLobbyPlayerCountry(lobbyId, req.user.id);
  if (!countryId) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  if (negotiation.country_b_id !== countryId) {
    return res.status(403).json({ error: "NOT_ALLOWED" });
  }
  stmt.updateNegotiation.run("active", now(), negotiation.id);
  io.to(`lobby:${lobbyId}`).emit("negotiation:accepted", {
    id: negotiation.id,
    countryA: negotiation.country_a_id,
    countryB: negotiation.country_b_id,
  });
  res.json({ ok: true });
});

app.post("/api/game/:lobbyId/negotiations/:id/reject", authMiddleware, (req, res) => {
  const lobbyId = req.params.lobbyId;
  const negotiation = stmt.getNegotiation.get(req.params.id);
  if (!negotiation || negotiation.lobby_id !== lobbyId) {
    return res.status(404).json({ error: "NEGOTIATION_NOT_FOUND" });
  }
  const countryId = getLobbyPlayerCountry(lobbyId, req.user.id);
  if (!countryId) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  if (negotiation.country_b_id !== countryId) {
    return res.status(403).json({ error: "NOT_ALLOWED" });
  }
  stmt.updateNegotiation.run("rejected", now(), negotiation.id);
  res.json({ ok: true });
});

app.post("/api/game/:lobbyId/negotiations/:id/end", authMiddleware, (req, res) => {
  const lobbyId = req.params.lobbyId;
  const negotiation = stmt.getNegotiation.get(req.params.id);
  if (!negotiation || negotiation.lobby_id !== lobbyId) {
    return res.status(404).json({ error: "NEGOTIATION_NOT_FOUND" });
  }
  const countryId = getLobbyPlayerCountry(lobbyId, req.user.id);
  if (!countryId) {
    return res.status(403).json({ error: "NOT_IN_LOBBY" });
  }
  if (negotiation.country_a_id !== countryId && negotiation.country_b_id !== countryId) {
    return res.status(403).json({ error: "NOT_ALLOWED" });
  }
  stmt.updateNegotiation.run("ended", now(), negotiation.id);
  io.to(`negotiation:${negotiation.id}`).emit("negotiation:ended", {
    id: negotiation.id,
    countryA: negotiation.country_a_id,
    countryB: negotiation.country_b_id,
    endedBy: countryId,
  });
  io.to(`lobby:${lobbyId}`).emit("negotiation:ended", {
    id: negotiation.id,
    countryA: negotiation.country_a_id,
    countryB: negotiation.country_b_id,
    endedBy: countryId,
  });
  res.json({ ok: true });
});

const distPath = path.join(__dirname, "..", "..", "dist");
const indexPath = path.join(distPath, "index.html");
if (fs.existsSync(indexPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
      return next();
    }
    return res.sendFile(indexPath);
  });
}

io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization || "").replace("Bearer ", "");
    if (!token) {
      return next(new Error("AUTH_REQUIRED"));
    }
    const payload = jwt.verify(token, config.jwtSecret);
    const user = getUserById(payload.sub);
    if (!user) {
      return next(new Error("USER_NOT_FOUND"));
    }
    socket.user = user;
    return next();
  } catch (error) {
    return next(new Error("INVALID_TOKEN"));
  }
});

io.on("connection", (socket) => {
  const user = socket.user;
  socket.join(`user:${user.id}`);
  socket.join("site");

  const lobbyRow = stmt.getUserLobby.get(user.id);
  if (lobbyRow) {
    socket.join(`lobby:${lobbyRow.lobby_id}`);
  }

  socket.on("lobby:join", (payload, cb) => {
    const lobbyId = payload?.lobbyId;
    if (!lobbyId) {
      cb?.({ error: "MISSING_LOBBY_ID" });
      return;
    }
    const playerLobby = stmt.getUserLobby.get(user.id);
    if (!playerLobby || playerLobby.lobby_id !== lobbyId) {
      cb?.({ error: "NOT_IN_LOBBY" });
      return;
    }
    socket.join(`lobby:${lobbyId}`);
    cb?.({ ok: true });
  });

  socket.on("chat:site", (payload, cb) => {
    const message = sanitizeMessage(
      payload?.message || "",
      GAME_LIMITS.maxMessageLength
    );
    if (!message) {
      cb?.({ error: "INVALID_MESSAGE" });
      return;
    }
    stmt.insertMessage.run(
      SITE_LOBBY_ID,
      "site",
      user.id,
      null,
      null,
      null,
      null,
      message,
      now()
    );
    io.to("site").emit("chat:site", {
      userId: user.id,
      nickname: user.nickname,
      avatarEmoji: user.avatar_emoji,
      message,
      createdAt: now(),
    });
    cb?.({ ok: true });
  });

  socket.on("friend:message", (payload, cb) => {
    const targetUserId = Number(payload?.targetUserId);
    const message = sanitizeMessage(
      payload?.message || "",
      GAME_LIMITS.maxMessageLength
    );
    if (!Number.isFinite(targetUserId) || !message) {
      cb?.({ error: "INVALID_MESSAGE" });
      return;
    }
    if (!areFriends(user.id, targetUserId)) {
      cb?.({ error: "NOT_FRIENDS" });
      return;
    }
    if (isUserInActiveGame(user.id) || isUserInActiveGame(targetUserId)) {
      cb?.({ error: "IN_GAME" });
      return;
    }
    const createdAt = now();
    stmt.insertFriendMessage.run(user.id, targetUserId, message, createdAt);
    const payloadOut = {
      senderUserId: user.id,
      recipientUserId: targetUserId,
      content: message,
      createdAt,
    };
    io.to(`user:${user.id}`).emit("friend:message", payloadOut);
    io.to(`user:${targetUserId}`).emit("friend:message", payloadOut);
    cb?.({ ok: true });
  });

  socket.on("chat:global", (payload, cb) => {
    const message = sanitizeMessage(
      payload?.message || "",
      GAME_LIMITS.maxMessageLength
    );
    const lobbyId = payload?.lobbyId;
    if (!message || !lobbyId) {
      cb?.({ error: "INVALID_MESSAGE" });
      return;
    }
    const playerLobby = stmt.getUserLobby.get(user.id);
    if (!playerLobby || playerLobby.lobby_id !== lobbyId) {
      cb?.({ error: "NOT_IN_LOBBY" });
      return;
    }
    const state = engine.loadState(lobbyId);
    if (state && state.phase !== "discussion") {
      cb?.({ error: "CHAT_LOCKED" });
      return;
    }
    const countryId = getLobbyPlayerCountry(lobbyId, user.id);
    const roundNumber = state?.currentRound || 0;
    stmt.insertMessage.run(
      lobbyId,
      "global",
      user.id,
      countryId,
      null,
      null,
      roundNumber,
      message,
      now()
    );
    io.to(`lobby:${lobbyId}`).emit("chat:global", {
      lobbyId,
      userId: user.id,
      nickname: user.nickname,
      avatarEmoji: user.avatar_emoji,
      countryId,
      message,
      round: roundNumber,
      createdAt: now(),
    });
    cb?.({ ok: true });
  });

  socket.on("chat:private", (payload, cb) => {
    const message = sanitizeMessage(
      payload?.message || "",
      GAME_LIMITS.maxMessageLength
    );
    const lobbyId = payload?.lobbyId;
    const targetCountryId = payload?.targetCountryId;
    if (!message || !lobbyId || !targetCountryId) {
      cb?.({ error: "INVALID_MESSAGE" });
      return;
    }
    const playerLobby = stmt.getUserLobby.get(user.id);
    if (!playerLobby || playerLobby.lobby_id !== lobbyId) {
      cb?.({ error: "NOT_IN_LOBBY" });
      return;
    }
    const senderCountryId = getLobbyPlayerCountry(lobbyId, user.id);
    if (!senderCountryId) {
      cb?.({ error: "COUNTRY_NOT_SELECTED" });
      return;
    }
    const state = engine.loadState(lobbyId);
    const roundNumber = state?.currentRound || 0;
    const targetLeader = getCountryLeader(lobbyId, targetCountryId);
    if (!targetLeader) {
      cb?.({ error: "TARGET_NOT_FOUND" });
      return;
    }
    stmt.insertMessage.run(
      lobbyId,
      "private",
      user.id,
      senderCountryId,
      targetCountryId,
      null,
      roundNumber,
      message,
      now()
    );
    const payloadOut = {
      lobbyId,
      fromCountryId: senderCountryId,
      toCountryId: targetCountryId,
      message,
      round: roundNumber,
      createdAt: now(),
    };
    io.to(`user:${targetLeader}`).emit("chat:private", payloadOut);
    socket.emit("chat:private", payloadOut);
    cb?.({ ok: true });
  });

  socket.on("negotiation:join", (payload, cb) => {
    const negotiationId = payload?.negotiationId;
    if (!negotiationId) {
      cb?.({ error: "MISSING_NEGOTIATION" });
      return;
    }
    socket.join(`negotiation:${negotiationId}`);
    cb?.({ ok: true });
  });

  socket.on("chat:negotiation", (payload, cb) => {
    const negotiationId = payload?.negotiationId;
    const message = sanitizeMessage(
      payload?.message || "",
      GAME_LIMITS.maxMessageLength
    );
    if (!negotiationId || !message) {
      cb?.({ error: "INVALID_MESSAGE" });
      return;
    }
    const negotiation = stmt.getNegotiation.get(negotiationId);
    if (!negotiation || negotiation.status !== "active") {
      cb?.({ error: "NEGOTIATION_NOT_ACTIVE" });
      return;
    }
    const lobbyId = negotiation.lobby_id;
    const countryId = getLobbyPlayerCountry(lobbyId, user.id);
    if (!countryId) {
      cb?.({ error: "NOT_IN_LOBBY" });
      return;
    }
    if (countryId !== negotiation.country_a_id && countryId !== negotiation.country_b_id) {
      cb?.({ error: "NOT_ALLOWED" });
      return;
    }
    const state = engine.loadState(lobbyId);
    const roundNumber = state?.currentRound || 0;
    stmt.insertMessage.run(
      lobbyId,
      "negotiation",
      user.id,
      countryId,
      null,
      negotiationId,
      roundNumber,
      message,
      now()
    );
    io.to(`negotiation:${negotiationId}`).emit("chat:negotiation", {
      negotiationId,
      fromCountryId: countryId,
      message,
      round: roundNumber,
      createdAt: now(),
    });
    cb?.({ ok: true });
  });

  // ── Pause voting (unanimous) ──────────────────────────────────────────────
  socket.on("game:pause-vote", (payload, cb) => {
    const lobbyId = payload?.lobbyId;
    const vote = Boolean(payload?.vote); // true = want pause, false = want resume
    if (!lobbyId) { cb?.({ error: "MISSING_LOBBY" }); return; }

    const countryId = getLobbyPlayerCountry(lobbyId, user.id);
    if (!countryId) { cb?.({ error: "NOT_IN_LOBBY" }); return; }

    const state = engine.loadState(lobbyId);
    if (!state || state.phase === "finished" || state.phase === "results") {
      cb?.({ error: "INVALID_PHASE" }); return;
    }

    if (!state.pauseVotes) state.pauseVotes = {};
    if (!state.pausedAt) state.pausedAt = null;

    if (vote) {
      state.pauseVotes[countryId] = true;
    } else {
      delete state.pauseVotes[countryId];
    }

    const activePlayers = state.countries
      .filter(c => !c.cities.every(ci => ci.destroyed))
      .map(c => c.id);
    const allVoted = activePlayers.length > 0 &&
      activePlayers.every(id => state.pauseVotes[id]);

    if (allVoted && !state.pausedAt) {
      // Pause: freeze timer
      state.pausedAt = now();
      state.pauseRemainingMs = Math.max(0, state.phaseEndsAt - now());
      engine.clearTimer(lobbyId);
    } else if (!allVoted && state.pausedAt) {
      // Resume: restore remaining time
      const remaining = state.pauseRemainingMs ?? 30000;
      state.phaseEndsAt = now() + remaining;
      state.pausedAt = null;
      state.pauseRemainingMs = null;
      engine.saveState(state);
      engine.scheduleNext(state);
    }

    engine.saveState(state);

    io.to(`lobby:${lobbyId}`).emit("game:pause-state", {
      paused: Boolean(state.pausedAt),
      votes: state.pauseVotes,
      activePlayers,
    });

    cb?.({ ok: true });
  });
});


engine.restoreActiveGames();

// ── SPA catch-all: return index.html for any non-API route ───────────────────
const INDEX_HTML = path.join(__dirname, "..", "public", "index.html");
app.get(/^(?!\/api\/).*/, (req, res) => {
  if (fs.existsSync(INDEX_HTML)) {
    res.sendFile(INDEX_HTML);
  } else {
    res.status(404).send("Not found");
  }
});

server.listen(config.port, () => {
  console.log(`Backend running on :${config.port}`);
});
