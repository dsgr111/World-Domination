import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { api, API_URL, ApiError } from "../lib/api";
import { AppBrandLink } from "../components/AppBrandLink";
import { parseLobbyInvite, LobbyInvitePayload, isGlobalInviteHandler } from "../lib/invites";
import {
  clearAuth,
  clearLobbyId,
  getAuth,
  getLobbyId,
  setInGame,
  setInLobby,
  setLobbyId,
} from "../lib/auth";

interface ConfigCountry {
  id: string;
  name: string;
  flag: string;
  cities: { id: string; name: string; baseIncome: number; lifeLevel: number }[];
}

interface ConfigResponse {
  avatars: string[];
  countries: ConfigCountry[];
  limits: { minTeams: number; maxTeams: number; minRounds: number; maxRounds: number };
  phases: { discussionMs: number; decisionsMs: number; summaryMs: number };
  economy: { startingMoney: number; nukeCost: number; nukeUnlockRound: number };
}

interface LobbySummary {
  id: string;
  name: string;
  status: "waiting" | "in_progress" | "finished";
  maxTeams: number;
  totalRounds: number;
  playersCount: number;
  hasPassword: boolean;
  friendsOnly?: boolean;
  isFriendLobby?: boolean;
}

interface LobbyPlayer {
  user_id: number;
  country_id: string | null;
  nickname: string;
  avatar_emoji: string;
  ready?: number | boolean;
}

interface LobbyDetail {
  id: string;
  name: string;
  status: "waiting" | "in_progress" | "finished";
  maxTeams: number;
  totalRounds: number;
  hostUserId: number;
  inviteCode: string;
  inviteLink: string;
  friendsOnly?: boolean;
  countdownEndsAt?: number | null;
  players: LobbyPlayer[];
}

interface ChatMessage {
  player: string;
  avatar: string;
  text: string;
  flag?: string;
  country?: string;
  userId?: number;
}

interface UserStats {
  games: number;
  wins: number;
  losses: number;
}

interface FriendInfo {
  user_id: number;
  nickname: string;
  avatar_emoji: string;
}

interface FriendRequest {
  id: number;
  requester_id: number;
  addressee_id: number;
  nickname: string;
  avatar_emoji: string;
  created_at: number;
}

interface FriendMessage {
  sender_user_id: number;
  recipient_user_id: number;
  content: string;
  created_at: number;
}

