import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { io, Socket } from "socket.io-client";
import { api, API_URL, ApiError } from "../lib/api";
import {
  clearLobbyId,
  getAuth,
  getInGame,
  getInLobby,
  getLobbyId,
  setInGame,
  setInLobby,
  setLobbyId,
} from "../lib/auth";
import {
  LobbyInvitePayload,
  parseLobbyInvite,
  setGlobalInviteHandler,
} from "../lib/invites";

export function GlobalOverlays() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [inviteQueue, setInviteQueue] = useState<LobbyInvitePayload[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [savedLobbyId, setSavedLobbyId] = useState<string | null>(null);
  const [inLobby, setInLobbyState] = useState(false);
  const [inGame, setInGameState] = useState(false);
  const [bannerToast, setBannerToast] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const syncFlags = () => {
    setSavedLobbyId(getLobbyId());
    setInLobbyState(getInLobby());
    setInGameState(getInGame());
  };

  useEffect(() => {
    setGlobalInviteHandler(true);
    return () => setGlobalInviteHandler(false);
  }, []);

  useEffect(() => {
    syncFlags();
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname !== "/lobby") {
      setInLobby(false);
    }
    if (location.pathname !== "/game") {
      setInGame(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    syncFlags();
    const interval = window.setInterval(syncFlags, 1000);
    const handleStorage = () => syncFlags();
    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      setToken(null);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }
    setToken(auth.token);
    // token is enough for invite handling

    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    const socket = io(API_URL, { auth: { token: auth.token } });
    socketRef.current = socket;
    socket.on("friend:message", (payload) => {
      const invite = parseLobbyInvite(payload?.content);
      if (!invite) return;
      if (payload?.recipientUserId !== auth.user.id) return;
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
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = (message: string) => {
    setBannerToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setBannerToast(null);
    }, 2200);
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
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("wd:lobby-join", { detail: { lobbyId: invite.lobbyId } })
        );
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

  const handleReturnToLobby = async () => {
    if (!token || !savedLobbyId) return;
    try {
      const data = await api<{ lobby: { status: string } }>(
        `/api/lobbies/${savedLobbyId}`,
        { token }
      );
      if (data.lobby.status === "in_progress") {
        navigate("/game");
        return;
      }
      if (data.lobby.status === "finished") {
        clearLobbyId();
        setInLobby(false);
        setInGame(false);
        syncFlags();
        showToast("Эта игра уже завершена.");
        return;
      }
      navigate("/lobby");
    } catch {
      clearLobbyId();
      setInLobby(false);
      setInGame(false);
      syncFlags();
      showToast("Не удалось вернуться в лобби.");
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
    syncFlags();
    showToast("Вы покинули лобби.");
  };

  const shouldShowReturnBanner = useMemo(() => {
    if (!savedLobbyId || !token) return false;
    if (inLobby || inGame) return false;
    if (location.pathname === "/game") return false;
    return true;
  }, [savedLobbyId, token, inLobby, inGame, location.pathname]);

  return (
    <>
      <AnimatePresence>
        {shouldShowReturnBanner && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed left-1/2 top-4 -translate-x-1/2 z-50"
          >
            <div
              className="rounded-full px-4 py-2 flex items-center gap-3"
              style={{
                background: "var(--app-surface-strong)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                boxShadow: "0 12px 30px rgba(0, 0, 0, 0.35)",
              }}
            >
              <span className="text-xs text-white/70">Вы вышли из игры?</span>
              <button
                onClick={handleReturnToLobby}
                className="rounded-full px-3 py-1 text-xs font-bold text-white"
                style={{ background: "var(--app-success)" }}
              >
                Вернуться в игру
              </button>
              <button
                onClick={handleAbandonLobby}
                className="rounded-full px-3 py-1 text-xs font-bold text-white"
                style={{ background: "rgba(255,255,255,0.15)" }}
              >
                Покинуть игру
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {bannerToast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed left-1/2 top-16 -translate-x-1/2 z-50"
          >
            <div
              className="rounded-full px-4 py-2 text-xs font-bold text-white"
              style={{
                background: "var(--app-accent-strong)",
                boxShadow: "0 12px 30px color-mix(in srgb, var(--app-accent-strong) 35%, transparent)",
              }}
            >
              {bannerToast}
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
    </>
  );
}
