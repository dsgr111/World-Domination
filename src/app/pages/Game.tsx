
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, API_URL, ApiError } from "../lib/api";
import {
  clearAuth,
  clearLobbyId,
  getAuth,
  getLobbyId,
  setInGame,
  setInLobby,
} from "../lib/auth";
import { calcLifeUpgradeCostRange } from "../lib/economy";
import { AppBrandLink } from "../components/AppBrandLink";

interface CityState {
  id: string;
  name: string;
  baseIncome: number;
  lifeLevel: number;
  shields: number;
  destroyed: boolean;
  income: number;
  shieldCost: number;
  lifeUpgradeCost: number;
}

interface CountryState {
  id: string;
  name: string;
  flag: string;
  leaderUserId: number;
  money: number;
  nukesReady: number;
  nukesQueued: number;
  cities: CityState[];
  stats: { avgLife: number; lastDelta: number };
  history: { round: number; avgLife: number; delta?: number }[];
}

interface GameState {
  lobbyId: string;
  totalRounds: number;
  currentRound: number;
  phase: "discussion" | "decisions" | "summary" | "finished";
  phaseEndsAt: number;
  countries: CountryState[];
  settings?: {
    phases?: { discussionMs: number; decisionsMs: number; summaryMs?: number };
    revealNukes?: boolean;
    incomeMultiplier?: number;
    nukeUnlockRound?: number;
  };
  lastRoundSummary?: any;
  decisionsReady?: string[];
  pendingSanctions?: {
    fromCountryId: string;
    toCountryId: string;
    roundIssued: number;
    incomePenaltyPercent: number;
  }[];
  sanctionHistory?: {
    fromCountryId: string;
    toCountryId: string;
    roundIssued: number;
    incomePenaltyPercent: number;
  }[];
}

interface LobbyPlayer {
  user_id: number;
  country_id: string | null;
  nickname: string;
  avatar_emoji: string;
}

interface ChatMessage {
  player: string;
  avatar: string;
  flag: string;
  country: string;
  text: string;
  userId?: number;
  round?: number;
  time?: number;
  destroyed?: boolean;
}

interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  round: number;
  expiresAt: number;
  answered: boolean;
}

interface Negotiation {
  id: string;
  lobby_id: string;
  country_a_id: string;
  country_b_id: string;
  status: "pending" | "active" | "rejected" | "ended";
  created_at: number;
  updated_at: number;
}

interface DraftLaunch {
  id: string;
  targetCountryId: string;
  targetCityId: string;
  bombs: number;
}

