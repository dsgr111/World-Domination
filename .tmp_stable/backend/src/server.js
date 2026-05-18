import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import jwt from "jsonwebtoken";
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

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: true, credentials: true },
});

const engine = new GameEngine({ io });

const stmt = {
  getUserByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  getUserByNickname: db.prepare("SELECT * FROM users WHERE nickname = ?"),
  insertUser: db.prepare(
    "INSERT INTO users (email, nickname, password_hash, avatar_emoji, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ),
  updateUser: db.prepare(
    "UPDATE users SET email = ?, nickname = ?, password_hash = ?, updated_at = ? WHERE id = ?"
  ),
  updateUserNoPassword: db.prepare(
    "UPDATE users SET email = ?, nickname = ?, updated_at = ? WHERE id = ?"
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
  getFriendRequest: db.prepare(
    "SELECT * FROM friend_requests WHERE id = ?"
  ),
  insertFriendRequest: db.prepare(
    "INSERT INTO friend_requests (requester_id, addressee_id, status, created_at) VALUES (?, ?, 'pending', ?)"
  ),
  updateFriendRequestStatus: db.prepare(
    "UPDATE friend_requests SET status = ?, responded_at = ? WHERE id = ?"
  ),

  insertSupportTicket: db.prepare(
    "INSERT INTO support_tickets (user_id, subject, message, status, created_at) VALUES (?, ?, ?, 'open', ?)"
  ),
  listSupportTickets: db.prepare(
    "SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC"
  ),

  insertLobby: db.prepare(
    "INSERT INTO lobbies (id, name, host_user_id, password_hash, max_teams, total_rounds, status, invite_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?, ?, ?)"
  ),
  updateLobby: db.prepare(
    "UPDATE lobbies SET name = ?, max_teams = ?, total_rounds = ?, updated_at = ? WHERE id = ?"
  ),
  deleteLobby: db.prepare("DELETE FROM lobbies WHERE id = ?"),
  getLobbyById: db.prepare("SELECT * FROM lobbies WHERE id = ?"),
  listLobbies: db.prepare(
    "SELECT l.*, (SELECT COUNT(*) FROM lobby_players lp WHERE lp.lobby_id = l.id) as player_count FROM lobbies l WHERE l.status = 'waiting' ORDER BY l.created_at DESC"
  ),
  insertLobbyPlayer: db.prepare(
    "INSERT INTO lobby_players (lobby_id, user_id, country_id, joined_at) VALUES (?, ?, ?, ?)"
  ),
  removeLobbyPlayer: db.prepare(
    "DELETE FROM lobby_players WHERE lobby_id = ? AND user_id = ?"
  ),
  updateLobbyHost: db.prepare(
    "UPDATE lobbies SET host_user_id = ?, updated_at = ? WHERE id = ?"
  ),
  getUserLobby: db.prepare(
    "SELECT lobby_id FROM lobby_players WHERE user_id = ?"
  ),
  listLobbyPlayers: db.prepare(
    "SELECT lp.user_id, lp.country_id, u.nickname, u.avatar_emoji FROM lobby_players lp JOIN users u ON u.id = lp.user_id WHERE lp.lobby_id = ?"
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
    "INSERT INTO messages (lobby_id, type, sender_user_id, sender_country_id, target_country_id, negotiation_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ),
  listMessages: db.prepare(
    "SELECT * FROM messages WHERE lobby_id = ? AND type = ? ORDER BY created_at DESC LIMIT 100"
  ),

  insertNegotiation: db.prepare(
    "INSERT INTO negotiations (id, lobby_id, country_a_id, country_b_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),
  updateNegotiation: db.prepare(
    "UPDATE negotiations SET status = ?, updated_at = ? WHERE id = ?"
  ),
  getNegotiation: db.prepare("SELECT * FROM negotiations WHERE id = ?"),
  listNegotiationsByCountry: db.prepare(
    "SELECT * FROM negotiations WHERE lobby_id = ? AND (country_a_id = ? OR country_b_id = ?)"
  ),
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

const buildInviteLink = (lobbyId, inviteCode) => {
  return `${config.appBaseUrl.replace(/\\/$/, "")}/lobby?join=${lobbyId}&code=${inviteCode}`;
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

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, nickname, avatarEmoji } = req.body;
    if (!email || !password || !nickname || !avatarEmoji) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }
    if (!AVATAR_EMOJIS.includes(avatarEmoji)) {
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
    const result = stmt.insertUser.run(
      normalizedEmail,
      nickname,
      passwordHash,
      avatarEmoji,
      createdAt,
      createdAt
    );
    const user = {
      id: result.lastInsertRowid,
      email: normalizedEmail,
      nickname,
      avatar_emoji: avatarEmoji,
    };
    const token = signToken(user);
    return res.json({ token, user });
  } catch (error) {
    return res.status(500).json({ error: "REGISTER_FAILED" });
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

app.patch("/api/profile", authMiddleware, async (req, res) => {
  const { email, nickname, password } = req.body;
  const user = getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }

  const newEmail = email ? normalizeEmail(email) : user.email;
  const newNickname = nickname || user.nickname;

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
      passwordHash,
      now(),
      req.user.id
    );
  } else {
    stmt.updateUserNoPassword.run(newEmail, newNickname, now(), req.user.id);
  }

  return res.json({
    user: {
      id: req.user.id,
      email: newEmail,
      nickname: newNickname,
      avatar_emoji: user.avatar_emoji,
    },
  });
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
  try {
    stmt.insertFriendRequest.run(req.user.id, target.id, now());
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

app.get("/api/lobbies", authMiddleware, (req, res) => {
  const lobbies = stmt.listLobbies.all().map((lobby) => ({
    id: lobby.id,
    name: lobby.name,
    status: lobby.status,
    maxTeams: lobby.max_teams,
    totalRounds: lobby.total_rounds,
    playersCount: lobby.player_count,
    hasPassword: Boolean(lobby.password_hash),
  }));
  res.json({ lobbies });
});

app.post("/api/lobbies", authMiddleware, async (req, res) => {
  const { name, maxTeams, totalRounds, password } = req.body;
  if (!name || !maxTeams || !totalRounds) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }
  if (maxTeams < GAME_LIMITS.minTeams || maxTeams > GAME_LIMITS.maxTeams) {
    return res.status(400).json({ error: "INVALID_TEAM_COUNT" });
  }
  if (totalRounds < GAME_LIMITS.minRounds || totalRounds > GAME_LIMITS.maxRounds) {
    return res.status(400).json({ error: "INVALID_ROUNDS" });
  }
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
  if (lobby.password_hash) {
    const ok = await verifyPassword(password || "", lobby.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "INVALID_PASSWORD" });
    }
  }
  stmt.insertLobbyPlayer.run(lobbyId, req.user.id, null, now());
  res.json({ ok: true });
});

app.post("/api/lobbies/leave", authMiddleware, (req, res) => {
  const lobbyRow = stmt.getUserLobby.get(req.user.id);
  if (!lobbyRow) {
    return res.status(404).json({ error: "NOT_IN_LOBBY" });
  }
  const lobby = stmt.getLobbyById.get(lobbyRow.lobby_id);
  if (!lobby) {
    return res.status(404).json({ error: "LOBBY_NOT_FOUND" });
  }
  if (lobby.status !== "waiting") {
    return res.status(409).json({ error: "CANNOT_LEAVE_ACTIVE_GAME" });
  }
  stmt.removeLobbyPlayer.run(lobby.id, req.user.id);
  const remaining = stmt.listLobbyPlayers.all(lobby.id);
  if (remaining.length === 0) {
    stmt.deleteLobby.run(lobby.id);
  } else if (lobby.host_user_id === req.user.id) {
    stmt.updateLobbyHost.run(remaining[0].user_id, now(), lobby.id);
  }
  res.json({ ok: true });
});

app.get("/api/lobbies/:id", authMiddleware, (req, res) => {
  const lobby = stmt.getLobbyById.get(req.params.id);
  if (!lobby) {
    return res.status(404).json({ error: "LOBBY_NOT_FOUND" });
  }
  const players = stmt.listLobbyPlayers.all(lobby.id);
  res.json({
    lobby: {
      id: lobby.id,
      name: lobby.name,
      status: lobby.status,
      maxTeams: lobby.max_teams,
      totalRounds: lobby.total_rounds,
      hostUserId: lobby.host_user_id,
      inviteCode: lobby.invite_code,
      inviteLink: buildInviteLink(lobby.id, lobby.invite_code),
      players,
    },
  });
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
  try {
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

app.get("/api/game/:lobbyId/state", authMiddleware, (req, res) => {
  const lobbyId = req.params.lobbyId;
  const state = engine.loadState(lobbyId);
  if (!state) {
    return res.status(404).json({ error: "STATE_NOT_FOUND" });
  }
  res.json({ state: engine.decorateState(state) });
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
  const decision = normalizeDecision(req.body || {});
  const { cost, errors } = validateDecision({
    country,
    decision,
    currentRound: state.currentRound,
    money: country.money,
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
  res.json({ ok: true, cost });
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
  const negotiationId = uuidv4();
  stmt.insertNegotiation.run(
    negotiationId,
    lobbyId,
    countryId,
    targetCountryId,
    "pending",
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
  res.json({ ok: true });
});

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
    stmt.insertMessage.run(
      lobbyId,
      "global",
      user.id,
      countryId,
      null,
      null,
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
      message,
      now()
    );
    const payloadOut = {
      lobbyId,
      fromCountryId: senderCountryId,
      toCountryId: targetCountryId,
      message,
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
    stmt.insertMessage.run(
      lobbyId,
      "negotiation",
      user.id,
      countryId,
      null,
      negotiationId,
      message,
      now()
    );
    io.to(`negotiation:${negotiationId}`).emit("chat:negotiation", {
      negotiationId,
      fromCountryId: countryId,
      message,
      createdAt: now(),
    });
    cb?.({ ok: true });
  });
});

engine.restoreActiveGames();

server.listen(config.port, () => {
  console.log(`Backend running on :${config.port}`);
});