export function Lobby() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<number | null>(null);
  const [userAvatar, setUserAvatar] = useState<string>("👑");
  const [userNickname, setUserNickname] = useState<string>("");
  const [token, setToken] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [lobbies, setLobbies] = useState<LobbySummary[]>([]);
  const [currentLobby, setCurrentLobby] = useState<LobbyDetail | null>(null);
  const [selectedCountryId, setSelectedCountryId] = useState<string>("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [siteMessages, setSiteMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [siteMessage, setSiteMessage] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinById, setShowJoinById] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [lobbySearch, setLobbySearch] = useState("");
  const [selectedGameForJoin, setSelectedGameForJoin] = useState<LobbySummary | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [newGameName, setNewGameName] = useState("");
  const [newGamePassword, setNewGamePassword] = useState("");
  const [newGameTeams, setNewGameTeams] = useState("6");
  const [newGameRounds, setNewGameRounds] = useState("6");
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [discussionSeconds, setDiscussionSeconds] = useState("60");
  const [decisionsSeconds, setDecisionsSeconds] = useState("180");
  const [revealNukes, setRevealNukes] = useState(false);
  const [incomeMultiplier, setIncomeMultiplier] = useState("1");
  const [nukeUnlockRoundSetting, setNukeUnlockRoundSetting] = useState("3");
  const [joinLobbyId, setJoinLobbyId] = useState("");
  const [joinLobbyPassword, setJoinLobbyPassword] = useState("");
  const [savedLobbyId, setSavedLobbyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<"global" | "private">("global");
  const [privateTargetId, setPrivateTargetId] = useState("");
  const [privateChats, setPrivateChats] = useState<Record<string, ChatMessage[]>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [friendRequests, setFriendRequests] = useState<{
    incoming: FriendRequest[];
    outgoing: FriendRequest[];
  }>({ incoming: [], outgoing: [] });
  const [siteChatMode, setSiteChatMode] = useState<"global" | "friends">("global");
  const [activeFriendId, setActiveFriendId] = useState<number | null>(null);
  const [friendMessages, setFriendMessages] = useState<Record<number, FriendMessage[]>>({});
  const [friendMessage, setFriendMessage] = useState("");
  const [friendUnread, setFriendUnread] = useState<Record<number, number>>({});
  const [friendToast, setFriendToast] = useState<string | null>(null);
  const [friendActivity, setFriendActivity] = useState<Record<number, number>>({});
  const [inviteQueue, setInviteQueue] = useState<LobbyInvitePayload[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteSending, setInviteSending] = useState<Record<number, boolean>>({});
  const [invitedFriends, setInvitedFriends] = useState<Record<number, boolean>>({});
  const SITE_MESSAGES_KEY = "wd_site_messages";

  const persistSiteMessages = (messages: ChatMessage[]) => {
    try {
      localStorage.setItem(SITE_MESSAGES_KEY, JSON.stringify(messages.slice(-100)));
    } catch {
      // ignore storage failures
    }
  };
  const [actionMenuUser, setActionMenuUser] = useState<{
    id: number;
    nickname: string;
    avatar: string;
    context: "lobby-chat" | "site-chat" | "player-list";
    anchorKey: string;
  } | null>(null);
  const [userStats, setUserStats] = useState<Record<number, UserStats>>({});
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const currentLobbyRef = useRef<LobbyDetail | null>(null);
  const selectedCountryRef = useRef<string>("");
  const userIdRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const friendToastTimerRef = useRef<number | null>(null);
  const siteChatModeRef = useRef(siteChatMode);
  const activeFriendIdRef = useRef<number | null>(activeFriendId);
  const userStatsRef = useRef<Record<number, UserStats>>({});
  const statsRequestRef = useRef<Set<number>>(new Set());

  const playersMap = useMemo(() => {
    const map = new Map<number, LobbyPlayer>();
    if (currentLobby?.players) {
      for (const player of currentLobby.players) {
        map.set(player.user_id, player);
      }
    }
    return map;
  }, [currentLobby]);

  useEffect(() => {
    currentLobbyRef.current = currentLobby;
  }, [currentLobby]);

  useEffect(() => {
    setInLobby(Boolean(currentLobby));
    if (currentLobby) {
      setInGame(false);
    }
    return () => {
      setInLobby(false);
    };
  }, [currentLobby]);

  useEffect(() => {
    setInvitedFriends({});
    setInviteSearch("");
  }, [currentLobby?.id]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    selectedCountryRef.current = selectedCountryId;
  }, [selectedCountryId]);

  useEffect(() => {
    siteChatModeRef.current = siteChatMode;
  }, [siteChatMode]);

  useEffect(() => {
    activeFriendIdRef.current = activeFriendId;
  }, [activeFriendId]);

  useEffect(() => {
    userStatsRef.current = userStats;
  }, [userStats]);

  useEffect(() => {
    const handleClick = () => setActionMenuUser(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const showToast = (message: string, duration = 2000) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, duration);
  };

  const showFriendToast = (message: string, duration = 10000) => {
    setFriendToast(message);
    if (friendToastTimerRef.current) {
      window.clearTimeout(friendToastTimerRef.current);
    }
    friendToastTimerRef.current = window.setTimeout(() => {
      setFriendToast(null);
    }, duration);
  };

  const enqueueInvite = (invite: LobbyInvitePayload) => {
    setInviteQueue((prev) => {
      const exists = prev.some(
        (item) =>
          item.lobbyId === invite.lobbyId &&
          item.inviterId === invite.inviterId &&
          item.createdAt === invite.createdAt
      );
      if (exists) return prev;
      return [...prev, invite];
    });
  };

  useEffect(() => {
    if (isGlobalInviteHandler()) {
      setInviteQueue([]);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (friendToastTimerRef.current) {
        window.clearTimeout(friendToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!currentLobby?.countdownEndsAt) {
      setCountdownSeconds(null);
      return;
    }
    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.ceil((currentLobby.countdownEndsAt! - Date.now()) / 1000)
      );
      setCountdownSeconds(remaining);
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(interval);
  }, [currentLobby?.countdownEndsAt]);

  const refreshLobbies = async (authToken: string) => {
    const data = await api<{ lobbies: LobbySummary[] }>("/api/lobbies", {
      token: authToken,
    });
    setLobbies(data.lobbies);
  };

  const loadLobby = async (authToken: string, lobbyId: string, currentUserId?: number | null) => {
    const previousLobbyId = currentLobbyRef.current?.id;
    const data = await api<{ lobby: LobbyDetail }>(`/api/lobbies/${lobbyId}`, {
      token: authToken,
    });
    setLobbyId(lobbyId);
    setSavedLobbyId(lobbyId);
    if (data.lobby.status !== "waiting") {
      setCurrentLobby(null);
      return data.lobby;
    }
    setCurrentLobby(data.lobby);
    if (previousLobbyId && previousLobbyId !== data.lobby.id) {
      setChatMessages([]);
      setPrivateChats({});
      setPrivateTargetId("");
      setChatMode("global");
    }
    const effectiveUserId = currentUserId ?? userId;
    const me = data.lobby.players.find((player) => player.user_id === effectiveUserId);
    setSelectedCountryId(me?.country_id || "");
    return data.lobby;
  };

  const loadLobbyMessages = async (authToken: string, lobbyId: string) => {
    const data = await api<{ messages: any[] }>(`/api/lobbies/${lobbyId}/messages?type=global`, {
      token: authToken,
    });
    const mapped = data.messages.map((msg) => {
      const sender = playersMap.get(msg.sender_user_id);
      const senderCountry = config?.countries?.find((c) => c.id === msg.sender_country_id);
      return {
        userId: msg.sender_user_id,
        player: sender?.nickname || "Игрок",
        avatar: sender?.avatar_emoji || "👤",
        text: msg.content,
        flag: senderCountry?.flag || "",
        country: senderCountry?.name || "",
      };
    });
    setChatMessages(mapped);
    void loadUserStats(
      authToken,
      mapped.map((msg) => msg.userId).filter(Boolean) as number[]
    );
  };

  const loadSiteMessages = async (authToken: string) => {
    try {
      const data = await api<{ messages: any[] }>("/api/site/messages", {
        token: authToken,
      });
      const mapped = data.messages.map((msg) => ({
        player: msg.nickname || "Игрок",
        avatar: msg.avatar_emoji || "👤",
        text: msg.content,
        userId: msg.sender_user_id,
      }));
      setSiteMessages(mapped);
      persistSiteMessages(mapped);
      void loadUserStats(
        authToken,
        mapped.map((msg) => msg.userId).filter(Boolean) as number[]
      );
    } catch {
      // keep cached messages if request fails
    }
  };

  const loadFriends = async (authToken: string) => {
    const data = await api<{ friends: FriendInfo[] }>("/api/friends", {
      token: authToken,
    });
    setFriends(data.friends || []);
  };

  const loadFriendRequests = async (authToken: string) => {
    const data = await api<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>(
      "/api/friends/requests",
      { token: authToken }
    );
    setFriendRequests({
      incoming: data.incoming || [],
      outgoing: data.outgoing || [],
    });
  };

  const loadFriendMessages = async (authToken: string, friendId: number) => {
    const data = await api<{ messages: FriendMessage[] }>(
      `/api/friends/messages?userId=${friendId}`,
      { token: authToken }
    );
    setFriendMessages((prev) => ({ ...prev, [friendId]: data.messages || [] }));
  };

  const loadPrivateMessages = async (authToken: string, lobbyId: string, targetCountryId: string) => {
    const data = await api<{ messages: any[] }>(
      `/api/lobbies/${lobbyId}/messages/private?targetCountryId=${targetCountryId}`,
      { token: authToken }
    );
    const mapped = data.messages.map((msg) => {
      const sender = currentLobbyRef.current?.players.find(
        (player) => player.user_id === msg.sender_user_id
      );
      const senderCountry = config?.countries?.find((c) => c.id === msg.sender_country_id);
      return {
        userId: msg.sender_user_id,
        player: sender?.nickname || "Игрок",
        avatar: sender?.avatar_emoji || "👤",
        text: msg.content,
        flag: senderCountry?.flag || "",
        country: senderCountry?.name || "",
      };
    });
    setPrivateChats((prev) => ({ ...prev, [targetCountryId]: mapped }));
    void loadUserStats(
      authToken,
      mapped.map((msg) => msg.userId).filter(Boolean) as number[]
    );
  };

  const loadUserStats = async (authToken: string, ids: number[]) => {
    const uniqueIds = Array.from(
      new Set(ids.filter((id) => Number.isFinite(id)))
    );
    const missing = uniqueIds.filter(
      (id) => !userStatsRef.current[id] && !statsRequestRef.current.has(id)
    );
    if (!missing.length) return;
    missing.forEach((id) => statsRequestRef.current.add(id));
    try {
      const data = await api<{ stats: Record<number, UserStats> }>(
        "/api/users/stats",
        { method: "POST", token: authToken, body: { userIds: missing } }
      );
      setUserStats((prev) => ({ ...prev, ...(data.stats || {}) }));
    } finally {
      missing.forEach((id) => statsRequestRef.current.delete(id));
    }
  };

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      navigate("/login");
      return;
    }
    setUserId(auth.user.id);
    setUserAvatar(auth.user.avatar_emoji);
    setUserNickname(auth.user.nickname);
    setToken(auth.token);

    const init = async () => {
      try {
        const cached = localStorage.getItem(SITE_MESSAGES_KEY);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as ChatMessage[];
            if (Array.isArray(parsed)) {
              setSiteMessages(parsed);
            }
          } catch {
            // ignore
          }
        }
        const configData = await api<ConfigResponse>("/api/config", {
          token: auth.token,
        });
        setConfig(configData);
        await refreshLobbies(auth.token);
        await loadSiteMessages(auth.token);
        await loadFriends(auth.token);
        await loadFriendRequests(auth.token);

        const storedLobbyId = getLobbyId();
        setSavedLobbyId(storedLobbyId);
        if (storedLobbyId) {
          try {
            await loadLobby(auth.token, storedLobbyId, auth.user.id);
          } catch {
            clearLobbyId();
            setSavedLobbyId(null);
          }
        }
      } catch {
        setErrorMessage("Не удалось загрузить данные лобби.");
      }
    };
    void init();
  }, [navigate]);

  useEffect(() => {
    if (!token) return;
    const handleExternalJoin = (event: Event) => {
      const detail = (event as CustomEvent<{ lobbyId?: string }>).detail;
      const lobbyId = detail?.lobbyId || getLobbyId();
      if (!lobbyId) return;
      setSavedLobbyId(lobbyId);
      void loadLobby(token, lobbyId, userId);
    };
    window.addEventListener("wd:lobby-join", handleExternalJoin as EventListener);
    return () => {
      window.removeEventListener("wd:lobby-join", handleExternalJoin as EventListener);
    };
  }, [token, userId]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const tick = () => {
      if (!active) return;
      refreshLobbies(token).catch(() => {});
    };
    tick();
    const interval = window.setInterval(tick, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const ids = friends.map((f) => f.user_id);
    if (userId) ids.push(userId);
    if (ids.length) {
      void loadUserStats(token, ids);
    }
  }, [friends, token, userId]);

  useEffect(() => {
    if (!token) return;
    const socket = io(API_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on("chat:site", (payload) => {
      setSiteMessages((prev) => {
        const next = [
          ...prev,
          {
            userId: payload.userId,
            player: payload.nickname || "Игрок",
            avatar: payload.avatarEmoji || "👤",
            text: payload.message,
          },
        ];
        persistSiteMessages(next);
        return next;
      });
      if (token && payload?.userId) {
        void loadUserStats(token, [payload.userId]);
      }
    });

    socket.on("chat:global", (payload) => {
      const lobby = currentLobbyRef.current;
      if (!lobby || payload?.lobbyId !== lobby.id) return;
      const senderCountry = config?.countries?.find((c) => c.id === payload.countryId);
      setChatMessages((prev) => [
        ...prev,
        {
          userId: payload.userId,
          player: payload.nickname || "Игрок",
          avatar: payload.avatarEmoji || "👤",
          text: payload.message,
          flag: senderCountry?.flag || "",
          country: senderCountry?.name || "",
        },
      ]);
      if (token && payload?.userId) {
        void loadUserStats(token, [payload.userId]);
      }
    });

    socket.on("chat:private", (payload) => {
      const lobby = currentLobbyRef.current;
      const myCountryId = selectedCountryRef.current;
      if (!lobby || !myCountryId) return;
      const sender = lobby.players.find((p) => p.country_id === payload.fromCountryId);
      const senderCountry = config?.countries?.find((c) => c.id === payload.fromCountryId);
      const otherId = payload.fromCountryId === myCountryId ? payload.toCountryId : payload.fromCountryId;
      const message = {
        userId: sender?.user_id,
        player: sender?.nickname || "Игрок",
        avatar: sender?.avatar_emoji || "👤",
        text: payload.message,
        flag: senderCountry?.flag || "",
        country: senderCountry?.name || "",
      };
      setPrivateChats((prev) => ({
        ...prev,
        [otherId]: [...(prev[otherId] || []), message],
      }));
      if (token && sender?.user_id) {
        void loadUserStats(token, [sender.user_id]);
      }
    });

    socket.on("friends:request", (payload) => {
      const requester = payload?.requester;
      if (requester?.nickname) {
        showFriendToast(`${requester.nickname} хочет добавить вас в друзья`);
      } else {
        showFriendToast("Новый запрос в друзья");
      }
      if (token) {
        void loadFriendRequests(token);
      }
    });

    socket.on("friend:message", (payload) => {
      if (!payload) return;
      const senderId = payload.senderUserId;
      const recipientId = payload.recipientUserId;
      const otherId = senderId === userIdRef.current ? recipientId : senderId;
      const invite = parseLobbyInvite(payload.content);
      const newMessage: FriendMessage = {
        sender_user_id: senderId,
        recipient_user_id: recipientId,
        content: payload.content,
        created_at: payload.createdAt,
      };
      setFriendMessages((prev) => ({
        ...prev,
        [otherId]: [...(prev[otherId] || []), newMessage],
      }));
      setFriendActivity((prev) => ({
        ...prev,
        [otherId]: payload.createdAt || Date.now(),
      }));
      if (siteChatModeRef.current !== "friends" || activeFriendIdRef.current !== otherId) {
        setFriendUnread((prev) => ({
          ...prev,
          [otherId]: (prev[otherId] || 0) + 1,
        }));
      }
      if (invite && recipientId === userIdRef.current && !isGlobalInviteHandler()) {
        enqueueInvite(invite);
      }
      if (token) {
        const ids = [senderId, recipientId].filter((id) => Number.isFinite(id));
        if (ids.length) {
          void loadUserStats(token, ids as number[]);
        }
      }
    });

    socket.on("lobby:update", (payload) => {
      const lobby = payload?.lobby;
      if (!lobby?.id) return;
      const currentId = currentLobbyRef.current?.id;
      if (currentId && lobby.id === currentId) {
        setCurrentLobby(lobby);
        const meId = userIdRef.current;
        const me = lobby.players.find((player: LobbyPlayer) => player.user_id === meId);
        setSelectedCountryId(me?.country_id || "");
      }
    });

    socket.on("lobby:countdown", (payload) => {
      const endsAt = payload?.endsAt ?? null;
      setCurrentLobby((prev) =>
        prev ? { ...prev, countdownEndsAt: endsAt } : prev
      );
    });

    socket.on("game:started", (state) => {
      if (!state?.lobbyId) return;
      setLobbyId(state.lobbyId);
      navigate("/game");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, navigate, config?.countries]);

  useEffect(() => {
    if (!currentLobby || !token) {
      setChatMessages([]);
      return;
    }
    if (currentLobby.status === "in_progress") {
      navigate("/game");
      return;
    }
    socketRef.current?.emit("lobby:join", { lobbyId: currentLobby.id });
    void loadLobbyMessages(token, currentLobby.id);
  }, [currentLobby, token, playersMap, navigate]);

  useEffect(() => {
    if (!token || !currentLobby || chatMode !== "private" || !privateTargetId) return;
    if (privateChats[privateTargetId]) return;
    void loadPrivateMessages(token, currentLobby.id, privateTargetId);
  }, [token, currentLobby, chatMode, privateTargetId, privateChats]);

  useEffect(() => {
    if (!currentLobby || !selectedCountryId || privateTargetId) return;
    const firstTarget = currentLobby.players.find(
      (player) => player.country_id && player.country_id !== selectedCountryId
    );
    if (firstTarget?.country_id) {
      setPrivateTargetId(firstTarget.country_id);
    }
  }, [currentLobby, selectedCountryId, privateTargetId]);

  useEffect(() => {
    if (!token || siteChatMode !== "friends" || !activeFriendId) return;
    if (friendMessages[activeFriendId]) return;
    void loadFriendMessages(token, activeFriendId);
  }, [token, siteChatMode, activeFriendId, friendMessages]);

  const handleLogout = () => {
    clearAuth();
    navigate("/");
  };

  const handleOpenProfile = () => {
    navigate("/profile");
  };

  const handleAddFriend = async (nickname: string) => {
    if (!token) return;
    try {
      await api("/api/friends/request", {
        method: "POST",
        token,
        body: { nickname },
      });
      showToast("Запрос в друзья отправлен");
      await loadFriendRequests(token);
    } catch (err) {
      const apiError = err as ApiError;
      const code = apiError?.data?.error || apiError.message;
      if (code === "REQUEST_EXISTS") {
        showToast("Запрос уже отправлен");
      } else if (code === "ALREADY_FRIENDS") {
        showToast("Этот пользователь уже в друзьях");
      } else if (code === "USER_NOT_FOUND") {
        showToast("Пользователь не найден");
      } else {
        showToast("Не удалось отправить запрос");
      }
    }
  };

  const handleOpenFriendChat = async (friendId: number) => {
    if (!token) return;
    setSiteChatMode("friends");
    setActiveFriendId(friendId);
    setFriendUnread((prev) => ({ ...prev, [friendId]: 0 }));
    setFriendActivity((prev) => ({ ...prev, [friendId]: Date.now() }));
    if (!friendMessages[friendId]) {
      await loadFriendMessages(token, friendId);
    }
  };

  const handleSendFriendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !activeFriendId || !friendMessage.trim()) return;
    try {
      await api("/api/friends/messages", {
        method: "POST",
        token,
        body: { targetUserId: activeFriendId, message: friendMessage },
      });
      setFriendMessage("");
    } catch (err) {
      const apiError = err as ApiError;
      const code = apiError?.data?.error || apiError.message;
      if (code === "IN_GAME") {
        showToast("Личные сообщения недоступны во время игры", 4000);
      } else {
        showToast("Не удалось отправить сообщение");
      }
    }
  };

  const handleInviteFriend = async (friendId: number) => {
    if (!token || !currentLobby) return;
    if (inviteSending[friendId]) return;
    setInviteSending((prev) => ({ ...prev, [friendId]: true }));
    try {
      await api(`/api/lobbies/${currentLobby.id}/invite`, {
        method: "POST",
        token,
        body: { targetUserId: friendId },
      });
      setInvitedFriends((prev) => ({ ...prev, [friendId]: true }));
      showToast("Приглашение отправлено");
    } catch (err) {
      const apiError = err as ApiError;
      const code = apiError?.data?.error || apiError.message;
      if (code === "ALREADY_IN_LOBBY") {
        showToast("Пользователь уже в лобби");
      } else if (code === "IN_GAME") {
        showToast("Пользователь сейчас в игре");
      } else if (code === "NOT_FRIENDS") {
        showToast("Можно приглашать только друзей");
      } else {
        showToast("Не удалось отправить приглашение");
      }
    } finally {
      setInviteSending((prev) => ({ ...prev, [friendId]: false }));
    }
  };

  const handleAcceptInvite = async (invite: LobbyInvitePayload) => {
    if (!token) return;
    try {
      await api("/api/lobbies/join-invite", {
        method: "POST",
        token,
        body: { lobbyId: invite.lobbyId, inviteCode: invite.inviteCode },
      });
      showToast("Вы присоединились к лобби");
      await loadLobby(token, invite.lobbyId, userId);
      setInviteQueue((prev) =>
        prev.filter(
          (item) =>
            !(
              item.lobbyId === invite.lobbyId &&
              item.inviterId === invite.inviterId &&
              item.createdAt === invite.createdAt
            )
        )
      );
    } catch (err) {
      const apiError = err as ApiError;
      const code = apiError?.data?.error || apiError.message;
      if (code === "ALREADY_IN_LOBBY") {
        showToast("Вы уже находитесь в лобби");
      } else if (code === "LOBBY_FULL") {
        showToast("Лобби заполнено");
      } else if (code === "LOBBY_IN_PROGRESS") {
        showToast("Игра уже началась");
      } else if (code === "INVALID_INVITE") {
        showToast("Приглашение недействительно");
      } else {
        showToast("Не удалось войти в лобби");
      }
      setInviteQueue((prev) =>
        prev.filter(
          (item) =>
            !(
              item.lobbyId === invite.lobbyId &&
              item.inviterId === invite.inviterId &&
              item.createdAt === invite.createdAt
            )
        )
      );
    }
  };

  const handleCloseInvite = () => {
    setInviteQueue((prev) => prev.slice(1));
  };

  const clampNumber = (value: string, min: number, max: number, fallback: number) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(fallback);
    return String(Math.min(max, Math.max(min, Math.floor(num))));
  };

  const handleTeamsChange = (value: string) => {
    setNewGameTeams(clampNumber(value, 2, 20, 2));
  };

  const handleRoundsChange = (value: string) => {
    setNewGameRounds(clampNumber(value, 1, 30, 1));
    const maxRound = Number(clampNumber(value, 1, 30, 1));
    const nextUnlock = Math.min(Math.max(1, Number(nukeUnlockRoundSetting) || 1), maxRound);
    setNukeUnlockRoundSetting(String(nextUnlock));
  };

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setErrorMessage(null);
    try {
      const maxTeams = Math.min(20, Math.max(2, Number(newGameTeams || 2)));
      const totalRounds = Math.min(30, Math.max(1, Number(newGameRounds || 1)));
      const discussionMs = Math.min(180, Math.max(30, Number(discussionSeconds || 60))) * 1000;
      const decisionsMs = Math.min(300, Math.max(60, Number(decisionsSeconds || 180))) * 1000;
      const multiplier = Math.min(3, Math.max(0.5, Number(incomeMultiplier || 1)));
      const nukeUnlockRound = Math.min(
        totalRounds,
        Math.max(1, Number(nukeUnlockRoundSetting || 3))
      );
      const data = await api<{ lobby: LobbyDetail }>("/api/lobbies", {
        method: "POST",
        token,
        body: {
          name: newGameName,
          maxTeams,
          totalRounds,
          password: newGamePassword || undefined,
          friendsOnly,
          settings: {
            discussionMs,
            decisionsMs,
            revealNukes,
            incomeMultiplier: multiplier,
            nukeUnlockRound,
          },
        },
      });
      await loadLobby(token, data.lobby.id, userId);
      setShowCreateForm(false);
      setNewGameName("");
      setNewGamePassword("");
      setFriendsOnly(false);
    } catch (err) {
      const apiError = err as ApiError;
      const code = apiError?.data?.error || apiError.message;
      if (code === "ALREADY_IN_LOBBY") {
        setErrorMessage("Вы уже находитесь в лобби.");
      } else {
        setErrorMessage("Не удалось создать лобби.");
      }
    }
  };

  const handleJoinGame = (game: LobbySummary) => {
    if (game.hasPassword) {
      setSelectedGameForJoin(game);
      setShowPasswordModal(true);
    } else {
      void joinLobby(game.id);
    }
  };

  const joinLobby = async (lobbyId: string, password?: string) => {
    if (!token) return;
    setErrorMessage(null);
    try {
      await api("/api/lobbies/join", {
        method: "POST",
        token,
        body: { lobbyId, password },
      });
      await loadLobby(token, lobbyId, userId);
      await refreshLobbies(token);
    } catch (err) {
      const apiError = err as ApiError;
      const code = apiError?.data?.error || apiError.message;
      if (code === "INVALID_PASSWORD") {
        setErrorMessage("Неверный пароль.");
      } else if (code === "LOBBY_FULL") {
        setErrorMessage("Лобби заполнено.");
      } else if (code === "ALREADY_IN_LOBBY") {
        setErrorMessage("Вы уже в лобби.");
      } else if (code === "FRIENDS_ONLY") {
        setErrorMessage("Лобби доступно только для друзей.");
      } else {
        setErrorMessage("Не удалось войти в лобби.");
      }
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedGameForJoin) {
      await joinLobby(selectedGameForJoin.id, passwordInput);
      setShowPasswordModal(false);
      setPasswordInput("");
      setSelectedGameForJoin(null);
    }
  };

  const handleLeaveLobby = async () => {
    if (!token) return;
    try {
      await api("/api/lobbies/leave", { method: "POST", token });
    } catch {
      // ignore
    }
    clearLobbyId();
    setInLobby(false);
    setInGame(false);
    setSavedLobbyId(null);
    setCurrentLobby(null);
    setSelectedCountryId("");
    setChatMessages([]);
    setPrivateChats({});
    setPrivateTargetId("");
    setChatMode("global");
    await refreshLobbies(token);
  };

  const handleReturnToLobby = async () => {
    if (!token || !savedLobbyId) return;
    try {
      const lobby = await loadLobby(token, savedLobbyId, userId);
      if (!lobby) return;
      if (lobby.status === "in_progress") {
        navigate("/game");
        return;
      }
      if (lobby.status === "finished") {
        showToast("Эта игра уже завершена.");
        clearLobbyId();
        setSavedLobbyId(null);
      }
    } catch {
      showToast("Не удалось вернуться в лобби.");
      clearLobbyId();
      setSavedLobbyId(null);
    }
  };

  const handleAbandonLobby = async () => {
    if (!token) return;
    try {
      await api("/api/lobbies/leave", { method: "POST", token });
    } catch {
      // ignore
    }
    clearLobbyId();
    setInLobby(false);
    setInGame(false);
    setSavedLobbyId(null);
    setChatMessages([]);
    setPrivateChats({});
    setPrivateTargetId("");
    setChatMode("global");
    showToast("Вы покинули лобби.");
  };

  const handleSelectCountry = async (countryId: string) => {
    if (!token || !currentLobby) return;
    try {
      await api(`/api/lobbies/${currentLobby.id}/select-country`, {
        method: "POST",
        token,
        body: { countryId },
      });
      await loadLobby(token, currentLobby.id, userId);
    } catch (err) {
      const apiError = err as ApiError;
      const code = apiError?.data?.error || apiError.message;
      if (code === "COUNTRY_TAKEN") {
        setErrorMessage("Эта страна уже занята.");
      } else {
        setErrorMessage("Не удалось выбрать страну.");
      }
    }
  };

  const handleStartGame = async () => {
    if (!token || !currentLobby) return;
    try {
      await api(`/api/lobbies/${currentLobby.id}/start`, {
        method: "POST",
        token,
      });
    } catch (err) {
      const apiError = err as ApiError;
      const code = apiError?.data?.error || apiError.message;
      if (code === "NOT_ENOUGH_PLAYERS") {
        setErrorMessage("Для старта нужно минимум 2 игрока.");
      } else if (code === "COUNTRIES_NOT_SELECTED") {
        setErrorMessage("Все игроки должны выбрать страну.");
      } else {
        setErrorMessage(code || "Не удалось начать игру.");
      }
    }
  };

  const handleToggleReady = async () => {
    if (!token || !currentLobby) return;
    const me = currentLobby.players.find((player) => player.user_id === userId);
    const nextReady = !Boolean(me?.ready);
    try {
      await api(`/api/lobbies/${currentLobby.id}/ready`, {
        method: "POST",
        token,
        body: { ready: nextReady },
      });
    } catch (err) {
      const apiError = err as ApiError;
      setErrorMessage(apiError?.data?.error || "Не удалось изменить готовность.");
    }
  };

  const handleKickPlayer = async (targetUserId: number) => {
    if (!token || !currentLobby) return;
    try {
      await api(`/api/lobbies/${currentLobby.id}/kick`, {
        method: "POST",
        token,
        body: { userId: targetUserId },
      });
      showToast("Игрок кикнут");
    } catch (err) {
      const apiError = err as ApiError;
      setErrorMessage(apiError?.data?.error || "Не удалось кикнуть игрока.");
    }
  };

  const handleSendSiteMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteMessage.trim()) return;
    socketRef.current?.emit("chat:site", { message: siteMessage });
    setSiteMessage("");
  };

  const handleCopyLobbyId = async () => {
    if (!currentLobby) return;
    try {
      await navigator.clipboard.writeText(currentLobby.id);
      showToast("ID лобби скопирован");
    } catch {
      showToast("Не удалось скопировать ID");
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentLobby) return;
    if (chatMode === "global") {
      socketRef.current?.emit("chat:global", {
        lobbyId: currentLobby.id,
        message: newMessage,
      });
      setNewMessage("");
      return;
    }
    if (!privateTargetId || !selectedCountryId) return;
    socketRef.current?.emit("chat:private", {
      lobbyId: currentLobby.id,
      targetCountryId: privateTargetId,
      message: newMessage,
    });
    setNewMessage("");
  };

  const handleJoinById = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinLobbyId.trim()) return;
    await joinLobby(joinLobbyId.trim(), joinLobbyPassword || undefined);
    setJoinLobbyId("");
    setJoinLobbyPassword("");
    setShowJoinById(false);
  };

  const takenCountryIds = currentLobby?.players
    .filter((player) => player.country_id)
    .map((player) => player.country_id) as string[] | undefined;

  const countries = config?.countries || [];
  const privateTargets = useMemo(() => {
    if (!currentLobby) return [];
    return currentLobby.players
      .filter((player) => player.country_id && player.country_id !== selectedCountryId)
      .map((player) => {
        const country = countries.find((item) => item.id === player.country_id);
        return {
          id: player.country_id as string,
          label: `${country?.flag || ""} ${country?.name || player.country_id}`.trim(),
        };
      });
  }, [currentLobby, countries, selectedCountryId]);

  const chatMessagesToShow =
    chatMode === "global"
      ? chatMessages
      : privateTargetId
      ? privateChats[privateTargetId] || []
      : [];

  const canSendMessage =
    Boolean(currentLobby) &&
    (chatMode === "global" || (privateTargetId && selectedCountryId));

  const isHost = Boolean(currentLobby && userId && currentLobby.hostUserId === userId);
  const meReady = Boolean(
    currentLobby?.players.find((player) => player.user_id === userId)?.ready
  );
  const allCountriesSelected = Boolean(
    currentLobby?.players.length &&
      currentLobby.players.every((player) => Boolean(player.country_id))
  );
  const canStartGame = Boolean(
    currentLobby &&
      isHost &&
      currentLobby.players.length >= 2 &&
      allCountriesSelected
  );

  const isFriendUser = (id: number) => friends.some((f) => f.user_id === id);

  const openUserMenu = (
    user: { id: number; nickname: string; avatar: string },
    context: "lobby-chat" | "site-chat" | "player-list",
    anchorKey: string
  ) => {
    setActionMenuUser({ ...user, context, anchorKey });
  };

  const handleOpenUserProfile = (userId: number) => {
    navigate(`/profile/${userId}`);
  };

  const handleOpenChatProfile = (targetId?: number) => {
    if (!targetId) return;
    if (targetId === userId) {
      navigate("/profile");
      return;
    }
    navigate(`/profile/${targetId}`);
  };

  const handleMessageUser = (userId: number) => {
    if (!isFriendUser(userId)) {
      showToast("Сначала добавьте в друзья");
      return;
    }
    navigate(`/friends?userId=${userId}`);
  };

  const filteredLobbies = useMemo(() => {
    const term = lobbySearch.trim().toLowerCase();
    const list = term
      ? lobbies.filter(
          (lobby) =>
            lobby.name.toLowerCase().includes(term) ||
            lobby.id.toLowerCase().includes(term)
        )
      : lobbies;
    return [...list].sort((a, b) => {
      const af = a.isFriendLobby ? 1 : 0;
      const bf = b.isFriendLobby ? 1 : 0;
      if (af !== bf) return bf - af;
      return 0;
    });
  }, [lobbies, lobbySearch]);

  const lobbyStats = useMemo(() => {
    const total = lobbies.length;
    const waiting = lobbies.filter((lobby) => lobby.status === "waiting").length;
    const inProgress = lobbies.filter((lobby) => lobby.status === "in_progress").length;
    const players = lobbies.reduce((sum, lobby) => sum + lobby.playersCount, 0);
    return { total, waiting, inProgress, players };
  }, [lobbies]);

  const friendHighlights = useMemo(() => {
    return friends
      .map((friend) => ({
        ...friend,
        unread: friendUnread[friend.user_id] || 0,
        activity: friendActivity[friend.user_id] || 0,
      }))
      .filter((friend) => friend.unread > 0)
      .sort((a, b) => b.activity - a.activity);
  }, [friends, friendUnread, friendActivity]);

  const inviteableFriends = useMemo(() => {
    if (!currentLobby) return [];
    const inLobby = new Set(currentLobby.players.map((player) => player.user_id));
    const term = inviteSearch.trim().toLowerCase();
    return friends.filter((friend) => {
      if (inLobby.has(friend.user_id)) return false;
      if (!term) return true;
      return friend.nickname.toLowerCase().includes(term);
    });
  }, [friends, currentLobby, inviteSearch]);

  useEffect(() => {
    if (chatMode !== "private") return;
    if (privateTargetId && privateTargets.some((target) => target.id === privateTargetId)) return;
    setPrivateTargetId(privateTargets[0]?.id || "");
  }, [chatMode, privateTargetId, privateTargets]);

  const renderUserStats = (id?: number) => {
    if (!id) return null;
    const stats = userStats[id];
    if (!stats) return null;
    return (
      <span className="flex items-center gap-2 text-[10px] font-semibold ml-2">
        <span style={{ color: "rgba(255,255,255,0.45)" }}>
          Игр {stats.games}
        </span>
        <span style={{ color: "var(--app-success)" }}>▲ {stats.wins}</span>
        <span style={{ color: "var(--app-danger)" }}>▼ {stats.losses}</span>
      </span>
    );
  };

  const chatPanel = (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white">
            {currentLobby ? "Чат лобби" : siteChatMode === "friends" ? "Чат друзей" : "Общий чат"}
          </h3>
          {currentLobby ? (
            <div className="text-xs" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
              {chatMode === "global" ? "общий чат для участников" : "личные сообщения"}
            </div>
          ) : (
            <div className="text-xs" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
              {siteChatMode === "friends" ? "личные чаты с друзьями" : "для всех пользователей"}
            </div>
          )}
        </div>

        {currentLobby ? (
          <div className="flex items-center gap-2">
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
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSiteChatMode("global")}
              className="px-3 py-1 rounded-full text-xs font-bold"
              style={{
                background: siteChatMode === "global" ? "var(--app-accent)" : "rgba(255, 255, 255, 0.1)",
                color: siteChatMode === "global" ? "var(--app-header)" : "#fff",
              }}
            >
              Глобальный
            </button>
            <button
              onClick={() => setSiteChatMode("friends")}
              className="px-3 py-1 rounded-full text-xs font-bold"
              style={{
                background: siteChatMode === "friends" ? "var(--app-success)" : "rgba(255, 255, 255, 0.1)",
                color: siteChatMode === "friends" ? "var(--app-header)" : "#fff",
              }}
            >
              Друзья
            </button>
          </div>
        )}
      </div>

      <div
        className="rounded-[12px] overflow-hidden flex-1 flex flex-col min-h-0"
        style={{
          background: "var(--app-surface)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        {currentLobby && chatMode === "private" && (
          <div className="p-4 border-b" style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "rgba(255, 255, 255, 0.6)" }}>
                Кому написать:
              </span>
              <select
                value={privateTargetId}
                onChange={(e) => setPrivateTargetId(e.target.value)}
                className="rounded-[8px] px-3 py-1 text-xs text-white"
                style={{
                  background: "var(--app-input)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <option value="">Выберите страну</option>
                {privateTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))}
              </select>
            </div>
            {!selectedCountryId && (
              <div className="text-xs mt-2" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
                Выберите свою страну, чтобы писать в личные сообщения.
              </div>
            )}
          </div>
        )}

        {!currentLobby && siteChatMode === "friends" && (
          <div className="p-4 border-b" style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}>
            <div className="flex flex-wrap gap-2">
              {friends.length ? (
                friends.map((friend) => {
                  const unread = friendUnread[friend.user_id] || 0;
                  const active = activeFriendId === friend.user_id;
                  return (
                    <button
                      key={friend.user_id}
                      onClick={() => handleOpenFriendChat(friend.user_id)}
                      className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2"
                      style={{
                        background: active ? "var(--app-success)" : "rgba(255, 255, 255, 0.08)",
                        color: active ? "var(--app-header)" : "#fff",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                      }}
                    >
                      <span>{friend.avatar_emoji}</span>
                      <span>{friend.nickname}</span>
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
                })
              ) : (
                <div className="text-xs text-white/50">
                  У вас пока нет друзей.
                </div>
              )}
            </div>
          </div>
        )}

        {!currentLobby && siteChatMode === "global" && friendHighlights.length > 0 && (
          <div className="p-4 border-b" style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}>
            <div className="flex flex-wrap gap-2">
              {friendHighlights.map((friend) => (
                <button
                  key={friend.user_id}
                  onClick={() => handleOpenFriendChat(friend.user_id)}
                  className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2"
                  style={{
                    background: "color-mix(in srgb, var(--app-success) 18%, transparent)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "var(--app-text)",
                  }}
                >
                  <span>{friend.avatar_emoji}</span>
                  <span>{friend.nickname}</span>
                  <span
                    className="px-2 py-[2px] rounded-full text-[10px] font-bold"
                    style={{ background: "var(--app-danger)", color: "#fff" }}
                  >
                    {friend.unread}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 p-4 custom-scrollbar overflow-y-auto">
          {currentLobby ? (
            chatMessagesToShow.length ? (
              <div className="space-y-3">
                {chatMessagesToShow.map((msg, index) => (
                  <div key={index} className="flex gap-3 group relative">
                    <span className="text-2xl">{msg.avatar}</span>
                    <div>
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <button
                          type="button"
                          onClick={() => handleOpenChatProfile(msg.userId)}
                          className="hover:underline"
                          style={{ color: "var(--app-accent)", cursor: msg.userId ? "pointer" : "default" }}
                        >
                          {msg.player}
                        </button>
                        {currentLobby && msg.userId === currentLobby.hostUserId && (
                          <span className="text-xs" style={{ color: "var(--app-warning)" }}>
                            👑
                          </span>
                        )}
                        {renderUserStats(msg.userId)}
                        {msg.country && (
                          <span className="text-xs" style={{ color: "rgba(255, 255, 255, 0.6)" }}>
                            {msg.flag} {msg.country}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-white">{msg.text}</div>
                    </div>
                    {msg.userId && msg.userId !== userId && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openUserMenu(
                              {
                                id: msg.userId || 0,
                                nickname: msg.player,
                                avatar: msg.avatar,
                              },
                              "lobby-chat",
                              `lobby-${index}`
                            );
                          }}
                          className="absolute top-0 right-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-all"
                          style={{ background: "rgba(255,255,255,0.15)" }}
                        >
                          ⋯
                        </button>
                        {actionMenuUser?.id === msg.userId &&
                          actionMenuUser?.context === "lobby-chat" &&
                          actionMenuUser?.anchorKey === `lobby-${index}` && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-6 z-20 rounded-[10px] p-2 text-xs text-white"
                            style={{
                              background: "var(--app-surface)",
                              border: "1px solid rgba(255,255,255,0.12)",
                              boxShadow: "0 10px 20px rgba(0,0,0,0.35)",
                            }}
                          >
                            <button
                              onClick={() => handleMessageUser(msg.userId!)}
                              className="block w-full text-left px-2 py-1 rounded hover:bg-white/10"
                            >
                              Написать
                            </button>
                            <button
                              onClick={() => handleAddFriend(msg.player)}
                              className="block w-full text-left px-2 py-1 rounded hover:bg-white/10"
                            >
                              Добавить в друзья
                            </button>
                            <button
                              onClick={() => handleOpenUserProfile(msg.userId!)}
                              className="block w-full text-left px-2 py-1 rounded hover:bg-white/10"
                            >
                              Профиль
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-white/60">
                {chatMode === "private" && !privateTargetId
                  ? "Выберите страну для личных сообщений."
                  : "Сообщений пока нет."}
              </div>
            )
          ) : siteChatMode === "global" ? (
            siteMessages.length ? (
              <div className="space-y-3">
                {siteMessages.map((msg, index) => (
                  <div key={index} className="flex gap-3 group relative">
                    <span className="text-2xl">{msg.avatar}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenChatProfile(msg.userId)}
                          className="text-sm font-bold hover:underline"
                          style={{ color: "var(--app-accent)", cursor: msg.userId ? "pointer" : "default" }}
                        >
                          {msg.player}
                        </button>
                        {renderUserStats(msg.userId)}
                      </div>
                      <div className="text-sm text-white">{msg.text}</div>
                    </div>
                    {msg.userId && msg.userId !== userId && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openUserMenu(
                              {
                                id: msg.userId || 0,
                                nickname: msg.player,
                                avatar: msg.avatar,
                              },
                              "site-chat",
                              `site-${index}`
                            );
                          }}
                          className="absolute top-0 right-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-all"
                          style={{ background: "rgba(255,255,255,0.15)" }}
                        >
                          ⋯
                        </button>
                        {actionMenuUser?.id === msg.userId &&
                          actionMenuUser?.context === "site-chat" &&
                          actionMenuUser?.anchorKey === `site-${index}` && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-6 z-20 rounded-[10px] p-2 text-xs text-white"
                            style={{
                              background: "var(--app-surface)",
                              border: "1px solid rgba(255,255,255,0.12)",
                              boxShadow: "0 10px 20px rgba(0,0,0,0.35)",
                            }}
                          >
                            <button
                              onClick={() => handleMessageUser(msg.userId!)}
                              className="block w-full text-left px-2 py-1 rounded hover:bg-white/10"
                            >
                              Написать
                            </button>
                            <button
                              onClick={() => handleAddFriend(msg.player)}
                              className="block w-full text-left px-2 py-1 rounded hover:bg-white/10"
                            >
                              Добавить в друзья
                            </button>
                            <button
                              onClick={() => handleOpenUserProfile(msg.userId!)}
                              className="block w-full text-left px-2 py-1 rounded hover:bg-white/10"
                            >
                              Профиль
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-white/60">Сообщений пока нет.</div>
            )
          ) : activeFriendId ? (
            (friendMessages[activeFriendId]?.length || 0) ? (
              <div className="space-y-3">
                {friendMessages[activeFriendId].map((msg, index) => {
                  const isMine = msg.sender_user_id === userId;
                  const friend = friends.find(
                    (f) =>
                      f.user_id ===
                      (isMine ? msg.recipient_user_id : msg.sender_user_id)
                  );
                  const invite = parseLobbyInvite(msg.content);
                  if (invite) {
                    const inviterName =
                      invite.inviterNickname || (isMine ? userNickname : friend?.nickname) || "Друг";
                    const inviterAvatar =
                      invite.inviterAvatar || (isMine ? userAvatar : friend?.avatar_emoji) || "👤";
                    return (
                      <div key={index} className="flex gap-3">
                        <div
                          className="w-12 h-12 rounded-[12px] flex items-center justify-center text-2xl"
                          style={{
                            background: "color-mix(in srgb, var(--app-accent) 18%, transparent)",
                            border: "1px solid rgba(255,255,255,0.12)",
                          }}
                        >
                          {inviterAvatar}
                        </div>
                        <div
                          className="rounded-[16px] overflow-hidden flex-1"
                          style={{
                            background: "var(--app-surface-strong)",
                            border: "1px solid rgba(255,255,255,0.12)",
                          }}
                        >
                          <div className="p-3">
                            <div className="text-sm font-bold text-white">{inviterName}</div>
                            <div className="text-xs text-white/60">приглашает в лобби</div>
                            <div className="text-xs text-white/50 mt-1">
                              {invite.lobbyName || "Лобби"} · ID {invite.lobbyId}
                            </div>
                          </div>
                          <div className="px-3 pb-3">
                            {isMine ? (
                              <div className="text-xs text-white/60">Приглашение отправлено</div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAcceptInvite(invite)}
                                className="w-full rounded-[10px] h-[36px] text-xs font-bold text-white"
                                style={{ background: "var(--app-success)" }}
                              >
                                Перейти в лобби
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={index} className="flex gap-3">
                      <span className="text-2xl">
                        {isMine ? userAvatar : friend?.avatar_emoji || "👤"}
                      </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenChatProfile(
                                  isMine ? userId || undefined : friend?.user_id
                                )
                              }
                              className="text-sm font-bold hover:underline"
                              style={{
                                color: "var(--app-accent)",
                                cursor: isMine || friend?.user_id ? "pointer" : "default",
                              }}
                            >
                              {isMine ? userNickname : friend?.nickname || "Друг"}
                            </button>
                            {renderUserStats(isMine ? userId || undefined : friend?.user_id)}
                          </div>
                          <div className="text-sm text-white">{msg.content}</div>
                        </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-white/60">Сообщений пока нет.</div>
            )
          ) : (
            <div className="text-sm text-white/60">Выберите друга для переписки.</div>
          )}
        </div>

        {currentLobby ? (
          <form
            onSubmit={handleSendMessage}
            className="p-4 border-t"
            style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={
                  chatMode === "private" && !privateTargetId
                    ? "Выберите страну..."
                    : "Введите сообщение..."
                }
                disabled={!canSendMessage}
                className="flex-1 rounded-[8px] p-3 text-white text-sm"
                style={{
                  background: "var(--app-input)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  outline: "none",
                  opacity: canSendMessage ? 1 : 0.5,
                }}
              />
              <button
                type="submit"
                disabled={!canSendMessage}
                className="w-10 h-10 rounded-[8px] flex items-center justify-center text-white transition-all"
                style={{ background: "var(--app-accent)", opacity: canSendMessage ? 1 : 0.5 }}
              >
                ➤
              </button>
            </div>
          </form>
        ) : siteChatMode === "global" ? (
          <form
            onSubmit={handleSendSiteMessage}
            className="p-4 border-t"
            style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={siteMessage}
                onChange={(e) => setSiteMessage(e.target.value)}
                placeholder="Введите сообщение..."
                className="flex-1 rounded-[8px] p-3 text-white text-sm"
                style={{
                  background: "var(--app-input)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                className="w-10 h-10 rounded-[8px] flex items-center justify-center text-white transition-all"
                style={{ background: "var(--app-accent)" }}
              >
                ➤
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={handleSendFriendMessage}
            className="p-4 border-t"
            style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={friendMessage}
                onChange={(e) => setFriendMessage(e.target.value)}
                placeholder={activeFriendId ? "Введите сообщение..." : "Выберите друга..."}
                disabled={!activeFriendId}
                className="flex-1 rounded-[8px] p-3 text-white text-sm"
                style={{
                  background: "var(--app-input)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  outline: "none",
                  opacity: activeFriendId ? 1 : 0.5,
                }}
              />
              <button
                type="submit"
                disabled={!activeFriendId}
                className="w-10 h-10 rounded-[8px] flex items-center justify-center text-white transition-all"
                style={{ background: "var(--app-success)", opacity: activeFriendId ? 1 : 0.5 }}
              >
                ➤
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden"
         style={{ background: "var(--app-bg-gradient)" }}>
      <div className="bg-blob blob-1" />
      <div className="bg-blob blob-2" />
      <div className="bg-blob blob-3" />

      {/* HEADER */}
      <header
        className="h-16 px-6 flex items-center border-b relative"
        style={{
          background: "var(--app-header)",
          borderColor: "rgba(255, 255, 255, 0.1)",
          color: "var(--app-text)",
        }}
      >
        <AppBrandLink />

        {userId && (
          <button
            onClick={handleOpenProfile}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all absolute right-6"
            style={{ background: "rgba(255, 255, 255, 0.1)" }}
          >
            <span className="text-xl">{userAvatar}</span>
          </button>
        )}
      </header>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ЛЕВАЯ ПАНЕЛЬ */}
        <div className="w-[360px] p-6 custom-scrollbar overflow-y-auto rounded-[20px] m-6"
             style={{
               background: "var(--app-surface-strong)",
               border: "1px solid rgba(255, 255, 255, 0.08)",
               boxShadow: "0 18px 40px rgba(0, 0, 0, 0.35)"
             }}>

          {!currentLobby ? (
            <>
              {/* Кнопки создать и ID */}
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="flex-1 rounded-[10px] h-[44px] font-bold text-white text-sm transition-all btn-success-strong"
                >
                  ➕ Создать
                </button>
                <button
                  onClick={() => setShowJoinById(!showJoinById)}
                  className="flex-1 rounded-[10px] h-[44px] font-bold text-white text-sm transition-all hover:opacity-90"
                  style={{ background: "rgba(255, 255, 255, 0.1)" }}
                >
                  🔎 По ID
                </button>
              </div>

              {/* Форма создания игры */}
              <AnimatePresence>
                {showCreateForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-6"
                  >
                    <div className="rounded-[12px] p-5"
                         style={{ background: "var(--app-surface)", border: "1px solid rgba(255, 255, 255, 0.1)" }}>
                      <h3 className="text-lg font-bold text-white mb-4">Новая игра</h3>
                      <form onSubmit={handleCreateGame} className="space-y-3">
                        <input
                          type="text"
                          placeholder="Введите название"
                          value={newGameName}
                          onChange={(e) => setNewGameName(e.target.value)}
                          required
                          className="w-full rounded-[8px] p-3 text-white text-sm"
                          style={{
                            background: "var(--app-input)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            outline: "none"
                          }}
                        />
                        <div className="text-xs text-white/60">
                          Кол-во команд: <span className="text-white font-bold">{newGameTeams}</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={20}
                          step={1}
                          value={Number(newGameTeams)}
                          onChange={(e) => handleTeamsChange(e.target.value)}
                          className="w-full"
                          style={{ accentColor: "var(--app-success)" }}
                        />
                        <div className="text-xs text-white/60">
                          Кол-во раундов: <span className="text-white font-bold">{newGameRounds}</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={30}
                          step={1}
                          value={Number(newGameRounds)}
                          onChange={(e) => handleRoundsChange(e.target.value)}
                          className="w-full"
                          style={{ accentColor: "var(--app-accent)" }}
                        />
                        <input
                          type="password"
                          placeholder="Пароль необязательно"
                          value={newGamePassword}
                          onChange={(e) => setNewGamePassword(e.target.value)}
                          className="w-full rounded-[8px] p-3 text-white text-sm"
                          style={{
                            background: "var(--app-input)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            outline: "none"
                          }}
                        />
                        <label className="flex items-center gap-2 text-xs text-white/70">
                          <input
                            type="checkbox"
                            checked={friendsOnly}
                            onChange={(e) => setFriendsOnly(e.target.checked)}
                          />
                          Лобби для друзей
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowAdvancedSettings((prev) => !prev)}
                          className="w-full rounded-[8px] py-2 text-sm font-bold text-white"
                          style={{ background: "rgba(255,255,255,0.08)" }}
                        >
                          {showAdvancedSettings ? "Скрыть расширенные настройки" : "Расширенные настройки"}
                        </button>
                        <AnimatePresence>
                          {showAdvancedSettings && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="rounded-[10px] p-4 space-y-3"
                              style={{
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                              }}
                            >
                              <div className="text-xs text-white/60">
                                Фаза обсуждения: {discussionSeconds}s
                              </div>
                              <input
                                type="range"
                                min={30}
                                max={180}
                                step={10}
                                value={Number(discussionSeconds)}
                                onChange={(e) => setDiscussionSeconds(e.target.value)}
                                className="w-full"
                                style={{ accentColor: "var(--app-success)" }}
                              />
                              <div className="text-xs text-white/60">
                                Фаза решений: {decisionsSeconds}s
                              </div>
                              <input
                                type="range"
                                min={60}
                                max={300}
                                step={10}
                                value={Number(decisionsSeconds)}
                                onChange={(e) => setDecisionsSeconds(e.target.value)}
                                className="w-full"
                                style={{ accentColor: "var(--app-accent)" }}
                              />
                              <div className="flex items-center justify-between text-xs text-white/60">
                                <span>Показывать автора ядерной атаки</span>
                                <input
                                  type="checkbox"
                                  checked={revealNukes}
                                  onChange={(e) => setRevealNukes(e.target.checked)}
                                />
                              </div>
                              <div className="text-xs text-white/60">
                                Множитель дохода: {Number(incomeMultiplier).toFixed(1)}x
                              </div>
                              <input
                                type="range"
                                min={0.5}
                                max={3}
                                step={0.1}
                                value={Number(incomeMultiplier)}
                                onChange={(e) => setIncomeMultiplier(e.target.value)}
                                className="w-full"
                                style={{ accentColor: "var(--app-warning)" }}
                              />
                              <div className="text-xs text-white/60">
                                Ядерное оружие с раунда:
                              </div>
                              <input
                                type="number"
                                min={1}
                                max={Number(newGameRounds) || 30}
                                value={nukeUnlockRoundSetting}
                                onChange={(e) => {
                                  const maxRound = Number(newGameRounds) || 30;
                                  const clamped = clampNumber(e.target.value, 1, maxRound, 3);
                                  setNukeUnlockRoundSetting(clamped);
                                }}
                                className="w-full rounded-[8px] p-2 text-white text-sm"
                                style={{
                                  background: "var(--app-input)",
                                  border: "1px solid rgba(255, 255, 255, 0.1)",
                                  outline: "none",
                                }}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <div className="text-xs" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
                          Автоматически будет создан уникальный ID.
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            className="flex-1 rounded-[8px] py-2 font-bold text-white text-sm"
                            style={{ background: "var(--app-success)" }}
                          >
                            Создать
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCreateForm(false)}
                            className="rounded-[8px] px-4 py-2 font-bold text-white text-sm"
                            style={{ background: "rgba(255, 255, 255, 0.1)" }}
                          >
                            Отмена
                          </button>
                        </div>
                      </form>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Форма входа по ID */}
              <AnimatePresence>
                {showJoinById && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-6"
                  >
                    <div className="rounded-[12px] p-5"
                         style={{ background: "var(--app-surface)", border: "1px solid rgba(255, 255, 255, 0.1)" }}>
                      <h3 className="text-lg font-bold text-white mb-4">Войти по ID</h3>
                      <form onSubmit={handleJoinById} className="space-y-3">
                        <input
                          type="text"
                          placeholder="ID лобби"
                          value={joinLobbyId}
                          onChange={(e) => setJoinLobbyId(e.target.value)}
                          required
                          className="w-full rounded-[8px] p-3 text-white text-sm"
                          style={{
                            background: "var(--app-input)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            outline: "none"
                          }}
                        />
                        <input
                          type="password"
                          placeholder="Пароль (если есть)"
                          value={joinLobbyPassword}
                          onChange={(e) => setJoinLobbyPassword(e.target.value)}
                          className="w-full rounded-[8px] p-3 text-white text-sm"
                          style={{
                            background: "var(--app-input)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            outline: "none"
                          }}
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            className="flex-1 rounded-[8px] py-2 font-bold text-white text-sm"
                            style={{ background: "var(--app-accent)" }}
                          >
                            Войти
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowJoinById(false)}
                            className="rounded-[8px] px-4 py-2 font-bold text-white text-sm"
                            style={{ background: "rgba(255, 255, 255, 0.1)" }}
                          >
                            Отмена
                          </button>
                        </div>
                      </form>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Список игр */}
              <div>
                <h3 className="text-sm font-bold mb-3" style={{ color: "rgba(255, 255, 255, 0.7)" }}>
                  Доступные игры
                </h3>
                <div className="mb-3 relative">
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-sm"
                    style={{ color: "rgba(255,255,255,0.45)" }}
                  >
                    🔍
                  </span>
                  <input
                    type="text"
                    value={lobbySearch}
                    onChange={(e) => setLobbySearch(e.target.value)}
                    placeholder="Поиск по названию или ID..."
                    className="w-full rounded-[12px] p-3 pl-10 text-white text-sm"
                    style={{
                      background: "var(--app-input)",
                      border: "1px solid rgba(255, 255, 255, 0.14)",
                      boxShadow: "0 12px 24px rgba(0, 0, 0, 0.25)",
                      outline: "none",
                    }}
                  />
                </div>
                <div className="space-y-2">
                  {filteredLobbies.map((game) => (
                    <motion.div
                      key={game.id}
                      whileHover={{ x: 3, scale: 1.01 }}
                      onClick={() => handleJoinGame(game)}
                      className="rounded-[10px] p-4 cursor-pointer transition-all"
                      style={{
                        background: "var(--app-surface)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        boxShadow: "0 14px 26px rgba(0, 0, 0, 0.28)"
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{game.name}</span>
                          {game.friendsOnly && (
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{
                                background: "color-mix(in srgb, var(--app-success) 22%, transparent)",
                                color: "var(--app-success)"
                              }}
                            >
                              ДРУЗЬЯ
                            </span>
                          )}
                        </div>
                        <span
                          className="text-xs px-2 py-1 rounded"
                          style={{
                            background: game.status === "in_progress"
                              ? "color-mix(in srgb, var(--app-warning) 22%, transparent)"
                              : "color-mix(in srgb, var(--app-success) 22%, transparent)",
                            color: game.status === "in_progress" ? "var(--app-warning)" : "var(--app-success)"
                          }}
                        >
                          {game.status === "in_progress" ? "Играют" : "Открыто"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs"
                           style={{ color: "rgba(255, 255, 255, 0.6)" }}>
                        <span>ID: {game.id}</span>
                        <div className="flex items-center gap-2">
                          <span>👥 {game.playersCount}/{game.maxTeams} игроков</span>
                          {game.hasPassword && <span>🔒</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleJoinGame(game)}
                        className="w-full rounded-[8px] h-[32px] mt-3 font-bold text-white text-xs"
                        style={{ background: "var(--app-accent)" }}
                      >
                        Войти
                      </button>
                    </motion.div>
                  ))}
                  {!filteredLobbies.length && (
                    <div className="text-xs text-white/50">Лобби не найдены.</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            // Информация о текущем лобби
            <div>
              <button
                onClick={handleLeaveLobby}
                className="text-sm mb-4 hover:underline"
                style={{ color: "var(--app-accent)" }}
              >
                ← Выйти из лобби
              </button>

              <div className="rounded-[12px] p-5 mb-4"
                   style={{ background: "var(--app-surface)", border: "1px solid rgba(255, 255, 255, 0.1)" }}>
                <h2 className="text-xl font-bold text-center mb-2" style={{ color: "var(--app-accent)" }}>
                  Лобби: {currentLobby.name}
                </h2>
                {currentLobby.friendsOnly && (
                  <div className="text-center text-[10px] font-bold mb-2" style={{ color: "var(--app-success)" }}>
                    Только для друзей
                  </div>
                )}
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div
                    className="flex items-center gap-2 rounded-full px-3 py-1"
                    style={{ background: "rgba(255, 255, 255, 0.08)" }}
                  >
                    <span className="text-xs" style={{ color: "rgba(255, 255, 255, 0.6)" }}>
                      ID лобби:
                    </span>
                    <span className="text-sm font-bold text-white">{currentLobby.id}</span>
                  </div>
                  <button
                    onClick={handleCopyLobbyId}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                    style={{ background: "rgba(255, 255, 255, 0.12)" }}
                  >
                    📋
                  </button>
                </div>
                <div className="text-center text-xs mb-4" style={{ color: "rgba(255, 255, 255, 0.4)" }}>
                  Приглашение: {currentLobby.inviteLink}
                </div>
                {countdownSeconds !== null && (
                  <div className="text-center text-xs font-bold mb-4" style={{ color: "var(--app-success)" }}>
                    Все готовы! Запуск через {countdownSeconds} сек.
                  </div>
                )}

                {/* Список игроков */}
                <div className="mb-6">
                  <h3 className="text-sm font-bold mb-3" style={{ color: "rgba(255, 255, 255, 0.8)" }}>
                    Игроки ({currentLobby.players.length}/{currentLobby.maxTeams})
                  </h3>
                  <div className="space-y-2">
                    {currentLobby.players.map((player) => {
                      const country = countries.find((c) => c.id === player.country_id);
                      const isReady = Boolean(player.ready);
                      const isPlayerHost = player.user_id === currentLobby.hostUserId;
                      return (
                        <div
                          key={player.user_id}
                          className="rounded-[8px] p-3 flex items-center justify-between group relative"
                          style={{
                            background: isReady
                              ? "color-mix(in srgb, var(--app-success) 22%, transparent)"
                              : "var(--app-input)",
                            border: isReady
                              ? "1px solid color-mix(in srgb, var(--app-success) 55%, transparent)"
                              : "1px solid transparent",
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{player.avatar_emoji}</span>
                            <span className="text-sm text-white">{player.nickname}</span>
                            {isPlayerHost && (
                              <span className="text-xs" style={{ color: "var(--app-warning)" }}>
                                👑
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {isReady && (
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{
                                  background: "color-mix(in srgb, var(--app-success) 22%, transparent)",
                                  color: "var(--app-success)",
                                }}
                              >
                                Готов
                              </span>
                            )}
                            <span
                              className="text-xs"
                              style={{
                                color: player.country_id ? "#ffffff" : "rgba(255, 255, 255, 0.5)",
                              }}
                            >
                              {player.country_id
                                ? `${country?.flag || ""} ${country?.name || ""}`.trim()
                                : "Выбирает..."}
                            </span>
                            {isHost && player.user_id !== userId && (
                              <button
                                onClick={() => handleKickPlayer(player.user_id)}
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{
                                  background: "color-mix(in srgb, var(--app-danger) 22%, transparent)",
                                  color: "var(--app-danger)",
                                }}
                              >
                                Кик
                              </button>
                            )}
                            {player.user_id !== userId && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openUserMenu(
                                    {
                                      id: player.user_id,
                                      nickname: player.nickname,
                                      avatar: player.avatar_emoji,
                                    },
                                    "player-list",
                                    `player-${player.user_id}`
                                  );
                                }}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-all"
                                style={{ background: "rgba(255,255,255,0.15)" }}
                              >
                                ⋯
                              </button>
                            )}
                          </div>
                          {player.user_id !== userId &&
                            actionMenuUser?.id === player.user_id &&
                            actionMenuUser?.context === "player-list" &&
                            actionMenuUser?.anchorKey === `player-${player.user_id}` && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-2 top-9 z-20 rounded-[10px] p-2 text-xs text-white"
                                style={{
                                  background: "var(--app-surface)",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  boxShadow: "0 10px 20px rgba(0,0,0,0.35)",
                                }}
                              >
                                <button
                                  onClick={() => handleMessageUser(player.user_id)}
                                  className="block w-full text-left px-2 py-1 rounded hover:bg-white/10"
                                >
                                  Написать
                                </button>
                                <button
                                  onClick={() => handleAddFriend(player.nickname)}
                                  className="block w-full text-left px-2 py-1 rounded hover:bg-white/10"
                                >
                                  Добавить в друзья
                                </button>
                                <button
                                  onClick={() => handleOpenUserProfile(player.user_id)}
                                  className="block w-full text-left px-2 py-1 rounded hover:bg-white/10"
                                >
                                  Профиль
                                </button>
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Выбор страны */}
                <div className="mb-6">
                  <h3 className="text-sm font-bold mb-3" style={{ color: "rgba(255, 255, 255, 0.8)" }}>
                    Выбери свою страну:
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {countries.map((country) => {
                      const isTaken = takenCountryIds?.includes(country.id);
                      const isSelected = selectedCountryId === country.id;

                      return (
                        <motion.button
                          key={country.id}
                          whileHover={!isTaken ? { scale: 1.05 } : {}}
                          whileTap={!isTaken ? { scale: 0.95 } : {}}
                          onClick={() => !isTaken && handleSelectCountry(country.id)}
                          disabled={isTaken}
                          className="aspect-square rounded-[10px] flex flex-col items-center justify-center text-center p-2 transition-all"
                          style={{
                            background: isSelected ? "var(--app-accent)" : "var(--app-input)",
                            border: isSelected
                              ? "2px solid var(--app-accent)"
                              : "1px solid rgba(255, 255, 255, 0.1)",
                            boxShadow: isSelected
                              ? "0 0 20px color-mix(in srgb, var(--app-accent) 45%, transparent)"
                              : "none",
                            opacity: isTaken ? 0.4 : 1,
                            cursor: isTaken ? "not-allowed" : "pointer"
                          }}
                        >
                          <div className="text-2xl mb-1" style={{ color: "#ffffff" }}>
                            {country.flag}
                          </div>
                          <div
                            className="text-[10px] font-bold"
                            style={{ color: "#ffffff" }}
                          >
                            {country.id.toUpperCase()}
                          </div>
                          <div className="text-[9px] text-white">
                            {country.name}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Кнопки */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleToggleReady}
                    disabled={!selectedCountryId}
                    className="flex-1 min-w-[140px] rounded-[10px] h-[44px] font-bold text-white text-sm transition-all"
                    style={{
                      background: meReady ? "var(--app-accent-strong)" : "var(--app-success)",
                      opacity: selectedCountryId ? 1 : 0.5,
                      cursor: selectedCountryId ? "pointer" : "not-allowed",
                    }}
                  >
                    {meReady ? "Снять готовность" : "Готов"}
                  </button>
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex-1 min-w-[140px] rounded-[10px] h-[44px] font-bold text-white text-sm transition-all"
                    style={{ background: "var(--app-accent)" }}
                  >
                    Пригласить друзей
                  </button>
                  {isHost && (
                    <button
                      onClick={handleStartGame}
                      disabled={!canStartGame}
                      className="flex-1 min-w-[140px] rounded-[10px] h-[44px] font-bold text-white text-sm transition-all"
                      style={{
                        background: canStartGame
                          ? "var(--app-warning)"
                          : "color-mix(in srgb, var(--app-text) 12%, transparent)",
                        opacity: canStartGame ? 1 : 0.5,
                        cursor: canStartGame ? "pointer" : "not-allowed",
                      }}
                    >
                      🚀 Начать игру
                    </button>
                  )}
                  <button
                    onClick={handleLeaveLobby}
                    className="rounded-[10px] px-4 h-[44px] font-bold text-white text-sm"
                    style={{ background: "rgba(255, 255, 255, 0.1)" }}
                  >
                    Выйти из лобби
                  </button>
                </div>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="text-xs mt-4 text-center" style={{ color: "var(--app-danger)" }}>
              {errorMessage}
            </div>
          )}
        </div>

        {/* ПРАВАЯ ПАНЕЛЬ - ЧАТ */}
        <div
          className="flex-1 flex flex-col m-6 p-6 rounded-[20px] min-h-0"
          style={{
            background: "var(--app-surface-strong)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: "0 18px 40px rgba(0, 0, 0, 0.35)",
          }}
        >
          {!currentLobby ? (
            <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-6 min-h-0 h-full">
              <div className="min-h-0 h-full">{chatPanel}</div>
              <div className="flex flex-col gap-4">
                <div
                  className="rounded-[16px] p-4"
                  style={{
                    background: "var(--app-surface)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    boxShadow: "0 16px 30px rgba(0, 0, 0, 0.35)",
                  }}
                >
                  <div className="text-sm font-bold text-white mb-3">Сводка лобби</div>
                  <div className="grid grid-cols-2 gap-3 text-xs text-white/70">
                    <div
                      className="rounded-[12px] p-3"
                      style={{
                        background: "color-mix(in srgb, var(--app-accent-strong) 18%, transparent)",
                      }}
                    >
                      Всего лобби
                      <div className="text-lg font-bold text-white">{lobbyStats.total}</div>
                    </div>
                    <div
                      className="rounded-[12px] p-3"
                      style={{
                        background: "color-mix(in srgb, var(--app-success) 18%, transparent)",
                      }}
                    >
                      Открыто
                      <div className="text-lg font-bold text-white">{lobbyStats.waiting}</div>
                    </div>
                    <div
                      className="rounded-[12px] p-3"
                      style={{
                        background: "color-mix(in srgb, var(--app-warning) 18%, transparent)",
                      }}
                    >
                      В игре
                      <div className="text-lg font-bold text-white">{lobbyStats.inProgress}</div>
                    </div>
                    <div
                      className="rounded-[12px] p-3"
                      style={{
                        background: "color-mix(in srgb, var(--app-text) 8%, transparent)",
                      }}
                    >
                      Игроков онлайн
                      <div className="text-lg font-bold text-white">{lobbyStats.players}</div>
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-[16px] p-4"
                  style={{
                    background: "var(--app-surface)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <div className="text-sm font-bold text-white mb-3">Быстрый старт</div>
                  <div className="text-xs text-white/70">1. Создай лобби или зайди по ID.</div>
                  <div className="text-xs text-white/70">2. Выбери страну и нажми «Готов».</div>
                  <div className="text-xs text-white/70">3. Лидер запускает игру при 2+ игроках.</div>
                </div>

                <div
                  className="rounded-[16px] p-4"
                  style={{
                    background: "var(--app-surface)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <div className="text-sm font-bold text-white mb-3">Полезное</div>
                  <div className="text-xs text-white/70">• В чате можно общаться всем игрокам.</div>
                  <div className="text-xs text-white/70">• В расширенных настройках — тайминги и правила.</div>
                  <div className="text-xs text-white/70">• Лобби обновляется автоматически каждые 5 секунд.</div>
                </div>
              </div>
            </div>
          ) : (
            chatPanel
          )}
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50"
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
        {friendToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed left-1/2 top-4 -translate-x-1/2 z-50"
          >
            <div
              className="rounded-full px-5 py-2 text-sm font-bold text-white"
              style={{
                background: "var(--app-accent-strong)",
                boxShadow: "0 12px 30px color-mix(in srgb, var(--app-accent-strong) 35%, transparent)",
              }}
            >
              {friendToast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {inviteQueue.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 px-4"
            style={{ background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(8px)" }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-[18px] p-5 w-full max-w-[360px]"
              style={{
                background: "var(--app-surface-strong)",
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-12 h-12 rounded-[14px] flex items-center justify-center text-2xl"
                  style={{
                    background: "color-mix(in srgb, var(--app-accent) 18%, transparent)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  {inviteQueue[0].inviterAvatar || "👤"}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">
                    {inviteQueue[0].inviterNickname || "Друг"}
                  </div>
                  <div className="text-xs text-white/60">приглашает в лобби</div>
                </div>
              </div>
              <div className="text-xs text-white/50 mb-4">
                {inviteQueue[0].lobbyName || "Лобби"} · ID {inviteQueue[0].lobbyId}
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => handleAcceptInvite(inviteQueue[0])}
                  className="w-full rounded-[10px] h-[40px] text-sm font-bold text-white"
                  style={{ background: "var(--app-success)" }}
                >
                  Перейти в лобби
                </button>
                <button
                  onClick={handleCloseInvite}
                  className="w-full rounded-[10px] h-[38px] text-xs font-bold text-white"
                  style={{ background: "rgba(255,255,255,0.12)" }}
                >
                  Отказаться
                </button>
                <button
                  onClick={handleCloseInvite}
                  className="w-full rounded-[10px] h-[34px] text-[11px] font-bold text-white/70"
                >
                  Закрыть
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showInviteModal && currentLobby && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 px-4"
            style={{ background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowInviteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-[16px] p-6 w-full max-w-[420px]"
              style={{
                background: "var(--app-surface-strong)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Пригласить друзей</h3>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                  style={{ background: "rgba(255, 255, 255, 0.1)" }}
                >
                  ✕
                </button>
              </div>

              <input
                type="text"
                value={inviteSearch}
                onChange={(e) => setInviteSearch(e.target.value)}
                placeholder="Поиск друга"
                className="w-full rounded-[10px] p-3 text-white text-sm mb-4"
                style={{
                  background: "var(--app-input)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  outline: "none",
                }}
              />

              <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar">
                {inviteableFriends.length ? (
                  inviteableFriends.map((friend) => {
                    const busy = inviteSending[friend.user_id];
                    const already = invitedFriends[friend.user_id];
                    return (
                      <div
                        key={friend.user_id}
                        className="flex items-center justify-between rounded-[12px] p-3"
                        style={{
                          background: "var(--app-surface)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{friend.avatar_emoji}</span>
                          <span className="text-sm text-white">{friend.nickname}</span>
                        </div>
                        <button
                          onClick={() => handleInviteFriend(friend.user_id)}
                          disabled={busy || already}
                          className="rounded-[8px] px-3 py-1 text-xs font-bold text-white"
                          style={{
                            background: already
                              ? "rgba(255,255,255,0.12)"
                              : "var(--app-success)",
                            opacity: busy ? 0.6 : 1,
                          }}
                        >
                          {already ? "Отправлено" : "Пригласить"}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-white/50">Друзей для приглашения нет.</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* МОДАЛЬНОЕ ОКНО ПАРОЛЯ */}
      <AnimatePresence>
        {showPasswordModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 px-4"
            style={{ background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowPasswordModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-[16px] p-6 w-full max-w-[400px]"
              style={{
                background: "var(--app-surface)",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Защищённое лобби</h3>
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                  style={{ background: "rgba(255, 255, 255, 0.1)" }}
                >
                  ✕
                </button>
              </div>

              <p className="text-sm mb-4" style={{ color: "rgba(255, 255, 255, 0.6)" }}>
                Введите пароль для входа
              </p>

              <form onSubmit={handlePasswordSubmit}>
                <input
                  type="password"
                  placeholder="Пароль"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-[10px] p-3 text-white text-sm mb-4"
                  style={{
                    background: "var(--app-input)",
                    border: "2px solid var(--app-accent)",
                    outline: "none"
                  }}
                />

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 rounded-[10px] h-[44px] font-bold text-white text-sm"
                    style={{ background: "var(--app-accent)" }}
                  >
                    Войти
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="rounded-[10px] px-4 h-[44px] font-bold text-white text-sm"
                    style={{ background: "rgba(255, 255, 255, 0.1)" }}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

