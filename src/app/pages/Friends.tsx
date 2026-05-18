import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { io, Socket } from "socket.io-client";
import { api, ApiError, API_URL } from "../lib/api";
import { parseLobbyInvite, LobbyInvitePayload, isGlobalInviteHandler } from "../lib/invites";
import { getAuth, setInGame, setInLobby, setLobbyId } from "../lib/auth";
import { AnimatePresence, motion } from "motion/react";

type FriendInfo = {
  user_id: number;
  nickname: string;
  avatar_emoji: string;
};

type FriendRequest = {
  id: number;
  requester_id: number;
  addressee_id: number;
  nickname: string;
  avatar_emoji: string;
  created_at: number;
};

type FriendMessage = {
  sender_user_id: number;
  recipient_user_id: number;
  content: string;
  created_at: number;
};

type UserStats = {
  games: number;
  wins: number;
  losses: number;
};

type SearchResult = {
  id: number;
  nickname: string;
  avatar_emoji: string;
};

export function Friends() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [userNickname, setUserNickname] = useState("");
  const [userAvatar, setUserAvatar] = useState("👤");
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [activeFriendId, setActiveFriendId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Record<number, FriendMessage[]>>({});
  const [messageText, setMessageText] = useState("");
  const [unread, setUnread] = useState<Record<number, number>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [friendToast, setFriendToast] = useState<string | null>(null);
  const [inviteQueue, setInviteQueue] = useState<LobbyInvitePayload[]>([]);
  const [inGame, setInGame] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [userStats, setUserStats] = useState<Record<number, UserStats>>({});
  const socketRef = useRef<Socket | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const friendToastTimerRef = useRef<number | null>(null);
  const activeFriendIdRef = useRef<number | null>(null);
  const userIdRef = useRef<number | null>(null);
  const userStatsRef = useRef<Record<number, UserStats>>({});
  const statsRequestRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      navigate("/login");
      return;
    }
    setToken(auth.token);
    setUserId(auth.user.id);
    setUserNickname(auth.user.nickname);
    setUserAvatar(auth.user.avatar_emoji);
  }, [navigate]);

  useEffect(() => {
    activeFriendIdRef.current = activeFriendId;
  }, [activeFriendId]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    userStatsRef.current = userStats;
  }, [userStats]);

  const showToast = (message: string, duration = 2500) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), duration);
  };

  const showFriendToast = (message: string, duration = 10000) => {
    setFriendToast(message);
    if (friendToastTimerRef.current) {
      window.clearTimeout(friendToastTimerRef.current);
    }
    friendToastTimerRef.current = window.setTimeout(
      () => setFriendToast(null),
      duration
    );
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

  const handleAcceptInvite = async (invite: LobbyInvitePayload) => {
    if (!token) return;
    try {
      await api("/api/lobbies/join-invite", {
        method: "POST",
        token,
        body: { lobbyId: invite.lobbyId, inviteCode: invite.inviteCode },
      });
      setLobbyId(invite.lobbyId);
      setInLobby(true);
      setInGame(false);
      showToast("Вы присоединились к лобби");
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
      navigate("/lobby");
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

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (friendToastTimerRef.current) window.clearTimeout(friendToastTimerRef.current);
    };
  }, []);

  const loadFriends = async (authToken: string) => {
    const data = await api<{ friends: FriendInfo[] }>("/api/friends", {
      token: authToken,
    });
    setFriends(data.friends || []);
  };

  const loadRequests = async (authToken: string) => {
    const data = await api<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>(
      "/api/friends/requests",
      { token: authToken }
    );
    setIncoming(data.incoming || []);
    setOutgoing(data.outgoing || []);
  };

  const loadProfileInfo = async (authToken: string) => {
    const data = await api<{ inGame?: boolean; friends?: FriendInfo[] }>("/api/profile", {
      token: authToken,
    });
    if (data?.friends) {
      setFriends(data.friends);
    }
    setInGame(Boolean(data?.inGame));
    setFriendsLoaded(true);
  };

  const loadFriendMessages = async (authToken: string, friendId: number) => {
    const data = await api<{ messages: FriendMessage[] }>(
      `/api/friends/messages?userId=${friendId}`,
      { token: authToken }
    );
    setMessages((prev) => ({ ...prev, [friendId]: data.messages || [] }));
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
    if (!token) return;
    void loadProfileInfo(token);
    void loadRequests(token);
  }, [token]);

  useEffect(() => {
    if (!token || !userId) return;
    const ids = [userId, ...friends.map((f) => f.user_id)];
    void loadUserStats(token, ids);
  }, [token, userId, friends]);

  useEffect(() => {
    if (!token || !userId) return;
    userIdRef.current = userId;
    const socket = io(API_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on("friends:request", (payload) => {
      showFriendToast(`${payload.requester.nickname} хочет добавить вас в друзья`);
      void loadRequests(token);
    });

    socket.on("friend:message", (payload) => {
      const meId = userIdRef.current;
      const otherId =
        payload.senderUserId === meId ? payload.recipientUserId : payload.senderUserId;
      const invite = parseLobbyInvite(payload.content);
      const newMessage: FriendMessage = {
        sender_user_id: payload.senderUserId,
        recipient_user_id: payload.recipientUserId,
        content: payload.content,
        created_at: payload.createdAt,
      };
      setMessages((prev) => ({
        ...prev,
        [otherId]: [...(prev[otherId] || []), newMessage],
      }));
      if (activeFriendIdRef.current !== otherId) {
        setUnread((prev) => ({ ...prev, [otherId]: (prev[otherId] || 0) + 1 }));
      }
      if (invite && payload.recipientUserId === meId && !isGlobalInviteHandler()) {
        enqueueInvite(invite);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [token, userId]);

  const queryFriendId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const id = Number(params.get("userId"));
    return Number.isFinite(id) ? id : null;
  }, [location.search]);

  useEffect(() => {
    if (!queryFriendId || !friendsLoaded) return;
    if (!friends.some((f) => f.user_id === queryFriendId)) {
      showToast("Этот пользователь не в списке друзей");
      return;
    }
    setActiveFriendId(queryFriendId);
    setUnread((prev) => ({ ...prev, [queryFriendId]: 0 }));
  }, [queryFriendId, friends]);

  useEffect(() => {
    if (!token || !activeFriendId) return;
    if (messages[activeFriendId]) return;
    void loadFriendMessages(token, activeFriendId);
  }, [token, activeFriendId, messages]);

  const handleOpenFriend = async (friendId: number) => {
    if (!token) return;
    setActiveFriendId(friendId);
    setUnread((prev) => ({ ...prev, [friendId]: 0 }));
    if (!messages[friendId]) {
      await loadFriendMessages(token, friendId);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !activeFriendId || !messageText.trim()) return;
    if (inGame) {
      showToast("Личные сообщения недоступны во время игры");
      return;
    }
    try {
      await api("/api/friends/messages", {
        method: "POST",
        token,
        body: { targetUserId: activeFriendId, message: messageText },
      });
      setMessageText("");
    } catch (err) {
      const apiError = err as ApiError;
      const code = apiError?.data?.error || apiError.message;
      if (code === "IN_GAME") {
        showToast("Личные сообщения недоступны во время игры");
      } else {
        showToast("Не удалось отправить сообщение");
      }
    }
  };

  const handleAccept = async (requestId: number) => {
    if (!token) return;
    await api("/api/friends/accept", {
      method: "POST",
      token,
      body: { requestId },
    });
    await loadRequests(token);
    await loadFriends(token);
  };

  const handleDecline = async (requestId: number) => {
    if (!token) return;
    await api("/api/friends/decline", {
      method: "POST",
      token,
      body: { requestId },
    });
    await loadRequests(token);
  };

  const handleRemove = async (friendId: number) => {
    if (!token) return;
    await api("/api/friends/remove", {
      method: "POST",
      token,
      body: { userId: friendId },
    });
    setFriends((prev) => prev.filter((f) => f.user_id !== friendId));
    if (activeFriendId === friendId) {
      setActiveFriendId(null);
    }
  };

  const handleSearch = async () => {
    if (!token) return;
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    const data = await api<{ results: SearchResult[] }>(
      `/api/friends/search?q=${encodeURIComponent(searchTerm.trim())}`,
      { token }
    );
    setSearchResults(data.results || []);
  };

  const handleAddFriend = async (nickname: string) => {
    if (!token) return;
    try {
      await api("/api/friends/request", {
        method: "POST",
        token,
        body: { nickname },
      });
      showToast("Запрос отправлен");
      await loadRequests(token);
    } catch (err) {
      const apiError = err as ApiError;
      const code = apiError?.data?.error || apiError.message;
      if (code === "REQUEST_EXISTS") {
        showToast("Запрос уже отправлен");
      } else if (code === "ALREADY_FRIENDS") {
        showToast("Этот пользователь уже в друзьях");
      } else if (code === "CANNOT_ADD_SELF") {
        showToast("Нельзя добавить себя");
      } else if (code === "USER_NOT_FOUND") {
        showToast("Пользователь не найден");
      } else {
        showToast("Не удалось отправить запрос");
      }
    }
  };

  const activeFriend = friends.find((f) => f.user_id === activeFriendId) || null;
  const activeMessages = activeFriendId ? messages[activeFriendId] || [] : [];

  const handleOpenChatProfile = (targetId?: number) => {
    if (!targetId) return;
    if (targetId === userId) {
      navigate("/profile");
      return;
    }
    navigate(`/profile/${targetId}`);
  };

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

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: "var(--app-bg-gradient)" }}
    >
      <div className="bg-blob blob-1" />
      <div className="bg-blob blob-2" />
      <div className="bg-blob blob-3" />

      <header
        className="h-16 px-6 flex items-center justify-between border-b"
        style={{
          background: "var(--app-header)",
          borderColor: "rgba(255, 255, 255, 0.1)",
          color: "var(--app-text)",
        }}
      >
        <Link to="/lobby" className="text-sm transition-opacity hover:opacity-80">
          ← Назад
        </Link>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/profile")}
            className="text-xs transition-opacity hover:opacity-80"
          >
            Профиль
          </button>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.12)" }}
          >
            {userAvatar}
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-6 grid lg:grid-cols-[320px_1fr] gap-6">
        <div className="space-y-4">
          <div className="rounded-[16px] p-4" style={{ background: "var(--app-surface)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="text-sm font-bold text-white mb-3">Поиск друзей</div>
            <div className="flex gap-2">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Никнейм"
                className="flex-1 rounded-[8px] px-3 py-2 text-sm text-white"
                style={{ background: "var(--app-input)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
              <button
                onClick={handleSearch}
                className="rounded-[8px] px-3 text-xs font-bold text-white"
                style={{ background: "var(--app-accent)" }}
              >
                Найти
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="mt-3 space-y-2 text-xs text-white/70">
                {searchResults.map((result) => (
                  <div key={result.id} className="flex items-center justify-between">
                    <span>{result.avatar_emoji} {result.nickname}</span>
                    <button
                      onClick={() => handleAddFriend(result.nickname)}
                      className="text-xs text-white/80 hover:text-white"
                    >
                      Добавить
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[16px] p-4" style={{ background: "var(--app-surface)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="text-sm font-bold text-white mb-3">Запросы в друзья</div>
            {incoming.length ? (
              <div className="space-y-2 text-xs text-white/70">
                {incoming.map((req) => (
                  <div key={req.id} className="flex items-center justify-between">
                    <span>{req.avatar_emoji} {req.nickname}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAccept(req.id)}
                        className="text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        Принять
                      </button>
                      <button
                        onClick={() => handleDecline(req.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Отклонить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-white/50">Нет новых запросов.</div>
            )}
            {outgoing.length > 0 && (
              <div className="mt-3 text-xs text-white/50">
                Отправленные запросы: {outgoing.length}
              </div>
            )}
          </div>

          <div className="rounded-[16px] p-4" style={{ background: "var(--app-surface)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="text-sm font-bold text-white mb-3">Друзья</div>
            {friends.length ? (
              <div className="space-y-2">
                {friends.map((friend) => {
                  const active = friend.user_id === activeFriendId;
                  const unreadCount = unread[friend.user_id] || 0;
                  return (
                    <button
                      key={friend.user_id}
                      onClick={() => handleOpenFriend(friend.user_id)}
                      className="w-full flex items-center justify-between text-left rounded-[10px] px-3 py-2 text-xs"
                      style={{
                        background: active
                          ? "color-mix(in srgb, var(--app-success) 22%, transparent)"
                          : "var(--app-input)",
                        border: active
                          ? "1px solid color-mix(in srgb, var(--app-success) 55%, transparent)"
                          : "1px solid rgba(255,255,255,0.08)",
                        color: "#fff",
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span>{friend.avatar_emoji}</span>
                        {friend.nickname}
                      </span>
                      <span className="flex items-center gap-2">
                        {unreadCount > 0 && (
                          <span
                            className="px-2 py-[2px] rounded-full text-[10px] font-bold text-white"
                            style={{ background: "var(--app-danger)" }}
                          >
                            {unreadCount}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(friend.user_id);
                          }}
                          className="text-[10px] text-red-400 hover:text-red-300"
                        >
                          Удалить
                        </button>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-white/50">Список друзей пуст.</div>
            )}
          </div>
        </div>

        <div className="rounded-[20px] p-4 flex flex-col min-h-[420px]" style={{ background: "var(--app-surface-strong)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold text-white">
              {activeFriend ? `Диалог с ${activeFriend.nickname}` : "Выберите друга"}
            </div>
            {activeFriend && (
              <button
                onClick={() => navigate(`/profile/${activeFriend.user_id}`)}
                className="text-xs text-white/60 hover:text-white"
              >
                Профиль →
              </button>
            )}
          </div>

          {inGame && (
            <div className="text-xs mb-3" style={{ color: "var(--app-warning)" }}>
              Личные сообщения недоступны во время игры.
            </div>
          )}

          <div className="flex-1 rounded-[14px] p-4 overflow-y-auto custom-scrollbar"
               style={{ background: "var(--app-surface)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {activeFriend ? (
              activeMessages.length ? (
                <div className="space-y-3">
                  {activeMessages.map((msg, idx) => {
                    const isMine = msg.sender_user_id === userId;
                    const invite = parseLobbyInvite(msg.content);
                    if (invite) {
                      const inviterName =
                        invite.inviterNickname || (isMine ? userNickname : activeFriend?.nickname) || "Друг";
                      const inviterAvatar =
                        invite.inviterAvatar || (isMine ? userAvatar : activeFriend?.avatar_emoji) || "👤";
                      return (
                        <div key={idx} className="flex gap-3">
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
                      <div key={idx} className="flex gap-3">
                        <span className="text-2xl">
                          {isMine ? userAvatar : activeFriend.avatar_emoji}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenChatProfile(
                                  isMine ? userId || undefined : activeFriend.user_id
                                )
                              }
                              className="text-xs font-bold hover:underline"
                              style={{ color: "var(--app-accent)" }}
                            >
                              {isMine ? userNickname : activeFriend.nickname}
                            </button>
                            {renderUserStats(isMine ? userId || undefined : activeFriend.user_id)}
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
              <div className="text-sm text-white/60">Выберите друга слева.</div>
            )}
          </div>

          <form onSubmit={handleSendMessage} className="mt-4 flex gap-2">
            <input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={activeFriend ? "Введите сообщение..." : "Выберите друга"}
              disabled={!activeFriend || inGame}
              className="flex-1 rounded-[10px] p-3 text-sm text-white"
              style={{
                background: "var(--app-input)",
                border: "1px solid rgba(255,255,255,0.1)",
                opacity: activeFriend && !inGame ? 1 : 0.5,
              }}
            />
            <button
              type="submit"
              disabled={!activeFriend || inGame}
              className="w-12 rounded-[10px] text-white font-bold"
              style={{ background: "var(--app-success)", opacity: activeFriend && !inGame ? 1 : 0.5 }}
            >
              ➤
            </button>
          </form>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed left-1/2 top-8 -translate-x-1/2 z-50"
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
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed left-1/2 top-20 -translate-x-1/2 z-50"
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
    </div>
  );
}