export function Game() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [userAvatar, setUserAvatar] = useState<string>("👑");
  const [state, setState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [timer, setTimer] = useState(0);
  const [nukeCost, setNukeCost] = useState(2000);
  const [nukeUnlockRound, setNukeUnlockRound] = useState(3);
  const [draftLifeTargets, setDraftLifeTargets] = useState<Record<string, number>>({});
  const [draftShields, setDraftShields] = useState<Record<string, number>>({});
  const [draftNukes, setDraftNukes] = useState(0);
  const [draftLaunches, setDraftLaunches] = useState<DraftLaunch[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [decisionsLocked, setDecisionsLocked] = useState(false);
  const [chatMode, setChatMode] = useState<"global" | "private">("global");
  const [privateTargetId, setPrivateTargetId] = useState("");
  const [privateChats, setPrivateChats] = useState<Record<string, ChatMessage[]>>({});
  const [privateUnread, setPrivateUnread] = useState<Record<string, number>>({});
  const [privateLastActivity, setPrivateLastActivity] = useState<Record<string, number>>({});
  const [showStats, setShowStats] = useState(false);
  const [summaryRoundShown, setSummaryRoundShown] = useState<number | null>(null);
  const [pendingVictory, setPendingVictory] = useState(false);
  const [finalRankings, setFinalRankings] = useState<any[] | null>(null);
  const [resultsCountdown, setResultsCountdown] = useState(90);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [showNegotiations, setShowNegotiations] = useState(false);
  const [activeNegotiation, setActiveNegotiation] = useState<Negotiation | null>(null);
  const [negotiationMessages, setNegotiationMessages] = useState<Record<string, ChatMessage[]>>({});
  const [negotiationText, setNegotiationText] = useState("");
  const [negotiationTargetId, setNegotiationTargetId] = useState("");
  const [showNukeModal, setShowNukeModal] = useState(false);
  const [launchTargetCountry, setLaunchTargetCountry] = useState("");
  const [launchTargetCity, setLaunchTargetCity] = useState("");
  const [launchBombs, setLaunchBombs] = useState(1);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferAmount, setTransferAmount] = useState(100);
  const [selectedSanctionTargetId, setSelectedSanctionTargetId] = useState("");
  const [draftSanctionTargets, setDraftSanctionTargets] = useState<string[]>([]);
  const [budgetPulse, setBudgetPulse] = useState(0);
  const [budgetDelta, setBudgetDelta] = useState<number | null>(null);
  const [quizQuestion, setQuizQuestion] = useState<QuizQuestion | null>(null);
  const [quizSeconds, setQuizSeconds] = useState(0);
  const [quizResult, setQuizResult] = useState<null | "correct" | "wrong" | "timeout">(null);
  const [quizRoundShown, setQuizRoundShown] = useState<number | null>(null);
  const [quizReward, setQuizReward] = useState(100);
  const [toast, setToast] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const lobbyIdRef = useRef<string | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const playersRef = useRef<LobbyPlayer[]>([]);
  const myCountryRef = useRef<string | null>(null);
  const prevBudgetRef = useRef<number | null>(null);
  const chatModeRef = useRef(chatMode);
  const privateTargetIdRef = useRef(privateTargetId);
  const lastDecisionRoundRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const activeNegotiationRef = useRef<Negotiation | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2200);
  };

  const finalizeVictory = useCallback(() => {
    clearLobbyId();
    setInGame(false);
    setInLobby(false);
    setPendingVictory(false);
    navigate("/victory");
  }, [navigate]);

  const loadNegotiations = async (authToken: string, lobbyId: string) => {
    const data = await api<{ negotiations: Negotiation[] }>(
      `/api/game/${lobbyId}/negotiations`,
      { token: authToken }
    );
    const list = data.negotiations || [];
    setNegotiations(list);
    return list;
  };

  const loadNegotiationMessages = async (negotiationId: string) => {
    if (!token || !lobbyIdRef.current) return;
    const data = await api<{ messages: any[] }>(
      `/api/game/${lobbyIdRef.current}/negotiations/${negotiationId}/messages`,
      { token }
    );
    const mapped = data.messages.map((msg) => {
      const senderPlayer = playersRef.current.find((p) => p.user_id === msg.sender_user_id);
      const senderCountry = stateRef.current?.countries.find(
        (c) => c.id === msg.sender_country_id
      );
      return {
        userId: msg.sender_user_id,
        player: senderPlayer?.nickname || "Игрок",
        avatar: senderPlayer?.avatar_emoji || "👤",
        flag: senderCountry?.flag || "🏳️",
        country: senderCountry?.name || "Страна",
        text: msg.content,
      };
    });
    setNegotiationMessages((prev) => ({ ...prev, [negotiationId]: mapped }));
  };

  const loadQuizQuestion = async (authToken: string, lobbyId: string) => {
    const data = await api<{ question: QuizQuestion }>(`/api/game/${lobbyId}/question`, {
      token: authToken,
    });
    if (!data.question) {
      return;
    }
    setQuizRoundShown(data.question.round);
    if (data.question.answered) {
      setQuizQuestion(null);
      return;
    }
    setQuizQuestion(data.question);
    setQuizSeconds(
      Math.max(0, Math.ceil((data.question.expiresAt - Date.now()) / 1000))
    );
    setQuizResult(null);
  };

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      navigate("/login");
      return;
    }
    setToken(auth.token);
    setUserId(auth.user.id);
    setUserAvatar(auth.user.avatar_emoji);
    const lobbyId = getLobbyId();
    if (!lobbyId) {
      navigate("/lobby");
      return;
    }
    lobbyIdRef.current = lobbyId;

    const init = async () => {
      try {
        const [configData, lobbyData, gameData] = await Promise.all([
          api<{ economy: { nukeCost: number; nukeUnlockRound: number; quizReward?: number } }>("/api/config", { token: auth.token }),
          api<{ lobby: { players: LobbyPlayer[] } }>(`/api/lobbies/${lobbyId}`, { token: auth.token }),
          api<{ state: GameState }>(`/api/game/${lobbyId}/state`, { token: auth.token }),
        ]);
        setNukeCost(configData.economy.nukeCost);
        setNukeUnlockRound(configData.economy.nukeUnlockRound ?? 3);
        setQuizReward(configData.economy.quizReward ?? 100);
        setPlayers(lobbyData.lobby.players);
        playersRef.current = lobbyData.lobby.players;
        setState(gameData.state);
        stateRef.current = gameData.state;
        if (gameData.state?.settings?.nukeUnlockRound) {
          setNukeUnlockRound(gameData.state.settings.nukeUnlockRound);
        }
        setTimer(Math.max(0, Math.floor((gameData.state.phaseEndsAt - Date.now()) / 1000)));
        await loadNegotiations(auth.token, lobbyId);

        const history = await api<{ messages: any[] }>(
          `/api/lobbies/${lobbyId}/messages?type=global`,
          { token: auth.token }
        );
        const mapped = history.messages.map((msg) => {
          const player = lobbyData.lobby.players.find((p) => p.user_id === msg.sender_user_id);
          const country = gameData.state.countries.find((c) => c.id === msg.sender_country_id);
          return {
            userId: msg.sender_user_id,
            player: player?.nickname || "Игрок",
            avatar: player?.avatar_emoji || "👤",
            flag: country?.flag || "🏳️",
            country: country?.name || "Страна",
            text: msg.content,
            round: msg.round_number ?? 0,
            time: msg.created_at,
          };
        });
        setMessages(mapped);
      } catch {
        navigate("/lobby");
      }
    };

    void init();
  }, [navigate]);

  useEffect(() => {
    stateRef.current = state;
    const myCountry = state?.countries.find((c) => c.leaderUserId === userId);
    myCountryRef.current = myCountry?.id || null;
  }, [state, userId]);

  useEffect(() => {
    setInGame(Boolean(state));
    if (state) {
      setInLobby(false);
    }
    return () => {
      setInGame(false);
    };
  }, [state]);

  useEffect(() => {
    const myCountryId = myCountryRef.current;
    if (!myCountryId) return;
    const ready = state?.decisionsReady || [];
    setDecisionsLocked(ready.includes(myCountryId));
  }, [state?.decisionsReady]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    chatModeRef.current = chatMode;
  }, [chatMode]);

  useEffect(() => {
    privateTargetIdRef.current = privateTargetId;
    if (chatMode === "private" && privateTargetId) {
      setPrivateUnread((prev) => ({ ...prev, [privateTargetId]: 0 }));
    }
  }, [privateTargetId, chatMode]);
  useEffect(() => {
    if (!token || !lobbyIdRef.current) return;
    const socket = io(API_URL, { auth: { token } });
    socketRef.current = socket;
    const lobbyId = lobbyIdRef.current;

    socket.emit("lobby:join", { lobbyId });

    socket.on("chat:global", (payload) => {
      const currentState = stateRef.current;
      if (!currentState) return;
      const country = currentState.countries.find((c) => c.id === payload.countryId);
      const roundNumber = payload.round ?? currentState.currentRound ?? 0;
      setMessages((prev) => [
        ...prev,
        {
          userId: payload.userId,
          player: payload.nickname || "Игрок",
          avatar: payload.avatarEmoji || "👤",
          flag: country?.flag || "🏳️",
          country: country?.name || "Страна",
          text: payload.message,
          round: roundNumber,
          time: payload.createdAt || Date.now(),
        },
      ]);
    });

    socket.on("chat:private", (payload) => {
      const currentState = stateRef.current;
      const myCountryId = myCountryRef.current;
      if (!currentState || !myCountryId) return;
      const senderCountry = currentState.countries.find((c) => c.id === payload.fromCountryId);
      const senderPlayer = playersRef.current.find(
        (p) => p.country_id === payload.fromCountryId
      );
      const otherId =
        payload.fromCountryId === myCountryId ? payload.toCountryId : payload.fromCountryId;
      const message: ChatMessage = {
        userId: senderPlayer?.user_id,
        player: senderPlayer?.nickname || "Игрок",
        avatar: senderPlayer?.avatar_emoji || "👤",
        flag: senderCountry?.flag || "🏳️",
        country: senderCountry?.name || "Страна",
        text: payload.message,
        round: payload.round,
        time: payload.createdAt || Date.now(),
      };
      setPrivateChats((prev) => ({
        ...prev,
        [otherId]: [...(prev[otherId] || []), message],
      }));
      setPrivateLastActivity((prev) => ({
        ...prev,
        [otherId]: payload.createdAt || Date.now(),
      }));
      const activeChat = chatModeRef.current === "private" && privateTargetIdRef.current === otherId;
      if (!activeChat && payload.fromCountryId !== myCountryId) {
        setPrivateUnread((prev) => ({
          ...prev,
          [otherId]: (prev[otherId] || 0) + 1,
        }));
      }
    });

    socket.on("negotiation:request", () => {
      if (token && lobbyId) {
        void loadNegotiations(token, lobbyId);
      }
    });

    socket.on("negotiation:accepted", (payload) => {
      if (token && lobbyId) {
        void loadNegotiations(token, lobbyId);
      }
      if (payload?.id) {
        setShowNegotiations(true);
      }
    });

    socket.on("negotiation:ended", (payload) => {
      if (token && lobbyId) {
        void loadNegotiations(token, lobbyId);
      }
      if (payload?.id && activeNegotiationRef.current?.id === payload.id) {
        setActiveNegotiation(null);
      }
      const currentState = stateRef.current;
      let otherName = "переговоры";
      if (payload?.countryA && payload?.countryB && currentState) {
        const myCountryId = myCountryRef.current;
        const otherId =
          payload.countryA === myCountryId ? payload.countryB : payload.countryA;
        const other = currentState.countries.find((c) => c.id === otherId);
        if (other) {
          otherName = `переговоры с ${other.name}`;
        }
      }
      showToast(`Завершены ${otherName}.`);
    });

    socket.on("chat:negotiation", (payload) => {
      const negotiationId = payload?.negotiationId;
      if (!negotiationId) return;
      const currentState = stateRef.current;
      const senderCountry = currentState?.countries.find((c) => c.id === payload.fromCountryId);
      const senderPlayer = playersRef.current.find(
        (p) => p.country_id === payload.fromCountryId
      );
      const message: ChatMessage = {
        userId: senderPlayer?.user_id,
        player: senderPlayer?.nickname || "Игрок",
        avatar: senderPlayer?.avatar_emoji || "👤",
        flag: senderCountry?.flag || "🏳️",
        country: senderCountry?.name || "Страна",
        text: payload.message,
      };
      setNegotiationMessages((prev) => ({
        ...prev,
        [negotiationId]: [...(prev[negotiationId] || []), message],
      }));
    });

    socket.on("game:update", (newState) => {
      setState(newState);
      stateRef.current = newState;
      if (newState?.settings?.nukeUnlockRound) {
        setNukeUnlockRound(newState.settings.nukeUnlockRound);
      }
    });

    socket.on("game:phase", (data) => {
      setState((prev) => {
        if (!prev) return prev;
        return { ...prev, phase: data.phase, phaseEndsAt: data.phaseEndsAt };
      });
    });

    socket.on("game:ready", (payload) => {
      setState((prev) => {
        if (!prev) return prev;
        return { ...prev, decisionsReady: payload.ready || [] };
      });
    });

    socket.on("game:results", (data: { rankings: any[] }) => {
      setFinalRankings(data.rankings || []);
    });

    socket.on("game:finished", () => {
      const finalState = stateRef.current;
      if (finalState) {
        const results = finalState.countries
          .map((country) => {
            const player = playersRef.current.find((p) => p.user_id === country.leaderUserId);
            const aliveCities = country.cities.filter((c) => !c.destroyed).length;
            const score = Math.round(country.money + country.stats.avgLife * 10 + aliveCities * 200);
            return {
              flag: country.flag,
              name: country.name,
              player: player?.nickname || "Игрок",
              avatar: player?.avatar_emoji || "👤",
              cities: aliveCities,
              score,
            };
          })
          .sort((a, b) => b.score - a.score);
        localStorage.setItem("wd_results", JSON.stringify(results));
      }
      setPendingVictory(true);
      if (finalState?.lastRoundSummary) {
        setSummaryRoundShown(finalState.lastRoundSummary.round);
        setShowStats(true);
      } else {
        finalizeVictory();
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, navigate, finalizeVictory]);

  useEffect(() => {
    const interval = setInterval(() => {
      const endsAt = stateRef.current?.phaseEndsAt;
      if (!endsAt) return;
      const remaining = Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
      setTimer(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!quizQuestion) return;
    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((quizQuestion.expiresAt - Date.now()) / 1000)
      );
      setQuizSeconds(remaining);
    };
    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [quizQuestion]);

  useEffect(() => {
    if (!quizQuestion || quizResult) return;
    if (quizSeconds > 0) return;
    if (Date.now() < quizQuestion.expiresAt) return;
    void handleQuizAnswer(-1);
  }, [quizSeconds, quizQuestion, quizResult]);

  useEffect(() => {
    if (!state || !state.lastRoundSummary) return;
    if (state.phase !== "discussion" && state.phase !== "finished") return;
    const round = state.lastRoundSummary.round;
    if (summaryRoundShown === round) return;
    setSummaryRoundShown(round);
    setShowStats(true);
  }, [state, summaryRoundShown]);

  useEffect(() => {
    if (state?.phase !== "decisions") {
      setQuizQuestion(null);
      setQuizResult(null);
    }
  }, [state?.phase]);

  useEffect(() => {
    if (!token || !state || state.phase !== "decisions" || !lobbyIdRef.current) return;
    if (quizRoundShown === state.currentRound) return;
    void loadQuizQuestion(token, lobbyIdRef.current);
  }, [state?.phase, state?.currentRound, token, quizRoundShown]);

  useEffect(() => {
    if (state?.phase !== "decisions") {
      setDraftLifeTargets({});
      setDraftShields({});
      setDraftNukes(0);
      setDraftLaunches([]);
      setDecisionsLocked(false);
      lastDecisionRoundRef.current = null;
    }
  }, [state?.phase]);

  const myCountry = useMemo(() => {
    if (!state || !userId) return null;
    return state.countries.find((country) => country.leaderUserId === userId) || null;
  }, [state, userId]);

  const otherCountries = useMemo(() => {
    if (!state || !myCountry) return [];
    return state.countries.filter((country) => country.id !== myCountry.id);
  }, [state, myCountry]);

  const targetableCountries = useMemo(() => {
    return otherCountries.filter((country) =>
      country.cities.some((city) => !city.destroyed && city.lifeLevel > 0)
    );
  }, [otherCountries]);

  const destroyedThisRound = useMemo(() => {
    const summary = state?.lastRoundSummary;
    if (!summary || !Array.isArray(summary.impacts)) return new Set<string>();
    const entries = summary.impacts
      .filter((impact: any) => impact?.destroyed)
      .map((impact: any) => `${impact.targetCountryId}:${impact.targetCityId}`);
    return new Set(entries);
  }, [state?.lastRoundSummary]);

  useEffect(() => {
    if (!state || state.phase !== "decisions" || !myCountry) return;
    if (lastDecisionRoundRef.current === state.currentRound) return;
    lastDecisionRoundRef.current = state.currentRound;
    const nextTargets: Record<string, number> = {};
    for (const city of myCountry.cities) {
      nextTargets[city.id] = Math.round(city.lifeLevel);
    }
    setDraftLifeTargets(nextTargets);
    setSelectedSanctionTargetId("");
    setDraftSanctionTargets([]);
  }, [state?.phase, state?.currentRound, myCountry]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, privateChats, privateTargetId, chatMode, negotiationMessages, activeNegotiation]);

  useEffect(() => {
    if (!activeNegotiation) return;
    socketRef.current?.emit("negotiation:join", { negotiationId: activeNegotiation.id });
    if (!negotiationMessages[activeNegotiation.id]) {
      void loadNegotiationMessages(activeNegotiation.id);
    }
  }, [activeNegotiation, negotiationMessages]);

  useEffect(() => {
    activeNegotiationRef.current = activeNegotiation;
  }, [activeNegotiation]);

  const decisionsReady = state?.decisionsReady || [];
  const myReady = myCountry ? decisionsReady.includes(myCountry.id) : false;
  const lifeQuality = Math.round(myCountry?.stats.avgLife || 0);
  const budget = myCountry?.money || 0;
  const nuclearWeapons = myCountry?.nukesReady || 0;
  const cities = myCountry?.cities || [];
  const isDecisionPhase = state?.phase === "decisions";
  const nukesUnlocked = state ? state.currentRound >= nukeUnlockRound : false;
  const isEliminated = Boolean(
    myCountry && myCountry.cities.every((city) => city.destroyed || city.lifeLevel <= 0)
  );
  const incomeMultiplier = state?.settings?.incomeMultiplier ?? 1;

  const getCityUpgradeCost = (city: CityState, targetLevel: number) => {
    const current = Math.round(city.lifeLevel);
    const target = Math.max(current, Math.min(100, Math.round(targetLevel)));
    if (target <= current) return 0;
    return calcLifeUpgradeCostRange(current, target);
  };

  const getMaxAffordableLevel = (city: CityState, budgetForCity: number) => {
    const base = Math.round(city.lifeLevel);
    let low = base;
    let high = 100;
    let best = base;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const cost = getCityUpgradeCost(city, mid);
      if (cost <= budgetForCity) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best;
  };

  const getProjectedIncome = (city: CityState, targetLevel: number) => {
    if (city.destroyed) return 0;
    const base = Math.max(0, city.baseIncome + Math.round(targetLevel) * 6);
    return Math.round(base * incomeMultiplier);
  };

  useEffect(() => {
    if (!isDecisionPhase || !isEliminated) return;
    setDraftLifeTargets({});
    setDraftShields({});
    setDraftNukes(0);
    setSelectedSanctionTargetId("");
    setDraftSanctionTargets([]);
  }, [isDecisionPhase, isEliminated]);

  const draftCost = useMemo(() => {
    let cost = 0;
    for (const city of cities) {
      const targetLevel = draftLifeTargets[city.id];
      if (typeof targetLevel === "number" && targetLevel > city.lifeLevel) {
        cost += calcLifeUpgradeCostRange(city.lifeLevel, targetLevel);
      }
      const shields = draftShields[city.id] || 0;
      if (shields > 0) {
        cost += city.shieldCost * shields;
      }
    }
    cost += draftNukes * nukeCost;
    return cost;
  }, [cities, draftLifeTargets, draftShields, draftNukes, nukeCost]);

  const availableBudget = budget - draftCost;
  const displayBudget = isDecisionPhase ? Math.max(0, availableBudget) : budget;
  const totalLaunchBombs = draftLaunches.reduce((sum, item) => sum + item.bombs, 0);
  const sanctionHistory = state?.sanctionHistory || [];
  const mySanctionTargets = new Set(
    sanctionHistory
      .filter((item) => item.fromCountryId === myCountry?.id)
      .map((item) => item.toCountryId)
  );
  const sanctionableCountries = otherCountries.filter(
    (country) =>
      !country.cities.every((city) => city.destroyed || city.lifeLevel <= 0) &&
      !mySanctionTargets.has(country.id) &&
      !draftSanctionTargets.includes(country.id)
  );
  const selectedSanctionCountries = draftSanctionTargets
    .map((countryId) => otherCountries.find((country) => country.id === countryId))
    .filter(Boolean) as CountryState[];
  const usedSanctionCountries = [...mySanctionTargets]
    .map((countryId) => otherCountries.find((country) => country.id === countryId))
    .filter(Boolean) as CountryState[];

  useEffect(() => {
    if (!isDecisionPhase || !cities.length) return;
    const nextTargets: Record<string, number> = { ...draftLifeTargets };
    let changed = false;
    for (const city of cities) {
      const currentTarget =
        typeof nextTargets[city.id] === "number"
          ? nextTargets[city.id]
          : Math.round(city.lifeLevel);
      const currentCost = getCityUpgradeCost(city, currentTarget);
      const otherCost = draftCost - currentCost;
      const budgetForCity = Math.max(0, budget - otherCost);
      const maxAffordable = getMaxAffordableLevel(city, budgetForCity);
      if (currentTarget > maxAffordable) {
        nextTargets[city.id] = maxAffordable;
        changed = true;
      }
    }
    if (changed) {
      setDraftLifeTargets(nextTargets);
    }
  }, [draftCost, budget, cities, isDecisionPhase, draftLifeTargets]);

  useEffect(() => {
    if (prevBudgetRef.current === null) {
      prevBudgetRef.current = displayBudget;
      return;
    }
    if (prevBudgetRef.current === displayBudget) return;
    const delta = displayBudget - prevBudgetRef.current;
    setBudgetDelta(delta);
    setBudgetPulse((value) => value + 1);
    prevBudgetRef.current = displayBudget;
    const timer = setTimeout(() => setBudgetDelta(null), 900);
    return () => clearTimeout(timer);
  }, [displayBudget]);
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !lobbyIdRef.current) return;
    if (chatMode === "global") {
      if (!state || state.phase !== "discussion") return;
      socketRef.current?.emit("chat:global", {
        lobbyId: lobbyIdRef.current,
        message: newMessage,
      });
      setNewMessage("");
      return;
    }
    if (!privateTargetId) return;
    socketRef.current?.emit("chat:private", {
      lobbyId: lobbyIdRef.current,
      targetCountryId: privateTargetId,
      message: newMessage,
    });
    setNewMessage("");
  };

  const handleLifeTargetChange = (cityId: string, value: number) => {
    if (!isDecisionPhase || decisionsLocked || isEliminated) return;
    setActionError(null);
    const city = cities.find((c) => c.id === cityId);
    if (!city) return;
    const currentTarget =
      typeof draftLifeTargets[city.id] === "number"
        ? draftLifeTargets[city.id]
        : Math.round(city.lifeLevel);
    const currentCost = getCityUpgradeCost(city, currentTarget);
    const otherCost = draftCost - currentCost;
    const budgetForCity = Math.max(0, budget - otherCost);
    const maxAffordable = getMaxAffordableLevel(city, budgetForCity);
    const nextValue = Math.max(Math.round(city.lifeLevel), Math.min(maxAffordable, Math.round(value)));
    setDraftLifeTargets((prev) => ({
      ...prev,
      [cityId]: nextValue,
    }));
  };

  const handleResetLifeTarget = (cityId: string) => {
    if (!isDecisionPhase || decisionsLocked || isEliminated) return;
    const city = cities.find((c) => c.id === cityId);
    if (!city) return;
    setDraftLifeTargets((prev) => ({
      ...prev,
      [cityId]: Math.round(city.lifeLevel),
    }));
  };

  const handleAddShield = (cityId: string) => {
    if (!isDecisionPhase || decisionsLocked || isEliminated) return;
    const city = cities.find((c) => c.id === cityId);
    if (!city || city.destroyed) return;
    if (availableBudget < city.shieldCost) {
      setActionError("Недостаточно средств.");
      return;
    }
    setActionError(null);
    setDraftShields((prev) => ({ ...prev, [cityId]: (prev[cityId] || 0) + 1 }));
  };

  const handleRemoveShield = (cityId: string) => {
    if (!isDecisionPhase || decisionsLocked || isEliminated) return;
    setDraftShields((prev) => {
      const current = prev[cityId] || 0;
      if (current <= 0) return prev;
      return { ...prev, [cityId]: current - 1 };
    });
  };

  const handleDevelopNuclear = () => {
    if (!isDecisionPhase || decisionsLocked || isEliminated) return;
    if (availableBudget < nukeCost) {
      setActionError("Недостаточно средств.");
      return;
    }
    setActionError(null);
    setDraftNukes((prev) => prev + 1);
  };

  const handleRemoveNuclear = () => {
    if (!isDecisionPhase || decisionsLocked || isEliminated) return;
    setDraftNukes((prev) => (prev > 0 ? prev - 1 : 0));
  };

  const handleOpenTransferModal = () => {
    if (!isDecisionPhase || decisionsLocked) return;
    if (!otherCountries.length) return;
    setShowTransferModal(true);
  };

  const handleConfirmTransfer = async () => {
    if (!isDecisionPhase || decisionsLocked) return;
    if (!transferTargetId) return;
    const amount = Math.max(0, Math.floor(transferAmount || 0));
    if (amount <= 0) return;
    const maxBudget = isDecisionPhase ? availableBudget : budget;
    if (amount > maxBudget) {
      setActionError("Недостаточно средств для перевода.");
      return;
    }
    if (!token || !lobbyIdRef.current) return;
    try {
      setActionError(null);
      setActionInfo(null);
      await api(`/api/game/${lobbyIdRef.current}/transfer`, {
        method: "POST",
        token,
        body: { targetCountryId: transferTargetId, amount },
      });
      setActionInfo("Перевод выполнен.");
      setShowTransferModal(false);
      setTransferAmount(100);
    } catch (err) {
      const apiError = err as ApiError;
      const details = apiError?.data?.error || apiError.message;
      if (details === "INSUFFICIENT_FUNDS") {
        setActionError("Недостаточно средств.");
      } else if (details === "COUNTRY_ELIMINATED") {
        setActionError("Страна разрушена — переводы недоступны.");
      } else {
        setActionError("Не удалось выполнить перевод.");
      }
    }
  };

  // Transfers are applied instantly via backend now.

  const handleAddLaunch = () => {
    if (!nukesUnlocked || decisionsLocked) return;
    if (!launchTargetCountry || !launchTargetCity) return;
    const targetCountry = targetableCountries.find((c) => c.id === launchTargetCountry);
    const targetCity = targetCountry?.cities.find((c) => c.id === launchTargetCity);
    if (!targetCountry || !targetCity || targetCity.destroyed || targetCity.lifeLevel <= 0) {
      setActionError("Нельзя атаковать уничтоженную страну.");
      return;
    }
    if (totalLaunchBombs >= nuclearWeapons) {
      setActionError("Недостаточно ядерных боеголовок.");
      return;
    }
    const bombs = Math.max(1, Math.min(launchBombs, nuclearWeapons - totalLaunchBombs));
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setDraftLaunches((prev) => [
      ...prev,
      { id, targetCountryId: launchTargetCountry, targetCityId: launchTargetCity, bombs },
    ]);
    setLaunchBombs(1);
  };

  const handleRemoveLaunch = (id: string) => {
    if (decisionsLocked) return;
    setDraftLaunches((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDecreaseLaunch = (id: string) => {
    if (decisionsLocked) return;
    setDraftLaunches((prev) =>
      prev.flatMap((item) => {
        if (item.id !== id) return [item];
        if (item.bombs <= 1) return [];
        return [{ ...item, bombs: item.bombs - 1 }];
      })
    );
  };

  const handleIncreaseLaunch = (id: string) => {
    if (decisionsLocked) return;
    if (totalLaunchBombs >= nuclearWeapons) return;
    setDraftLaunches((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return { ...item, bombs: item.bombs + 1 };
      })
    );
  };

  const handleAddSanctionTarget = () => {
    if (decisionsLocked || !selectedSanctionTargetId) return;
    if (draftSanctionTargets.includes(selectedSanctionTargetId)) {
      setActionError("Эта страна уже добавлена в санкции.");
      return;
    }
    setDraftSanctionTargets((prev) => [...prev, selectedSanctionTargetId]);
    setSelectedSanctionTargetId("");
    setActionError(null);
  };

  const handleRemoveSanctionTarget = (countryId: string) => {
    if (decisionsLocked) return;
    setDraftSanctionTargets((prev) => prev.filter((item) => item !== countryId));
  };

  const handleApplyDecisions = async () => {
    if (!token || !lobbyIdRef.current || !isDecisionPhase) return;
    if (decisionsLocked) {
      setActionInfo("Решения уже подтверждены.");
      return;
    }
    setActionError(null);
    setActionInfo(null);
    setApplying(true);
    try {
      const lifeTargets = cities
        .map((city) => {
          const targetLevel = draftLifeTargets[city.id];
          if (typeof targetLevel !== "number") return null;
          if (targetLevel <= city.lifeLevel) return null;
          return { cityId: city.id, targetLevel: Math.round(targetLevel) };
        })
        .filter(Boolean) as { cityId: string; targetLevel: number }[];
      const shields = Object.entries(draftShields)
        .filter(([, count]) => count > 0)
        .map(([cityId, count]) => ({ cityId, count }));
      await api(`/api/game/${lobbyIdRef.current}/decisions/confirm`, {
        method: "POST",
        token,
        body: {
          lifeTargets,
          shields,
          nukesToBuild: draftNukes,
          nukesToLaunch: draftLaunches.map((item) => ({
            targetCountryId: item.targetCountryId,
            targetCityId: item.targetCityId,
            bombs: item.bombs,
          })),
          sanctionTargetIds: draftSanctionTargets,
        },
      });
      setActionInfo("Решения отправлены.");
    } catch (err) {
      const apiError = err as ApiError;
      const details = apiError?.data?.details;
      if (details?.includes("INSUFFICIENT_FUNDS")) {
        setActionError("Недостаточно средств.");
      } else if (details?.includes("NUKES_LOCKED")) {
        setActionError("Ядерное оружие доступно с 3 раунда.");
      } else if (details?.includes("NOT_ENOUGH_NUKES")) {
        setActionError("Недостаточно ядерных боеголовок.");
      } else if (details?.includes("TARGET_COUNTRY_DESTROYED")) {
        setActionError("Нельзя атаковать уничтоженную страну.");
      } else if (details?.includes("TARGET_CITY_DESTROYED")) {
        setActionError("Нельзя атаковать уничтоженный город.");
      } else if (details?.includes("SANCTION_ALREADY_USED")) {
        setActionError("Этой стране уже были назначены ваши санкции.");
      } else if (details?.includes("SANCTION_TARGET_DESTROYED")) {
        setActionError("Нельзя наложить санкции на уничтоженную страну.");
      } else if (details?.includes("SANCTION_SELF")) {
        setActionError("Нельзя наложить санкции на свою страну.");
      } else {
        setActionError("Не удалось применить решения.");
      }
    } finally {
      setApplying(false);
    }
  };

  const handleCancelDecisions = async () => {
    if (!token || !lobbyIdRef.current || !isDecisionPhase) return;
    setActionError(null);
    setActionInfo(null);
    try {
      await api(`/api/game/${lobbyIdRef.current}/decisions/cancel`, {
        method: "POST",
        token,
      });
      setDecisionsLocked(false);
      setActionInfo("Решения снова доступны для изменения.");
    } catch {
      setActionError("Не удалось отменить решения.");
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate("/");
  };

  const handleOpenProfile = () => {
    navigate("/profile");
  };

  const handleCloseStats = () => {
    setShowStats(false);
    if (pendingVictory) {
      finalizeVictory();
    }
  };

  const handleOpenChatProfile = (targetUserId?: number) => {
    if (!targetUserId) return;
    if (targetUserId === userId) {
      navigate("/profile");
      return;
    }
    navigate(`/profile/${targetUserId}`);
  };

  const handleRequestNegotiation = async (targetCountryId: string) => {
    if (!token || !lobbyIdRef.current) return;
    if (!targetCountryId) return;
    try {
      await api(`/api/game/${lobbyIdRef.current}/negotiations/request`, {
        method: "POST",
        token,
        body: { targetCountryId },
      });
      await loadNegotiations(token, lobbyIdRef.current);
      showToast("Запрос отправлен");
    } catch (err) {
      const apiError = err as ApiError;
      const code = apiError?.data?.error || apiError.message;
      if (code === "NEGOTIATION_PENDING") {
        showToast("Запрос уже отправлен в этом раунде");
      } else if (code === "NEGOTIATION_REJECTED") {
        showToast("Страна отклонила запрос в этом раунде");
      } else if (code === "NEGOTIATION_ALREADY") {
        showToast("Переговоры уже были в этом раунде");
      } else if (code === "GAME_NOT_STARTED") {
        showToast("Игра ещё не началась");
      } else {
        showToast("Не удалось отправить запрос.");
      }
    }
  };

  const handleAcceptNegotiation = async (negotiationId: string) => {
    if (!token || !lobbyIdRef.current) return;
    try {
      await api(`/api/game/${lobbyIdRef.current}/negotiations/${negotiationId}/accept`, {
        method: "POST",
        token,
      });
      const list = await loadNegotiations(token, lobbyIdRef.current);
      const negotiation = list.find((item) => item.id === negotiationId) || null;
      setActiveNegotiation(negotiation);
    } catch {
      setActionError("Не удалось принять переговоры.");
    }
  };

  const handleRejectNegotiation = async (negotiationId: string) => {
    if (!token || !lobbyIdRef.current) return;
    try {
      await api(`/api/game/${lobbyIdRef.current}/negotiations/${negotiationId}/reject`, {
        method: "POST",
        token,
      });
      await loadNegotiations(token, lobbyIdRef.current);
    } catch {
      setActionError("Не удалось отклонить запрос.");
    }
  };

  const handleOpenNegotiation = async (negotiation: Negotiation) => {
    setActiveNegotiation(negotiation);
    setShowNegotiations(true);
    if (!negotiationMessages[negotiation.id]) {
      await loadNegotiationMessages(negotiation.id);
    }
  };

  const handleSendNegotiationMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNegotiation || !negotiationText.trim()) return;
    socketRef.current?.emit("chat:negotiation", {
      negotiationId: activeNegotiation.id,
      message: negotiationText,
    });
    setNegotiationText("");
  };

  const handleEndNegotiation = async () => {
    if (!token || !lobbyIdRef.current || !activeNegotiation) return;
    try {
      await api(`/api/game/${lobbyIdRef.current}/negotiations/${activeNegotiation.id}/end`, {
        method: "POST",
        token,
      });
      setActiveNegotiation(null);
      await loadNegotiations(token, lobbyIdRef.current);
    } catch {
      setActionError("Не удалось завершить переговоры.");
    }
  };

  const handleLoadPrivateMessages = async (targetId: string) => {
    if (!token || !lobbyIdRef.current || !targetId) return;
    if (privateChats[targetId]) return;
    try {
      const data = await api<{ messages: any[] }>(
        `/api/lobbies/${lobbyIdRef.current}/messages/private?targetCountryId=${targetId}`,
        { token }
      );
      const mapped = data.messages.map((msg) => {
        const senderPlayer = playersRef.current.find((p) => p.user_id === msg.sender_user_id);
        const senderCountry = stateRef.current?.countries.find(
          (c) => c.id === msg.sender_country_id
        );
        return {
          userId: msg.sender_user_id,
          player: senderPlayer?.nickname || "Игрок",
          avatar: senderPlayer?.avatar_emoji || "👤",
          flag: senderCountry?.flag || "🏳️",
          country: senderCountry?.name || "Страна",
          text: msg.content,
          round: msg.round_number ?? 0,
          time: msg.created_at,
        };
      });
      setPrivateChats((prev) => ({ ...prev, [targetId]: mapped }));
      const lastTime = mapped.length ? mapped[mapped.length - 1].time || 0 : 0;
      if (lastTime) {
        setPrivateLastActivity((prev) => ({ ...prev, [targetId]: lastTime }));
      }
    } catch {
      // ignore
    }
  };

  const handleQuizAnswer = async (optionIndex: number) => {
    if (!token || !lobbyIdRef.current || !quizQuestion) return;
    try {
      const result = await api<{ correct: boolean; expired?: boolean; reward?: number }>(
        `/api/game/${lobbyIdRef.current}/question/answer`,
        {
          method: "POST",
          token,
          body: {
            questionId: quizQuestion.id,
            optionIndex,
          },
        }
      );
      const status = result.expired ? "timeout" : result.correct ? "correct" : "wrong";
      setQuizResult(status);
      if (result.correct && result.reward) {
        setActionInfo(`Правильно! +${result.reward}$`);
      } else if (result.expired) {
        setActionInfo("Время вышло.");
      } else {
        setActionInfo("Неверный ответ.");
      }
    } catch {
      setActionInfo("Не удалось отправить ответ.");
    } finally {
      setTimeout(() => setQuizQuestion(null), 1200);
    }
  };

  useEffect(() => {
    if (chatMode === "private" && privateTargetId) {
      void handleLoadPrivateMessages(privateTargetId);
    }
  }, [chatMode, privateTargetId]);

  useEffect(() => {
    if (!showNukeModal) return;
    if (!targetableCountries.length) {
      setLaunchTargetCountry("");
      setLaunchTargetCity("");
      return;
    }
    if (!launchTargetCountry) {
      setLaunchTargetCountry(targetableCountries[0].id);
    }
  }, [showNukeModal, targetableCountries, launchTargetCountry]);

  useEffect(() => {
    if (!launchTargetCountry) return;
    const target = targetableCountries.find((c) => c.id === launchTargetCountry);
    if (!target) return;
    const aliveCities = target.cities.filter((c) => !c.destroyed && c.lifeLevel > 0);
    if (!launchTargetCity) {
      setLaunchTargetCity(aliveCities[0]?.id || "");
    } else {
      const exists = aliveCities.some((c) => c.id === launchTargetCity);
      if (!exists) {
        setLaunchTargetCity(aliveCities[0]?.id || "");
      }
    }
  }, [launchTargetCountry, launchTargetCity, targetableCountries]);

  useEffect(() => {
    if (!otherCountries.length) return;
    if (!negotiationTargetId) {
      setNegotiationTargetId(otherCountries[0].id);
    }
  }, [otherCountries, negotiationTargetId]);

  useEffect(() => {
    if (!otherCountries.length) {
      setTransferTargetId("");
      return;
    }
    if (!transferTargetId) {
      setTransferTargetId(otherCountries[0].id);
    }
  }, [otherCountries, transferTargetId]);

  useEffect(() => {
    if (!showNegotiations || !token || !lobbyIdRef.current) return;
    void loadNegotiations(token, lobbyIdRef.current);
  }, [showNegotiations, token]);

  const privateTargets = useMemo(() => {
    const targets = otherCountries.map((country) => ({
      id: country.id,
      label: `${country.flag} ${country.name}`,
    }));
    return targets.sort((a, b) => {
      const aHas = (privateChats[a.id]?.length || 0) > 0;
      const bHas = (privateChats[b.id]?.length || 0) > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      const aTime = privateLastActivity[a.id] || 0;
      const bTime = privateLastActivity[b.id] || 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.label.localeCompare(b.label);
    });
  }, [otherCountries, privateChats, privateLastActivity]);

  const chatMessagesToShow =
    chatMode === "private" && privateTargetId
      ? privateChats[privateTargetId] || []
      : [];
  const globalChatItems = useMemo(() => {
    const items: Array<
      | { kind: "divider"; round: number }
      | { kind: "message"; message: ChatMessage }
    > = [];
    let lastRound: number | null = null;
    for (const msg of messages) {
      const round = msg.round ?? 0;
      if (round !== lastRound) {
        items.push({ kind: "divider", round });
        lastRound = round;
      }
      items.push({ kind: "message", message: msg });
    }
    return items;
  }, [messages]);
  const activeNegotiationMessages = activeNegotiation
    ? negotiationMessages[activeNegotiation.id] || []
    : [];

  if (!state || !myCountry) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white"
           style={{ background: "var(--app-header)" }}>
        Загрузка игры...
      </div>
    );
  }

  const phaseLabel =
    state.phase === "decisions"
      ? "ПРИНЯТИЕ РЕШЕНИЙ"
      : state.phase === "summary"
      ? "ИТОГ РАУНДА"
      : "ОБСУЖДЕНИЕ";

  const incomingRequests = negotiations.filter(
    (item) => item.status === "pending" && item.country_b_id === myCountry?.id
  );
  const outgoingRequests = negotiations.filter(
    (item) => item.status === "pending" && item.country_a_id === myCountry?.id
  );
  const activeNegotiations = negotiations.filter((item) => item.status === "active");

  return (
    <div className="h-screen flex flex-col relative overflow-hidden pt-16" style={{ background: "var(--app-header)" }}>
      <header
        className="h-16 px-6 flex items-center justify-between border-b fixed top-0 left-0 right-0 z-30"
        style={{
          background: "var(--app-header)",
          borderColor: "rgba(255, 255, 255, 0.1)",
          color: "var(--app-text)",
        }}
      >
        <div className="flex items-center gap-4">
          <AppBrandLink />
          <div className="px-3 py-1 rounded-[6px] text-xs font-bold"
               style={{ background: "rgba(255, 255, 255, 0.1)", color: "rgba(255, 255, 255, 0.7)" }}>
            {state.currentRound} РАУНД
          </div>
        </div>

        <div className="text-center">
          <div className="text-xl font-bold mb-1" style={{ color: "var(--app-accent)" }}>
            {phaseLabel}
          </div>
          <div className={`text-sm font-bold ${timer < 30 ? "animate-pulse" : ""}`}
               style={{ color: timer < 30 ? "var(--app-danger)" : "rgba(255, 255, 255, 0.7)" }}>
            ⏱️ {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, "0")} сек
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs" style={{ color: "rgba(255, 255, 255, 0.6)" }}>Доступный бюджет:</div>
            <motion.div
              key={`${displayBudget}-${budgetPulse}`}
              initial={{ scale: 0.9, opacity: 0.6 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-lg font-bold"
              style={{ color: "var(--app-accent)" }}
            >
              {displayBudget} $
            </motion.div>
            {budgetDelta !== null && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs font-bold"
                style={{ color: budgetDelta < 0 ? "var(--app-danger)" : "var(--app-success)" }}
              >
                {budgetDelta > 0 ? `+${budgetDelta}` : budgetDelta} $
              </motion.div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs" style={{ color: "rgba(255, 255, 255, 0.6)" }}>Ядерное оружие:</div>
            <div className="text-lg font-bold" style={{ color: "var(--app-warning)" }}>{nuclearWeapons}</div>
          </div>
          <button
            onClick={handleOpenProfile}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
            style={{ background: "rgba(255, 255, 255, 0.1)" }}
          >
            <span className="text-xl">{userAvatar}</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        <div className="w-[350px] h-full custom-scrollbar overflow-y-auto min-h-0"
             style={{
               background: "var(--app-surface-strong)",
               borderRight: "1px solid rgba(255, 255, 255, 0.05)"
             }}>
          <div className="p-6 text-center"
               style={{
                 background: myReady
                   ? "color-mix(in srgb, var(--app-success) 22%, transparent)"
                   : "color-mix(in srgb, var(--app-accent-strong) 18%, transparent)",
                 borderBottom: myReady
                   ? "2px solid color-mix(in srgb, var(--app-success) 55%, transparent)"
                   : "2px solid color-mix(in srgb, var(--app-accent-strong) 35%, transparent)",
                 boxShadow: myReady
                   ? "0 0 24px color-mix(in srgb, var(--app-success) 35%, transparent)"
                   : "none",
               }}>
            <div className="text-6xl mb-2" style={{ color: "#ffffff" }}>
              {myCountry.flag}
            </div>
            <div className="text-2xl font-bold text-white">{myCountry.name}</div>
          </div>

          <div className="p-6">
            <div className="mb-4">
              <div className="text-sm mb-2" style={{ color: "rgba(255, 255, 255, 0.8)" }}>
                Средний уровень жизни в стране
              </div>
              <div className="relative h-8 rounded-full overflow-hidden"
                   style={{ background: "rgba(255, 255, 255, 0.05)" }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${lifeQuality}%` }}
                  transition={{ duration: 1 }}
                  className="h-full"
                  style={{
                    background: `linear-gradient(90deg, var(--app-success) 0%, color-mix(in srgb, var(--app-success) 70%, #0b1220) 100%)`,
                    boxShadow: "0 0 10px color-mix(in srgb, var(--app-success) 45%, transparent)"
                  }}
                />
              </div>
              <div className="text-right mt-1 text-xl font-bold" style={{ color: "var(--app-success)" }}>
                {lifeQuality}%
              </div>
            </div>

            <div className="space-y-3 mb-6">
              {cities.map((city) => (
                <div
                  key={city.id}
                  className="rounded-[12px] p-4"
                  style={{
                    background: city.destroyed
                      ? "color-mix(in srgb, var(--app-danger) 12%, transparent)"
                      : "rgba(255, 255, 255, 0.05)",
                    borderLeft: `4px solid ${city.destroyed ? "var(--app-danger)" : "var(--app-accent-strong)"}`,
                    filter: city.destroyed ? "grayscale(100%)" : "none",
                    opacity: city.destroyed ? 0.6 : 1
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white">{city.name}</span>
                    {city.destroyed && <span className="text-2xl">💥</span>}
                  </div>
                  <div className="text-sm space-y-1" style={{ color: "rgba(255, 255, 255, 0.7)" }}>
                    <div>Уровень: {city.lifeLevel}%</div>
                    <div>Доход: {city.income}$</div>
                    {city.shields > 0 && (
                      <div className="flex items-center gap-1" style={{ color: "var(--app-accent-strong)" }}>
                        <span>🛡️</span>
                        <span>Щиты: {city.shields}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 p-6 overflow-hidden min-h-0">
          <AnimatePresence mode="wait">
            {!isDecisionPhase ? (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card-strong rounded-[20px] h-full flex flex-col"
              >
                <div className="flex items-center gap-2 p-4 border-b border-white/10">
                  <button
                    onClick={() => setChatMode("global")}
                    className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{
                      background: chatMode === "global" ? "var(--app-accent)" : "rgba(255, 255, 255, 0.1)",
                      color: chatMode === "global" ? "var(--app-header)" : "#fff",
                    }}
                  >
                    Общий
                  </button>
                  <button
                    onClick={() => setChatMode("private")}
                    className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{
                      background: chatMode === "private" ? "var(--app-success)" : "rgba(255, 255, 255, 0.1)",
                      color: chatMode === "private" ? "var(--app-header)" : "#fff",
                    }}
                  >
                    Личный
                  </button>
                  {chatMode === "private" && (
                    <div className="ml-2 flex flex-wrap gap-2">
                      {privateTargets.map((target) => {
                        const unread = privateUnread[target.id] || 0;
                        const active = privateTargetId === target.id;
                        return (
                          <button
                            key={target.id}
                            onClick={() => setPrivateTargetId(target.id)}
                            className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2"
                            style={{
                              background: active ? "var(--app-success)" : "rgba(255, 255, 255, 0.08)",
                              color: active ? "var(--app-header)" : "#fff",
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                            }}
                          >
                            <span>{target.label}</span>
                            {unread > 0 && (
                              <span
                                className="px-2 py-[2px] rounded-full text-[10px] font-bold"
                                style={{ background: "var(--app-danger)", color: "#fff" }}
                              >
                                {unread}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex-1 p-6 custom-scrollbar overflow-y-auto">
                  <div className="space-y-3">
                    {chatMode === "global"
                      ? globalChatItems.map((item, index) =>
                          item.kind === "divider" ? (
                            <div
                              key={`round-${item.round}-${index}`}
                              className="text-xs font-bold text-center text-white/60 uppercase tracking-widest"
                            >
                              {item.round === 0 ? "Лобби" : `Раунд ${item.round}`}
                            </div>
                          ) : (
                            <motion.div
                              key={`msg-${index}`}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: item.message.destroyed ? 0.5 : 1, x: 0 }}
                              className="rounded-[12px] p-4"
                              style={{
                                background: "rgba(255, 255, 255, 0.05)",
                                borderLeft: "3px solid var(--app-accent-strong)",
                                textDecoration: item.message.destroyed ? "line-through" : "none",
                              }}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xl">{item.message.avatar}</span>
                                <span className="text-2xl">{item.message.flag}</span>
                                <span className="font-bold text-white">{item.message.country}</span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenChatProfile(item.message.userId)}
                                  className="text-xs font-bold hover:underline"
                                  style={{
                                    color: "var(--app-accent-strong)",
                                    cursor: item.message.userId ? "pointer" : "default",
                                  }}
                                >
                                  {item.message.player}
                                </button>
                              </div>
                              <div className="text-white ml-8">{item.message.text}</div>
                            </motion.div>
                          )
                        )
                      : chatMessagesToShow.map((msg, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: msg.destroyed ? 0.5 : 1, x: 0 }}
                            className="rounded-[12px] p-4"
                            style={{
                              background: "rgba(255, 255, 255, 0.05)",
                              borderLeft: "3px solid var(--app-accent-strong)",
                              textDecoration: msg.destroyed ? "line-through" : "none",
                            }}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xl">{msg.avatar}</span>
                              <span className="text-2xl">{msg.flag}</span>
                              <span className="font-bold text-white">{msg.country}</span>
                              <button
                                type="button"
                                onClick={() => handleOpenChatProfile(msg.userId)}
                                className="text-xs font-bold hover:underline"
                                style={{
                                  color: "var(--app-accent-strong)",
                                  cursor: msg.userId ? "pointer" : "default",
                                }}
                              >
                                {msg.player}
                              </button>
                            </div>
                            <div className="text-white ml-8">{msg.text}</div>
                          </motion.div>
                        ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Введите сообщение..."
                      disabled={chatMode === "global" && state.phase !== "discussion"}
                      className="flex-1 rounded-[12px] p-3 text-white placeholder-white/40"
                      style={{
                        background: "rgba(255, 255, 255, 0.08)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        outline: "none",
                        opacity: chatMode === "global" && state.phase !== "discussion" ? 0.5 : 1
                      }}
                    />
                    <button
                      type="submit"
                      disabled={chatMode === "global" && state.phase !== "discussion"}
                      className="btn-primary rounded-[12px] px-8 font-bold text-white"
                      style={{ opacity: chatMode === "global" && state.phase !== "discussion" ? 0.5 : 1 }}
                    >
                      Отправить
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="custom-scrollbar overflow-y-auto h-full"
              >
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-white">{myCountry.name}</div>
                      <div className="text-xs text-white/60">Планирование решений</div>
                      {isEliminated && (
                        <div className="text-xs font-bold mt-1" style={{ color: "var(--app-danger)" }}>
                          Все города уничтожены — страна выбывает
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-xs text-white/60">Средний уровень</div>
                      <div className="text-lg font-bold text-white">{lifeQuality}%</div>
                      <div className="w-px h-8 bg-white/10" />
                      <div className="text-xs text-white/60">Бюджет</div>
                      <div className="text-lg font-bold text-white">{budget}$</div>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    {cities.map((city) => (
                      <div
                        key={city.id}
                        className="rounded-[16px] p-4"
                        style={{
                          background: "rgba(255, 255, 255, 0.04)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          opacity: city.destroyed ? 0.5 : 1,
                        }}
                      >
                        <div className="h-24 rounded-[12px] mb-3"
                             style={{
                               background:
                                 "linear-gradient(135deg, color-mix(in srgb, var(--app-accent-strong) 35%, transparent), color-mix(in srgb, var(--app-success) 35%, transparent))",
                               border: "1px solid rgba(255,255,255,0.08)"
                             }} />
                        <div className="text-sm font-bold text-white mb-2">{city.name}</div>
                        <div className="text-xs text-white/60 mb-3">
                          Уровень: {city.lifeLevel}% • Доход: {Math.round(city.income * incomeMultiplier)}$
                        </div>
                        <div className="space-y-3">
                          {(() => {
                            const targetLevel =
                              typeof draftLifeTargets[city.id] === "number"
                                ? draftLifeTargets[city.id]
                                : city.lifeLevel;
                            const currentTarget = Math.round(targetLevel);
                            const currentCost = getCityUpgradeCost(city, currentTarget);
                            const otherCost = draftCost - currentCost;
                            const budgetForCity = Math.max(0, budget - otherCost);
                            const maxAffordable = getMaxAffordableLevel(city, budgetForCity);
                            const clampedTarget = Math.min(currentTarget, maxAffordable);
                            const upgradeCost = getCityUpgradeCost(city, clampedTarget);
                            const projectedIncome = getProjectedIncome(city, clampedTarget);
                            const deltaIncome = projectedIncome - city.income;
                            return (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs text-white/60">
                                  <span>Уровень жизни (1-100%)</span>
                                  <span>
                                    +{deltaIncome > 0 ? deltaIncome : 0}$ дохода
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="range"
                                    min={Math.round(city.lifeLevel)}
                                    max={maxAffordable}
                                    value={Math.round(clampedTarget)}
                                    onChange={(e) => handleLifeTargetChange(city.id, Number(e.target.value))}
                                    disabled={city.destroyed || decisionsLocked || isEliminated}
                                    className="flex-1"
                                    style={{ accentColor: "var(--app-success)" }}
                                  />
                                  <div className="text-xs text-white/60 w-12 text-right">
                                    {Math.round(clampedTarget)}%
                                  </div>
                                  <button
                                    onClick={() => handleResetLifeTarget(city.id)}
                                    disabled={city.destroyed || decisionsLocked || isEliminated}
                                    className="w-8 h-8 rounded-[8px] text-white font-bold"
                                    style={{
                                      background: "color-mix(in srgb, var(--app-success) 18%, transparent)",
                                      border: "1px solid color-mix(in srgb, var(--app-success) 40%, transparent)",
                                    }}
                                  >
                                    -
                                  </button>
                                </div>
                                <div className="text-[11px] text-white/60">
                                  Стоимость улучшения: {upgradeCost}$ 
                                </div>
                                <div className="text-[11px] text-white/60">
                                  Доход после улучшения: {projectedIncome}$ 
                                </div>
                                <div className="text-[11px] text-white/60">
                                  Щиты: {city.shields} {draftShields[city.id] ? `(+${draftShields[city.id]})` : ""}
                                </div>
                              </div>
                            );
                          })()}

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleAddShield(city.id)}
                              disabled={city.destroyed || decisionsLocked || isEliminated}
                              className="flex-1 rounded-[10px] px-3 py-2 text-xs font-bold text-white"
                              style={{
                                background: "rgba(192, 132, 252, 0.25)",
                                border: "1px solid rgba(192, 132, 252, 0.5)",
                              }}
                            >
                              Щит
                            </button>
                            <button
                              onClick={() => handleRemoveShield(city.id)}
                              disabled={city.destroyed || decisionsLocked || isEliminated || (draftShields[city.id] || 0) === 0}
                              className="w-8 h-8 rounded-[8px] text-white font-bold"
                              style={{
                                background: "rgba(192, 132, 252, 0.15)",
                                border: "1px solid rgba(192, 132, 252, 0.4)",
                                opacity: (draftShields[city.id] || 0) === 0 ? 0.4 : 1,
                              }}
                            >
                              -
                            </button>
                            <div className="text-xs text-white/60 w-8 text-center">
                              +{draftShields[city.id] || 0}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="rounded-[16px] p-4"
                         style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div className="text-sm font-bold text-white mb-3">💣 Ядерное оружие</div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleDevelopNuclear}
                          disabled={decisionsLocked || isEliminated}
                          className="flex-1 rounded-[10px] px-3 py-2 text-xs font-bold text-white"
                          style={{
                            background: "color-mix(in srgb, var(--app-warning) 25%, transparent)",
                            border: "1px solid color-mix(in srgb, var(--app-warning) 55%, transparent)",
                          }}
                        >
                          Разработать (+1) • {nukeCost}$
                        </button>
                        <button
                          onClick={handleRemoveNuclear}
                          disabled={decisionsLocked || isEliminated || draftNukes === 0}
                          className="w-8 h-8 rounded-[8px] text-white font-bold"
                          style={{
                            background: "color-mix(in srgb, var(--app-warning) 18%, transparent)",
                            border: "1px solid color-mix(in srgb, var(--app-warning) 40%, transparent)",
                            opacity: draftNukes === 0 ? 0.4 : 1,
                          }}
                        >
                          -
                        </button>
                      </div>
                      <div className="text-xs text-white/60 mt-2">
                        В очереди: {draftNukes} • Готово: {nuclearWeapons}
                      </div>
                      <button
                        onClick={() => setShowNukeModal(true)}
                        disabled={decisionsLocked || nuclearWeapons === 0 || !nukesUnlocked}
                        className="w-full rounded-[10px] px-3 py-2 text-xs font-bold text-white mt-3"
                        style={{
                          background: "color-mix(in srgb, var(--app-danger) 25%, transparent)",
                          border: "1px solid color-mix(in srgb, var(--app-danger) 55%, transparent)",
                          opacity: nuclearWeapons === 0 || !nukesUnlocked ? 0.4 : 1,
                        }}
                      >
                        Применить бомбы ({totalLaunchBombs}/{nuclearWeapons})
                      </button>
                      <div className="text-[10px] text-white/50 mt-2">
                        Доступно с {nukeUnlockRound} раунда.
                      </div>
                    </div>
                    <div className="rounded-[16px] p-4"
                         style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div className="text-sm font-bold text-white mb-3">📜 Санкции</div>
                      <div className="flex gap-2 mb-3">
                        <select
                          value={selectedSanctionTargetId}
                          onChange={(e) => setSelectedSanctionTargetId(e.target.value)}
                          disabled={decisionsLocked || sanctionableCountries.length === 0}
                          className="flex-1 rounded-[10px] px-3 py-2 text-xs text-white"
                          style={{ background: "var(--app-input)", border: "1px solid rgba(255,255,255,0.1)" }}
                        >
                          <option value="">Выбери страну</option>
                          {sanctionableCountries.map((country) => (
                            <option key={country.id} value={country.id}>
                              {country.flag} {country.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-3">
                        <div className="text-[11px] font-bold text-white/70 mb-2">
                          Выбранные страны в этом раунде
                        </div>
                        {selectedSanctionCountries.length > 0 ? (
                          <div className="space-y-2">
                            {selectedSanctionCountries.map((country) => (
                              <div
                                key={country.id}
                                className="flex items-center justify-between rounded-[10px] px-3 py-2"
                                style={{
                                  background: "rgba(255,255,255,0.06)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                }}
                              >
                                <div className="text-xs font-bold text-white">
                                  {country.flag} {country.name}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSanctionTarget(country.id)}
                                  disabled={decisionsLocked}
                                  className="w-6 h-6 rounded-full text-xs font-bold text-white"
                                  style={{
                                    background: "rgba(255,255,255,0.08)",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                  }}
                                >
                                  x
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div
                            className="rounded-[10px] px-3 py-2 text-[11px] text-white/45"
                            style={{
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.06)",
                            }}
                          >
                            Пока нет выбранных санкций.
                          </div>
                        )}
                      </div>
                      <div className="mt-3">
                        <div className="text-[11px] font-bold text-white/70 mb-2">
                          Уже использованные санкции
                        </div>
                        {usedSanctionCountries.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {usedSanctionCountries.map((country) => (
                              <div
                                key={`used-${country.id}`}
                                className="rounded-full px-2 py-1 text-[10px] font-bold text-white"
                                style={{
                                  background: "rgba(255,255,255,0.06)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                }}
                              >
                                {country.flag} {country.name}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-white/45">
                            Вы ещё не накладывали санкции.
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleAddSanctionTarget}
                        disabled={decisionsLocked || !selectedSanctionTargetId}
                        className="mt-4 w-full rounded-[10px] px-3 py-2 text-xs font-bold text-white"
                        style={{
                          background: "color-mix(in srgb, var(--app-warning) 22%, transparent)",
                          border: "1px solid color-mix(in srgb, var(--app-warning) 45%, transparent)",
                          opacity: !selectedSanctionTargetId ? 0.5 : 1,
                        }}
                      >
                        Наложить санкции
                      </button>
                    </div>
                    <div className="rounded-[16px] p-4"
                         style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div className="text-sm font-bold text-white mb-3">💸 Переводы</div>
                      <button
                        onClick={handleOpenTransferModal}
                        disabled={decisionsLocked || otherCountries.length === 0}
                        className="w-full rounded-[10px] px-3 py-2 text-xs font-bold text-white mb-3"
                        style={{
                          background: "color-mix(in srgb, var(--app-accent-strong) 25%, transparent)",
                          border: "1px solid color-mix(in srgb, var(--app-accent-strong) 55%, transparent)",
                          opacity: otherCountries.length === 0 ? 0.4 : 1,
                        }}
                      >
                        Сделать перевод
                      </button>
                      <div className="text-xs text-white/50">
                        Перевод применяется сразу после подтверждения.
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[16px] p-4"
                       style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-bold text-white">🤝 Переговоры</div>
                      <button
                        onClick={() => setShowNegotiations(true)}
                        className="rounded-full px-3 py-1 text-xs font-bold text-white"
                        style={{
                          background: "color-mix(in srgb, var(--app-accent-strong) 25%, transparent)",
                          border: "1px solid color-mix(in srgb, var(--app-accent-strong) 55%, transparent)",
                        }}
                      >
                        Открыть
                      </button>
                    </div>
                    <div className="text-xs text-white/60">
                      Входящие: {incomingRequests.length} • Активные: {activeNegotiations.length} • Исходящие: {outgoingRequests.length}
                    </div>
                  </div>

                  <div className="rounded-[16px] p-4"
                       style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="text-sm font-bold text-white mb-2">Отданные приказы</div>
                    <div className="text-xs text-white/70 space-y-1">
                      <div>Расходы: {draftCost}$</div>
                      <div>Остаток: {availableBudget}$</div>
                      <div>
                        Доходы: {cities.reduce((sum, c) => sum + Math.round(c.income * incomeMultiplier), 0)}$
                      </div>
                      <div>Бомбы к запуску: {totalLaunchBombs}</div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleApplyDecisions}
                      disabled={applying || decisionsLocked}
                      className="btn-success w-full rounded-[15px] h-[60px] text-lg font-bold text-white"
                      style={{ opacity: decisionsLocked ? 0.6 : 1 }}
                    >
                      {applying ? "Отправка..." : "✅ ПРИНЯТЬ РЕШЕНИЯ"}
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleCancelDecisions}
                      disabled={!decisionsLocked}
                      className="w-full rounded-[15px] h-[60px] text-lg font-bold text-white"
                      style={{
                        background: "color-mix(in srgb, var(--app-danger) 28%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--app-danger) 60%, transparent)",
                        opacity: decisionsLocked ? 1 : 0.6,
                      }}
                    >
                      ↩ ОТМЕНИТЬ
                    </motion.button>
                  </div>

                  {actionError && (
                    <div className="text-center text-sm" style={{ color: "var(--app-danger)" }}>
                      {actionError}
                    </div>
                  )}
                  {actionInfo && (
                    <div className="text-center text-sm" style={{ color: "var(--app-success)" }}>
                      {actionInfo}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="w-[350px] h-full custom-scrollbar overflow-y-auto min-h-0"
             style={{
               background: "var(--app-surface-strong)",
               borderLeft: "1px solid rgba(255, 255, 255, 0.05)"
             }}>
          <div className="p-6">
            <h3 className="text-2xl font-bold mb-6 text-center" style={{ color: "var(--app-accent-strong)" }}>
              🌍 Другие страны
            </h3>

            <div className="space-y-4">
              {otherCountries.map((country) => {
                const aliveCities = country.cities.filter((c) => !c.destroyed).length;
                const destroyed = aliveCities === 0;
                const isReady = decisionsReady.includes(country.id);
                return (
                  <div
                    key={country.id}
                    className="rounded-[12px] p-4"
                    style={{
                      background: destroyed
                        ? "color-mix(in srgb, var(--app-danger) 12%, transparent)"
                        : "rgba(255, 255, 255, 0.05)",
                      borderLeft: `4px solid ${destroyed ? "var(--app-danger)" : isReady ? "var(--app-success)" : "var(--app-accent-strong)"}`,
                      filter: destroyed ? "grayscale(100%)" : "none",
                      opacity: destroyed ? 0.6 : 1
                    }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-3xl" style={{ color: "#ffffff" }}>
                        {country.flag}
                      </span>
                      <span
                        className="font-bold text-white text-lg"
                        style={{ textDecoration: destroyed ? "line-through" : "none" }}
                      >
                        {country.name}
                      </span>
                      {isReady && state.phase === "decisions" && (
                        <span className="ml-auto text-xs font-bold" style={{ color: "var(--app-success)" }}>
                          ГОТОВО
                        </span>
                      )}
                      {destroyed && <span className="text-2xl">💀</span>}
                    </div>
                    <div className="text-sm" style={{ color: "rgba(255, 255, 255, 0.7)" }}>
                      Города: {aliveCities}/{country.cities.length}
                    </div>
                  </div>
                );
              })}
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowStats(true)}
              className="btn-primary w-full rounded-[12px] h-[50px] font-bold text-white mt-6"
            >
              📊 Статистика
            </motion.button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed left-1/2 top-4 -translate-x-1/2 z-50"
          >
            <div
              className="rounded-full px-5 py-2 text-sm font-bold text-white"
              style={{
                background: "var(--app-success)",
                boxShadow: "0 12px 30px color-mix(in srgb, var(--app-success) 35%, transparent)",
              }}
            >
              {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {quizQuestion && state.phase === "decisions" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center px-4"
            style={{ zIndex: 60, background: "rgba(0, 0, 0, 0.75)", backdropFilter: "blur(10px)" }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="w-full max-w-2xl rounded-[24px] overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.98) 100%)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
              }}
            >
              <div className="w-full h-1.5" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div
                  style={{
                    height: "100%",
                    background: quizSeconds <= 5
                      ? "linear-gradient(90deg, #ef4444, #f97316)"
                      : "linear-gradient(90deg, var(--app-accent), var(--app-success))",
                    width: `${Math.min(100, (quizSeconds / 30) * 100)}%`,
                    transition: "width 1s linear, background 0.5s ease",
                  }}
                />
              </div>
              <div className="p-7">
                <div className="flex items-center justify-between mb-5">
                  <div
                    className="rounded-full px-3 py-1 text-xs font-bold"
                    style={{
                      background: "rgba(99,102,241,0.2)",
                      border: "1px solid rgba(99,102,241,0.4)",
                      color: "#a5b4fc",
                    }}
                  >
                    🧠 Раунд {quizQuestion.round}
                  </div>
                  <div
                    className={`flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full ${quizSeconds <= 5 ? "animate-pulse" : ""}`}
                    style={{
                      color: quizSeconds <= 5 ? "#ef4444" : "#34d399",
                      background: quizSeconds <= 5 ? "rgba(239,68,68,0.12)" : "rgba(52,211,153,0.12)",
                      border: `1px solid ${quizSeconds <= 5 ? "rgba(239,68,68,0.3)" : "rgba(52,211,153,0.3)"}`,
                    }}
                  >
                    ⏱ {quizSeconds}с
                  </div>
                </div>
                <div
                  className="text-xl font-bold text-white mb-6 leading-relaxed"
                  style={{ userSelect: "none" }}
                  onCopy={(e) => e.preventDefault()}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {quizQuestion.text}
                </div>
                <div className={`grid gap-3 ${quizQuestion.options.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {quizQuestion.options.map((option, idx) => {
                    const letters = ["A", "B", "C", "D"];
                    const isCorrect = idx === quizQuestion.correctIndex;
                    const isChosen = quizResult !== null;
                    let bg = "rgba(255, 255, 255, 0.06)";
                    let border = "1px solid rgba(255, 255, 255, 0.1)";
                    let textColor = "white";
                    if (isChosen && isCorrect) {
                      bg = "rgba(52, 211, 153, 0.18)";
                      border = "1px solid rgba(52, 211, 153, 0.55)";
                      textColor = "#34d399";
                    } else if (isChosen) {
                      bg = "rgba(255,255,255,0.03)";
                      border = "1px solid rgba(255,255,255,0.06)";
                      textColor = "rgba(255,255,255,0.35)";
                    }
                    return (
                      <button
                        key={idx}
                        onClick={() => handleQuizAnswer(idx)}
                        disabled={quizResult !== null}
                        className="flex items-center gap-3 text-left rounded-[14px] px-4 py-3.5 font-semibold transition-all"
                        style={{
                          background: bg,
                          border,
                          color: textColor,
                          userSelect: "none",
                          cursor: isChosen ? "default" : "pointer",
                        }}
                        onCopy={(e) => e.preventDefault()}
                      >
                        <span
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                          style={{
                            background: isChosen && isCorrect ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.1)",
                            color: isChosen && isCorrect ? "#34d399" : "rgba(255,255,255,0.55)",
                          }}
                        >
                          {letters[idx]}
                        </span>
                        <span className="text-sm leading-snug">{option}</span>
                        {isChosen && isCorrect && <span className="ml-auto text-base">✓</span>}
                      </button>
                    );
                  })}
                </div>
                {quizResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-5 rounded-[12px] px-4 py-3 text-sm font-bold text-center"
                    style={{
                      background: quizResult === "correct"
                        ? "rgba(52,211,153,0.12)"
                        : quizResult === "timeout"
                        ? "rgba(251,191,36,0.12)"
                        : "rgba(239,68,68,0.12)",
                      border: `1px solid ${quizResult === "correct" ? "rgba(52,211,153,0.3)" : quizResult === "timeout" ? "rgba(251,191,36,0.3)" : "rgba(239,68,68,0.3)"}`,
                      color: quizResult === "correct" ? "#34d399" : quizResult === "timeout" ? "#fbbf24" : "#ef4444",
                    }}
                  >
                    {quizResult === "correct"
                      ? `🎉 Верно! +${quizReward}$`
                      : quizResult === "timeout"
                      ? "⏰ Время вышло!"
                      : "❌ Неверный ответ"}
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 px-4"
            style={{ background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(8px)" }}
            onClick={handleCloseStats}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-5xl rounded-[20px] p-6"
              style={{
                background: "var(--app-surface)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="text-xl font-bold text-white">Статистика стран</div>
                <button
                  onClick={handleCloseStats}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.1)" }}
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div
                  className="rounded-[14px] p-4"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <div className="text-sm font-bold text-white mb-3">Санкции</div>
                  {sanctionHistory.length > 0 ? (
                    <div className="space-y-2">
                      {sanctionHistory.map((item, index) => {
                        const fromCountry = state.countries.find((country) => country.id === item.fromCountryId);
                        const toCountry = state.countries.find((country) => country.id === item.toCountryId);
                        return (
                          <div key={`${item.fromCountryId}-${item.toCountryId}-${index}`} className="text-xs text-white/70">
                            Раунд {item.roundIssued}: {fromCountry?.flag || ""} {fromCountry?.name || item.fromCountryId} {" -> "} {toCountry?.flag || ""} {toCountry?.name || item.toCountryId}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-white/50">Санкции еще не применялись.</div>
                  )}
                </div>

                {state.countries.map((country) => {
                  const eliminated = country.cities.every((c) => c.destroyed || c.lifeLevel <= 0);
                  const aliveCount = country.cities.filter((c) => !c.destroyed && c.lifeLevel > 0).length;
                  const historyData = (country.history || []).map((entry) => ({
                    round: entry.round,
                    value: Number(entry.avgLife.toFixed(1)),
                  }));
                  return (
                    <div
                      key={country.id}
                      className="rounded-[14px] p-4"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{country.flag}</span>
                          <div>
                            <div
                              className="text-sm font-bold text-white"
                              style={{
                                textDecoration: eliminated ? "line-through" : "none",
                                opacity: eliminated ? 0.6 : 1,
                              }}
                            >
                              {country.name}
                            </div>
                            <div className="text-xs text-white/50">
                              Города: {aliveCount}/{country.cities.length}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-white/50">Средний уровень</div>
                          <div className="text-sm font-bold text-white">
                            {country.stats.avgLife.toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-[1.6fr_0.6fr] gap-4">
                        <div className="space-y-2">
                          {country.cities.map((city) => {
                            const destroyed = city.destroyed || city.lifeLevel <= 0;
                            const level = Math.max(0, Math.round(city.lifeLevel));
                            const justDestroyed = destroyedThisRound.has(
                              `${country.id}:${city.id}`
                            );
                            return (
                              <div key={city.id} className="flex items-center gap-3 relative">
                                <div
                                  className="w-28 text-xs"
                                  style={{
                                    color: destroyed ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.85)",
                                    textDecoration: destroyed ? "line-through" : "none",
                                  }}
                                >
                                  {city.name}
                                </div>
                                <div
                                  className="flex-1 h-2 rounded-full"
                                  style={{ background: "rgba(255,255,255,0.08)" }}
                                >
                                  <div
                                    className="h-2 rounded-full"
                                    style={{
                                      width: `${level}%`,
                                      background: destroyed
                                        ? "color-mix(in srgb, var(--app-danger) 70%, transparent)"
                                        : "linear-gradient(90deg, var(--app-success), var(--app-accent))",
                                    }}
                                  />
                                </div>
                                <div
                                  className="w-12 text-right text-xs"
                                  style={{
                                    color: destroyed ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.7)",
                                  }}
                                >
                                  {level}%
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="h-[110px]">
                          <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={historyData}>
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                                <XAxis dataKey="round" stroke="rgba(255,255,255,0.4)" />
                                <YAxis stroke="rgba(255,255,255,0.4)" />
                                <Tooltip />
                              <Line
                                type="monotone"
                                dataKey="value"
                                stroke="var(--app-accent)"
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                              />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNegotiations && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 px-4"
            style={{ background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(8px)" }}
            onClick={() => {
              setShowNegotiations(false);
              setActiveNegotiation(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-5xl rounded-[20px] p-6"
              style={{
                background: "var(--app-surface)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-xl font-bold text-white">Переговоры</div>
                <button
                  onClick={() => {
                    setShowNegotiations(false);
                    setActiveNegotiation(null);
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.1)" }}
                >
                  ✕
                </button>
              </div>

              <div className="grid md:grid-cols-[280px_1fr] gap-6">
                <div className="space-y-4">
                  <div className="rounded-[12px] p-3"
                       style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <div className="text-sm font-bold text-white mb-2">Отправить запрос</div>
                    <select
                      value={negotiationTargetId}
                      onChange={(e) => setNegotiationTargetId(e.target.value)}
                      className="w-full rounded-[10px] px-3 py-2 text-xs text-white mb-2"
                      style={{ background: "var(--app-input)", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      {otherCountries.map((country) => (
                        <option key={country.id} value={country.id}>
                          {country.flag} {country.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleRequestNegotiation(negotiationTargetId)}
                      className="w-full rounded-[10px] h-[34px] text-xs font-bold text-white"
                      style={{ background: "var(--app-accent)" }}
                    >
                      Отправить
                    </button>
                  </div>

                  <div className="rounded-[12px] p-3"
                       style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <div className="text-sm font-bold text-white mb-2">Входящие запросы</div>
                    {incomingRequests.length ? (
                      <div className="space-y-2">
                        {incomingRequests.map((request) => {
                          const from = state.countries.find((c) => c.id === request.country_a_id);
                          return (
                            <div key={request.id} className="text-xs text-white/70">
                              <div className="mb-2">{from?.flag} {from?.name}</div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleAcceptNegotiation(request.id)}
                                  className="flex-1 rounded-[8px] py-1 text-xs font-bold text-white"
                                  style={{ background: "var(--app-success)" }}
                                >
                                  Принять
                                </button>
                                <button
                                  onClick={() => handleRejectNegotiation(request.id)}
                                  className="flex-1 rounded-[8px] py-1 text-xs font-bold text-white"
                                  style={{ background: "rgba(255,255,255,0.15)" }}
                                >
                                  Отклонить
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-white/50">Нет запросов.</div>
                    )}
                  </div>

                  <div className="rounded-[12px] p-3"
                       style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <div className="text-sm font-bold text-white mb-2">Активные</div>
                    {activeNegotiations.length ? (
                      <div className="space-y-2">
                        {activeNegotiations.map((negotiation) => {
                          const otherId =
                            negotiation.country_a_id === myCountry?.id
                              ? negotiation.country_b_id
                              : negotiation.country_a_id;
                          const other = state.countries.find((c) => c.id === otherId);
                          return (
                            <button
                              key={negotiation.id}
                              onClick={() => handleOpenNegotiation(negotiation)}
                              className="w-full text-left rounded-[10px] px-3 py-2 text-xs font-bold text-white"
                              style={{
                                background: "color-mix(in srgb, var(--app-accent-strong) 18%, transparent)",
                                border: "1px solid color-mix(in srgb, var(--app-accent-strong) 40%, transparent)",
                              }}
                            >
                              {other?.flag} {other?.name || "Страна"}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-white/50">Нет активных переговоров.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-[14px] p-4 flex flex-col"
                     style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  {activeNegotiation ? (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-bold text-white">Чат переговоров</div>
                        <button
                          onClick={handleEndNegotiation}
                          className="rounded-full px-3 py-1 text-xs font-bold text-white"
                          style={{ background: "rgba(255,255,255,0.15)" }}
                        >
                          Завершить
                        </button>
                      </div>
                      <div className="flex-1 custom-scrollbar overflow-y-auto mb-4">
                        {activeNegotiationMessages.length ? (
                          <div className="space-y-3">
                            {activeNegotiationMessages.map((msg, index) => (
                              <div key={index} className="flex gap-3">
                                <span className="text-2xl">{msg.avatar}</span>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-white">
                                      {msg.flag} {msg.country}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenChatProfile(msg.userId)}
                                      className="text-xs font-bold hover:underline"
                                      style={{
                                        color: "var(--app-accent-strong)",
                                        cursor: msg.userId ? "pointer" : "default",
                                      }}
                                    >
                                      {msg.player}
                                    </button>
                                  </div>
                                  <div className="text-sm text-white/90">{msg.text}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-white/50">Сообщений пока нет.</div>
                        )}
                      </div>
                      <form onSubmit={handleSendNegotiationMessage} className="flex gap-2">
                        <input
                          type="text"
                          value={negotiationText}
                          onChange={(e) => setNegotiationText(e.target.value)}
                          placeholder="Сообщение..."
                          className="flex-1 rounded-[10px] p-2 text-white text-sm"
                          style={{ background: "var(--app-input)", border: "1px solid rgba(255,255,255,0.1)" }}
                        />
                        <button
                          type="submit"
                          className="w-10 h-10 rounded-[10px] text-white font-bold"
                          style={{ background: "var(--app-accent)" }}
                        >
                          ➤
                        </button>
                      </form>
                    </>
                  ) : (
                    <div className="text-sm text-white/60">
                      Выберите активные переговоры или отправьте запрос.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNukeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 px-4"
            style={{ background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowNukeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl rounded-[20px] p-6"
              style={{
                background: "var(--app-surface)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-xl font-bold text-white">Применение ядерных бомб</div>
                <button
                  onClick={() => setShowNukeModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.1)" }}
                >
                  ✕
                </button>
              </div>

              {!nukesUnlocked && (
                <div className="text-sm text-white/60 mb-4">
                  Ядерное оружие доступно с {nukeUnlockRound} раунда.
                </div>
              )}
              {targetableCountries.length === 0 && (
                <div className="text-sm text-white/60 mb-4">
                  Нет доступных стран для удара.
                </div>
              )}

              <div className="grid md:grid-cols-3 gap-3 mb-4">
                <select
                  value={launchTargetCountry}
                  onChange={(e) => setLaunchTargetCountry(e.target.value)}
                  className="rounded-[10px] px-3 py-2 text-xs text-white"
                  style={{ background: "var(--app-input)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {targetableCountries.map((country) => (
                    <option key={country.id} value={country.id}>
                      {country.flag} {country.name}
                    </option>
                  ))}
                </select>
                <select
                  value={launchTargetCity}
                  onChange={(e) => setLaunchTargetCity(e.target.value)}
                  className="rounded-[10px] px-3 py-2 text-xs text-white"
                  style={{ background: "var(--app-input)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {targetableCountries
                    .find((c) => c.id === launchTargetCountry)
                    ?.cities.filter((city) => !city.destroyed && city.lifeLevel > 0).map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={launchBombs}
                  onChange={(e) => setLaunchBombs(Number(e.target.value))}
                  className="rounded-[10px] px-3 py-2 text-xs text-white"
                  style={{ background: "var(--app-input)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>

              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={handleAddLaunch}
                  disabled={!nukesUnlocked || nuclearWeapons === 0 || targetableCountries.length === 0}
                  className="rounded-[10px] px-4 py-2 text-xs font-bold text-white"
                  style={{ background: "var(--app-danger)", opacity: !nukesUnlocked ? 0.5 : 1 }}
                >
                  Добавить цель
                </button>
                <div className="text-xs text-white/60">
                  Использовано: {totalLaunchBombs}/{nuclearWeapons}
                </div>
              </div>

              <div className="space-y-2">
                {draftLaunches.length ? (
                  draftLaunches.map((item) => {
                    const targetCountry = state.countries.find((c) => c.id === item.targetCountryId);
                    const targetCity = targetCountry?.cities.find((c) => c.id === item.targetCityId);
                    return (
                      <div
                        key={item.id}
                        className="rounded-[12px] p-3 flex items-center justify-between"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                      >
                        <div className="text-xs text-white">
                          {targetCountry?.flag} {targetCountry?.name} → {targetCity?.name}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDecreaseLaunch(item.id)}
                            className="w-7 h-7 rounded-[6px] text-white font-bold"
                            style={{ background: "color-mix(in srgb, var(--app-danger) 22%, transparent)" }}
                          >
                            -
                          </button>
                          <div className="text-xs text-white">{item.bombs}</div>
                          <button
                            onClick={() => handleIncreaseLaunch(item.id)}
                            className="w-7 h-7 rounded-[6px] text-white font-bold"
                            style={{ background: "color-mix(in srgb, var(--app-danger) 35%, transparent)" }}
                          >
                            +
                          </button>
                          <button
                            onClick={() => handleRemoveLaunch(item.id)}
                            className="w-7 h-7 rounded-[6px] text-white font-bold"
                            style={{ background: "rgba(255,255,255,0.15)" }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-white/60">Цели не выбраны.</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTransferModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 px-4"
            style={{ background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowTransferModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-[18px] p-6"
              style={{
                background: "var(--app-surface)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-bold text-white">Перевод средств</div>
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.1)" }}
                >
                  ✕
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-white/60 mb-1">Кому перевести</div>
                  <select
                    value={transferTargetId}
                    onChange={(e) => setTransferTargetId(e.target.value)}
                    className="w-full rounded-[10px] px-3 py-2 text-sm text-white"
                    style={{ background: "var(--app-input)", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    {otherCountries.map((country) => (
                      <option key={country.id} value={country.id}>
                        {country.flag} {country.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-xs text-white/60 mb-1">Сумма</div>
                  <input
                    type="number"
                    min={0}
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(Number(e.target.value))}
                    className="w-full rounded-[10px] px-3 py-2 text-sm text-white"
                    style={{ background: "var(--app-input)", border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={handleConfirmTransfer}
                  className="flex-1 rounded-[10px] h-[42px] font-bold text-white"
                  style={{ background: "var(--app-success)" }}
                >
                  Перевести
                </button>
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 rounded-[10px] h-[42px] font-bold text-white"
                  style={{ background: "rgba(255, 255, 255, 0.1)" }}
                >
                  Отмена
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

      {/* RESULTS SCREEN overlay */}
      <AnimatePresence>
        {finalRankings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center px-4"
            style={{ zIndex: 70, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)" }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", damping: 18, stiffness: 250 }}
              className="w-full max-w-2xl rounded-[28px] overflow-hidden"
              style={{
                background: "linear-gradient(160deg, rgba(15,23,42,0.99) 0%, rgba(30,41,59,0.99) 100%)",
                border: "1px solid rgba(255,255,255,0.15)",
                boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
              }}
            >
              {/* Header */}
              <div className="px-8 pt-8 pb-4 text-center"
                   style={{ background: "linear-gradient(180deg, rgba(99,102,241,0.15) 0%, transparent 100%)" }}>
                <div className="text-5xl mb-3">🏆</div>
                <h2 className="text-3xl font-black text-white mb-1">Игра завершена!</h2>
                <p className="text-white/50 text-sm">Финальная таблица лидеров</p>
                {state?.phase === "results" && state.phaseEndsAt && (
                  <div className="mt-3 text-xs text-white/40">
                    Авто-переход к итогам через {Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000))}с
                  </div>
                )}
              </div>

              {/* Rankings */}
              <div className="px-8 pb-4 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {finalRankings.map((country, idx) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  const medal = medals[idx] || `${idx + 1}.`;
                  const isWinner = idx === 0 && !country.eliminated;
                  return (
                    <motion.div
                      key={country.countryId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.07 }}
                      className="rounded-[16px] px-5 py-4 flex items-center gap-4"
                      style={{
                        background: isWinner
                          ? "linear-gradient(135deg, rgba(250,204,21,0.15), rgba(251,146,60,0.10))"
                          : country.eliminated
                          ? "rgba(255,255,255,0.03)"
                          : "rgba(255,255,255,0.06)",
                        border: isWinner
                          ? "1px solid rgba(250,204,21,0.4)"
                          : "1px solid rgba(255,255,255,0.08)",
                        opacity: country.eliminated ? 0.5 : 1,
                      }}
                    >
                      <div className="text-2xl w-8 text-center shrink-0">{medal}</div>
                      <div className="text-3xl shrink-0">{country.flag}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white text-base flex items-center gap-2">
                          {country.name}
                          {country.eliminated && <span className="text-xs font-normal text-red-400">💀 выбыла</span>}
                          {isWinner && <span className="text-xs font-bold text-yellow-400">👑 ПОБЕДИТЕЛЬ</span>}
                        </div>
                        <div className="flex gap-4 mt-1 text-xs text-white/50">
                          <span>🏙 {country.aliveCities}/{country.totalCities} городов</span>
                          <span>❤️ {country.avgLife}% жизнь</span>
                          <span>💰 {country.money.toLocaleString()}$</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl font-black" style={{ color: isWinner ? "#fbbf24" : "rgba(255,255,255,0.8)" }}>
                          {country.score.toLocaleString()}
                        </div>
                        <div className="text-xs text-white/40">очков</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Stats summary */}
              {state && (
                <div className="px-8 pb-6">
                  <div className="rounded-[14px] px-5 py-4 grid grid-cols-3 gap-4 text-center"
                       style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div>
                      <div className="text-xl font-bold text-white">{state.currentRound}</div>
                      <div className="text-xs text-white/40">раундов сыграно</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white">
                        {state.countries.filter(c => !c.cities.every((x: any) => x.destroyed)).length}
                      </div>
                      <div className="text-xs text-white/40">стран выжило</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white">
                        {state.countries.reduce((sum: number, c: any) => sum + c.cities.filter((x: any) => x.destroyed).length, 0)}
                      </div>
                      <div className="text-xs text-white/40">городов уничтожено</div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
  );
}
