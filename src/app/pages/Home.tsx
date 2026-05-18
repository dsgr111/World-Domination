import { Link, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { api, API_URL, ApiError } from "../lib/api";
import { AppBrandLink } from "../components/AppBrandLink";
import { parseLobbyInvite, LobbyInvitePayload, isGlobalInviteHandler } from "../lib/invites";
import { clearAuth, getAuth, setInGame, setInLobby, setLobbyId } from "../lib/auth";

interface SiteMessage {
  player: string;
  avatar: string;
  text: string;
}

export function Home() {
  const navigate = useNavigate();
  const [isAuthed, setIsAuthed] = useState(false);
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("👑");
  const [token, setToken] = useState<string | null>(null);
  const [siteMessages, setSiteMessages] = useState<SiteMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const [inviteQueue, setInviteQueue] = useState<LobbyInvitePayload[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const SITE_MESSAGES_KEY = "wd_site_messages";

  const persistSiteMessages = (messages: SiteMessage[]) => {
    try {
      localStorage.setItem(SITE_MESSAGES_KEY, JSON.stringify(messages.slice(-100)));
    } catch {
      // ignore storage failures
    }
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
    const auth = getAuth();
    if (!auth) return;
    setIsAuthed(true);
    setToken(auth.token);
    setNickname(auth.user.nickname);
    setAvatar(auth.user.avatar_emoji);

    const load = async () => {
      try {
        const cached = localStorage.getItem(SITE_MESSAGES_KEY);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as SiteMessage[];
            if (Array.isArray(parsed)) {
              setSiteMessages(parsed);
            }
          } catch {
            // ignore
          }
        }
        const data = await api<{ messages: any[] }>("/api/site/messages", {
          token: auth.token,
        });
        const mapped = data.messages.map((msg) => ({
          player: msg.nickname || "Игрок",
          avatar: msg.avatar_emoji || "👤",
          text: msg.content,
        }));
        setSiteMessages(mapped);
        persistSiteMessages(mapped);
      } catch {
        // keep cached messages on error
      }
    };
    void load();

    const socket = io(API_URL, { auth: { token: auth.token } });
    socketRef.current = socket;
    socket.on("chat:site", (payload) => {
      setSiteMessages((prev) => {
        const next = [
          ...prev,
          {
            player: payload.nickname || "Игрок",
            avatar: payload.avatarEmoji || "👤",
            text: payload.message,
          },
        ];
        persistSiteMessages(next);
        return next;
      });
    });
    socket.on("friend:message", (payload) => {
      const invite = parseLobbyInvite(payload?.content);
      if (invite && payload?.recipientUserId === auth.user.id && !isGlobalInviteHandler()) {
        enqueueInvite(invite);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    socketRef.current?.emit("chat:site", { message: newMessage });
    setNewMessage("");
  };

  const handleAcceptInvite = async (invite: LobbyInvitePayload) => {
    if (!token) return;
    setInviteError(null);
    try {
      await api("/api/lobbies/join-invite", {
        method: "POST",
        token,
        body: { lobbyId: invite.lobbyId, inviteCode: invite.inviteCode },
      });
      setLobbyId(invite.lobbyId);
      setInLobby(true);
      setInGame(false);
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
        setInviteError("Вы уже находитесь в лобби");
      } else if (code === "LOBBY_FULL") {
        setInviteError("Лобби заполнено");
      } else if (code === "LOBBY_IN_PROGRESS") {
        setInviteError("Игра уже началась");
      } else if (code === "INVALID_INVITE") {
        setInviteError("Приглашение недействительно");
      } else {
        setInviteError("Не удалось войти в лобби");
      }
    }
  };

  const handleCloseInvite = () => {
    setInviteQueue((prev) => prev.slice(1));
    setInviteError(null);
  };

  const handleLogout = () => {
    clearAuth();
    navigate("/");
  };

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        background: "var(--app-bg-gradient)",
      }}
    >
      <div className="bg-blob blob-1" />
      <div className="bg-blob blob-2" />
      <div className="bg-blob blob-3" />

      <header
        className="h-16 px-6 flex items-center border-b relative"
        style={{
          background: "var(--app-header)",
          borderColor: "rgba(255, 255, 255, 0.1)",
          color: "var(--app-text)",
        }}
      >
        <AppBrandLink />

        {isAuthed && (
          <button
            onClick={() => navigate("/profile")}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all absolute right-6"
            style={{ background: "rgba(255, 255, 255, 0.1)" }}
          >
            <span className="text-xl">{avatar}</span>
          </button>
        )}
      </header>

      <div className="flex-1 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 w-full max-w-5xl px-4"
        >
        <div className="grid gap-6 md:grid-cols-[360px_1fr]">
          <div
            className="rounded-[16px] p-8"
            style={{
              background: "var(--app-surface)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            {/* Логотип и заголовок */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-2xl">🌍</span>
                <h1 className="text-2xl font-bold text-white">
                  Мировое<br />Господство
                </h1>
              </div>
              <p className="text-sm" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
                Стратегическая многопользовательская игра
              </p>
            </div>

            {isAuthed ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{avatar}</span>
                  <div>
                    <div className="text-sm text-white font-bold">{nickname}</div>
                    <div className="text-xs text-white/50">Аккаунт сохранён</div>
                  </div>
                </div>
                <button
                  onClick={() => navigate("/welcome")}
                  className="w-full rounded-[10px] h-[44px] font-bold text-white text-sm transition-all hover:opacity-90"
                  style={{ background: "var(--app-accent)" }}
                >
                  Продолжить
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full rounded-[10px] h-[44px] font-bold text-white text-sm transition-all hover:opacity-90"
                  style={{ background: "rgba(255, 255, 255, 0.1)" }}
                >
                  Выйти
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <Link to="/login" className="flex-1">
                  <button
                    className="w-full rounded-[10px] h-[44px] font-bold text-white text-sm transition-all hover:opacity-90"
                    style={{ background: "var(--app-accent)" }}
                  >
                    Войти через Google
                  </button>
                </Link>
                <Link to="/register" className="flex-1">
                  <button
                    className="w-full rounded-[10px] h-[44px] font-bold text-white text-sm transition-all hover:opacity-90"
                    style={{ background: "var(--app-success)" }}
                  >
                    Google регистрация
                  </button>
                </Link>
              </div>
            )}
          </div>

          <div
            className="rounded-[16px] p-6 flex flex-col"
            style={{
              background: "var(--app-surface)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              minHeight: "420px",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-bold text-white">Глобальный чат</div>
              <div className="text-xs text-white/50">все игроки</div>
            </div>

            <div className="flex-1 custom-scrollbar overflow-y-auto mb-4">
              {siteMessages.length === 0 ? (
                <div className="text-sm text-white/50">
                  {isAuthed ? "Пока нет сообщений." : "Войдите, чтобы общаться."}
                </div>
              ) : (
                <div className="space-y-3">
                  {siteMessages.map((msg, index) => (
                    <div key={index} className="flex gap-3">
                      <span className="text-2xl">{msg.avatar}</span>
                      <div>
                        <div className="text-sm font-bold" style={{ color: "var(--app-accent)" }}>
                          {msg.player}
                        </div>
                        <div className="text-sm text-white">{msg.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={isAuthed ? "Введите сообщение..." : "Войдите для чата"}
                disabled={!isAuthed}
                className="flex-1 rounded-[10px] p-3 text-white text-sm"
                style={{
                  background: "var(--app-input)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  outline: "none",
                  opacity: isAuthed ? 1 : 0.5,
                }}
              />
              <button
                type="submit"
                disabled={!isAuthed}
                className="w-12 h-12 rounded-[10px] flex items-center justify-center text-white transition-all"
                style={{ background: "var(--app-accent)", opacity: isAuthed ? 1 : 0.5 }}
              >
                ➤
              </button>
            </form>
          </div>
        </div>
        </motion.div>
      </div>

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
              {inviteError && (
                <div className="text-xs mb-3" style={{ color: "var(--app-danger)" }}>
                  {inviteError}
                </div>
              )}
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

