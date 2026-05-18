import { v4 as uuidv4 } from "uuid";
import { db } from "./db.js";
import { config } from "./config.js";
import { COUNTRY_TEMPLATES } from "./constants.js";
import {
  now,
  averageLife,
  calcCityIncome,
  calcLifeUpgradeCost,
  calcShieldCost,
  safeJsonParse,
} from "./utils.js";
import { normalizeDecision, calculateDecisionCost, applyDecisionToCountry } from "./decisions.js";

const lobbyRoom = (lobbyId) => `lobby:${lobbyId}`;

export class GameEngine {
  constructor({ io }) {
    this.io = io;
    this.timers = new Map();
    this.locks = new Set();

    this.stmt = {
      getLobby: db.prepare("SELECT * FROM lobbies WHERE id = ?"),
      updateLobbyStatus: db.prepare(
        "UPDATE lobbies SET status = ?, updated_at = ? WHERE id = ?"
      ),
      listLobbyPlayers: db.prepare(
        "SELECT * FROM lobby_players WHERE lobby_id = ?"
      ),
      clearLobbyPlayers: db.prepare(
        "DELETE FROM lobby_players WHERE lobby_id = ?"
      ),
      getState: db.prepare(
        "SELECT state_json FROM game_state WHERE lobby_id = ?"
      ),
      upsertState: db.prepare(
        "INSERT INTO game_state (lobby_id, state_json, updated_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(lobby_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at"
      ),
      getDecisions: db.prepare(
        "SELECT * FROM round_decisions WHERE lobby_id = ? AND round_number = ? AND confirmed_at IS NOT NULL"
      ),
      getNukeAttacks: db.prepare(
        "SELECT * FROM nuke_attacks WHERE lobby_id = ? AND round_number = ?"
      ),
      insertNukeAttack: db.prepare(
        "INSERT INTO nuke_attacks (lobby_id, round_number, attacker_country_id, target_country_id, target_city_id, bombs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ),
      clearNukeAttacks: db.prepare(
        "DELETE FROM nuke_attacks WHERE lobby_id = ? AND round_number = ?"
      ),
    };
  }

  loadState(lobbyId) {
    const row = this.stmt.getState.get(lobbyId);
    if (!row) return null;
    return safeJsonParse(row.state_json, null);
  }

  saveState(state) {
    this.stmt.upsertState.run(state.lobbyId, JSON.stringify(state), now());
  }

  decorateState(state) {
    if (!state) return null;
    const decorated = {
      ...state,
      countries: state.countries.map((country) => ({
        ...country,
        cities: country.cities.map((city) => ({
          ...city,
          income: calcCityIncome(city),
          shieldCost: calcShieldCost(city),
          lifeUpgradeCost: calcLifeUpgradeCost(city),
        })),
      })),
    };
    return decorated;
  }

  restoreActiveGames() {
    const active = db
      .prepare("SELECT id FROM lobbies WHERE status = 'in_progress'")
      .all();
    for (const lobby of active) {
      const state = this.loadState(lobby.id);
      if (!state) continue;
      if (state.phase === "finished") continue;
      this.scheduleNext(state);
    }
  }

  scheduleNext(state) {
    const delay = Math.max(0, state.phaseEndsAt - now());
    if (this.timers.has(state.lobbyId)) {
      clearTimeout(this.timers.get(state.lobbyId));
    }
    const timer = setTimeout(() => this.advancePhase(state.lobbyId), delay);
    this.timers.set(state.lobbyId, timer);
  }

  startGame(lobbyId) {
    const lobby = this.stmt.getLobby.get(lobbyId);
    if (!lobby) {
      throw new Error("LOBBY_NOT_FOUND");
    }
    if (lobby.status !== "waiting") {
      throw new Error("LOBBY_NOT_READY");
    }

    const players = this.stmt.listLobbyPlayers.all(lobbyId);
    if (players.length < 2 || players.length > lobby.max_teams) {
      throw new Error("INVALID_PLAYER_COUNT");
    }
    if (players.some((player) => !player.country_id)) {
      throw new Error("COUNTRY_NOT_SELECTED");
    }
    const used = new Set();
    for (const player of players) {
      if (used.has(player.country_id)) {
        throw new Error("COUNTRY_DUPLICATE");
      }
      used.add(player.country_id);
    }

    const countries = players.map((player) => {
      const template = COUNTRY_TEMPLATES.find(
        (item) => item.id === player.country_id
      );
      if (!template) {
        throw new Error("COUNTRY_INVALID");
      }
      const cities = template.cities.map((city) => ({ ...city }));
      const avgLife = averageLife(cities);
      return {
        id: template.id,
        name: template.name,
        flag: template.flag,
        leaderUserId: player.user_id,
        money: config.economy.startingMoney,
        nukesReady: 0,
        nukesQueued: 0,
        cities,
        stats: {
          avgLife,
          lastDelta: 0,
        },
        history: [{ round: 0, avgLife }],
      };
    });

    const state = {
      lobbyId,
      totalRounds: lobby.total_rounds,
      currentRound: 1,
      phase: "discussion",
      phaseEndsAt: now() + config.phases.discussionMs,
      countries,
      lastRoundSummary: null,
    };

    this.saveState(state);
    this.stmt.updateLobbyStatus.run("in_progress", now(), lobbyId);

    this.io.to(lobbyRoom(lobbyId)).emit("game:started", this.decorateState(state));
    this.scheduleNext(state);

    return state;
  }

  advancePhase(lobbyId) {
    if (this.locks.has(lobbyId)) return;
    this.locks.add(lobbyId);
    try {
      let state = this.loadState(lobbyId);
      if (!state) {
        this.locks.delete(lobbyId);
        return;
      }

      const currentTime = now();
      if (state.phaseEndsAt > currentTime) {
        this.scheduleNext(state);
        this.locks.delete(lobbyId);
        return;
      }

      if (state.phase === "discussion") {
        state.phase = "decisions";
        state.phaseEndsAt = currentTime + config.phases.decisionsMs;
        this.saveState(state);
        this.io.to(lobbyRoom(lobbyId)).emit("game:phase", {
          phase: state.phase,
          phaseEndsAt: state.phaseEndsAt,
        });
        this.io.to(lobbyRoom(lobbyId)).emit("game:update", this.decorateState(state));
        this.scheduleNext(state);
      } else if (state.phase === "decisions") {
        state = this.applyRound(state);
        this.saveState(state);
        this.io.to(lobbyRoom(lobbyId)).emit("game:update", this.decorateState(state));
        if (state.lastRoundSummary) {
          this.io
            .to(lobbyRoom(lobbyId))
            .emit("game:round-summary", state.lastRoundSummary);
        }
        if (state.phase !== "finished") {
          this.scheduleNext(state);
        }
      } else if (state.phase === "summary") {
        state.phase = "discussion";
        state.phaseEndsAt = currentTime + config.phases.discussionMs;
        this.saveState(state);
        this.io.to(lobbyRoom(lobbyId)).emit("game:phase", {
          phase: state.phase,
          phaseEndsAt: state.phaseEndsAt,
        });
        this.io.to(lobbyRoom(lobbyId)).emit("game:update", this.decorateState(state));
        this.scheduleNext(state);
      }

      if (state.phase !== "finished" && state.phaseEndsAt <= now()) {
        setTimeout(() => this.advancePhase(lobbyId), 0);
      }
    } finally {
      this.locks.delete(lobbyId);
    }
  }

  applyRound(state) {
    const round = state.currentRound;
    const decisions = this.stmt.getDecisions.all(state.lobbyId, round);

    for (const row of decisions) {
      const country = state.countries.find(
        (item) => item.id === row.country_id
      );
      if (!country) continue;
      const decision = normalizeDecision(safeJsonParse(row.decisions_json, {}));
      const { cost, errors } = calculateDecisionCost(country, decision);
      if (errors.length > 0 || cost > country.money) {
        continue;
      }
      country.money -= cost;
      const { nukesLaunched } = applyDecisionToCountry({
        country,
        decision,
        currentRound: round,
      });
      for (const launch of nukesLaunched) {
        this.stmt.insertNukeAttack.run(
          state.lobbyId,
          round,
          country.id,
          launch.targetCountryId,
          launch.targetCityId,
          launch.bombs,
          now()
        );
      }
    }

    const attacks = this.stmt.getNukeAttacks.all(state.lobbyId, round);
    const impacts = [];
    for (const attack of attacks) {
      const target = state.countries.find(
        (item) => item.id === attack.target_country_id
      );
      if (!target) continue;
      const city = target.cities.find((item) => item.id === attack.target_city_id);
      if (!city || city.destroyed) continue;
      let remaining = attack.bombs;
      if (city.shields > 0) {
        const absorbed = Math.min(city.shields, remaining);
        city.shields -= absorbed;
        remaining -= absorbed;
      }
      if (remaining > 0) {
        city.lifeLevel = Math.max(0, city.lifeLevel - remaining * 2);
        if (city.lifeLevel === 0) {
          city.destroyed = true;
        }
      }
      impacts.push({
        targetCountryId: target.id,
        targetCityId: city.id,
        bombs: attack.bombs,
      });
    }

    if (attacks.length > 0) {
      this.stmt.clearNukeAttacks.run(state.lobbyId, round);
    }

    for (const country of state.countries) {
      for (const city of country.cities) {
        if (city.destroyed) continue;
        country.money += calcCityIncome(city);
      }
      if (country.nukesQueued > 0) {
        country.nukesReady += country.nukesQueued;
        country.nukesQueued = 0;
      }
    }

    const summary = {
      round,
      impacts,
      countries: state.countries.map((country) => {
        const previousAvg = country.stats.avgLife;
        const newAvg = averageLife(country.cities);
        const delta = Number((newAvg - previousAvg).toFixed(2));
        country.stats.avgLife = newAvg;
        country.stats.lastDelta = delta;
        country.history.push({ round, avgLife: newAvg, delta });
        return {
          countryId: country.id,
          avgLife: newAvg,
          delta,
        };
      }),
    };

    state.lastRoundSummary = summary;

    if (state.currentRound >= state.totalRounds) {
      state.phase = "finished";
      state.phaseEndsAt = now();
      this.stmt.updateLobbyStatus.run("finished", now(), state.lobbyId);
      this.stmt.clearLobbyPlayers.run(state.lobbyId);
      this.io.to(lobbyRoom(state.lobbyId)).emit("game:finished", summary);
      return state;
    }

    state.currentRound += 1;
    state.phase = "summary";
    state.phaseEndsAt = now() + config.phases.summaryMs;
    return state;
  }
}
