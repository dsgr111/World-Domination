import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AppBrandLink } from "../components/AppBrandLink";
import { api, ApiError } from "../lib/api";
import { clearAuth, getAuth, saveAuth } from "../lib/auth";
import { EmojiPicker } from "../components/EmojiPicker";

type ProfileUser = {
  id: number;
  email?: string;
  nickname: string;
  avatar_emoji: string;
  about?: string;
  profile_header?: string | null;
};

type ProfileStats = {
  games: number;
  wins: number;
  totalScore: number;
};

type HistoryItem = {
  lobby_id: string;
  country_name: string;
  score: number;
  result: string;
  created_at: number;
};

type FriendInfo = {
  user_id: number;
  nickname: string;
  avatar_emoji: string;
};

type ProfileComment = {
  id: number;
  profile_user_id: number;
  author_user_id: number;
  author_nickname: string;
  author_avatar: string;
  content: string;
  created_at: number;
};

type HeaderStroke = {
  id: string;
  type: "stroke";
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
};

type HeaderFill = {
  id: string;
  type: "fill";
  x: number;
  y: number;
  color: string;
};

type HeaderAction = HeaderStroke | HeaderFill;

const HEADER_CANVAS = { width: 960, height: 280 };
const FILL_TOLERANCE = 24;
const HEADER_COLORS = [
  "#ffffff",
  "#0f172a",
  "#1f2937",
  "#38bdf8",
  "#22c55e",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#e879f9",
  "#8b5cf6",
  "#06b6d4",
  "#94a3b8",
];

export function Profile() {
  const navigate = useNavigate();
  const params = useParams();
  const [token, setToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string>("👤");
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [isFriend, setIsFriend] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<ProfileComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [brushColor, setBrushColor] = useState("#ffffff");
  const [brushSize, setBrushSize] = useState(10);
  const [tool, setTool] = useState<"brush" | "bucket" | "eraser">("brush");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [isSavingHeader, setIsSavingHeader] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef(0);
  const baseImageRef = useRef<ImageData | null>(null);
  const actionsRef = useRef<HeaderAction[]>([]);
  const currentStrokeRef = useRef<HeaderStroke | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const profileId = params.id ? Number(params.id) : null;
  const isSelf = useMemo(() => {
    if (!currentUserId) return !profileId;
    return !profileId || profileId === currentUserId;
  }, [profileId, currentUserId]);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      navigate("/login");
      return;
    }
    setToken(auth.token);
    setCurrentUserId(auth.user.id);
    setCurrentUserAvatar(auth.user.avatar_emoji || "👤");
  }, [navigate]);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        setError(null);
        if (profileId && !isSelf) {
          const data = await api<{ user: ProfileUser; stats: ProfileStats; isFriend: boolean }>(
            `/api/users/${profileId}`,
            { token }
          );
          setUser(data.user);
          setStats(data.stats);
          setIsFriend(Boolean(data.isFriend));
          setRequestSent(false);
          setHistory([]);
          setFriends([]);
        } else {
          const data = await api<{
            user: ProfileUser;
            stats: ProfileStats;
            history: HistoryItem[];
            friends: FriendInfo[];
          }>("/api/profile", { token });
          setUser(data.user);
          setStats(data.stats);
          setHistory(data.history || []);
          setFriends(data.friends || []);
        }
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError?.data?.error || "Не удалось загрузить профиль");
      }
    };
    void load();
  }, [token, profileId, isSelf]);

  useEffect(() => {
    if (!token) return;
    const targetId = profileId ?? currentUserId;
    if (!targetId) return;
    const loadComments = async () => {
      try {
        const data = await api<{ comments: ProfileComment[] }>(
          `/api/profile/comments?userId=${targetId}`,
          { token }
        );
        setComments(data.comments || []);
      } catch {
        setComments([]);
      }
    };
    void loadComments();
  }, [token, profileId, currentUserId]);

  const updateHistoryIndex = useCallback((index: number) => {
    historyIndexRef.current = index;
    setHistoryIndex(index);
  }, []);

  const pushSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const snapshot = ctx.getImageData(
      0,
      0,
      HEADER_CANVAS.width,
      HEADER_CANVAS.height
    );
    const trimmed = historyRef.current.slice(0, historyIndexRef.current + 1);
    trimmed.push(snapshot);
    if (trimmed.length > 10) {
      trimmed.shift();
    }
    historyRef.current = trimmed;
    updateHistoryIndex(trimmed.length - 1);
  }, [updateHistoryIndex]);

  const applyHistory = useCallback(
    (index: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const snapshot = historyRef.current[index];
      if (!snapshot) return;
      ctx.putImageData(snapshot, 0, 0);
      updateHistoryIndex(index);
      baseImageRef.current = snapshot;
      actionsRef.current = [];
      currentStrokeRef.current = null;
    },
    [updateHistoryIndex]
  );

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    applyHistory(historyIndexRef.current - 1);
  }, [applyHistory]);

  const hexToRgba = (hex: string) => {
    const sanitized = hex.replace("#", "");
    if (sanitized.length === 3) {
      const r = parseInt(sanitized[0] + sanitized[0], 16);
      const g = parseInt(sanitized[1] + sanitized[1], 16);
      const b = parseInt(sanitized[2] + sanitized[2], 16);
      return { r, g, b, a: 255 };
    }
    const r = parseInt(sanitized.slice(0, 2), 16);
    const g = parseInt(sanitized.slice(2, 4), 16);
    const b = parseInt(sanitized.slice(4, 6), 16);
    return { r, g, b, a: 255 };
  };

  const colorsMatch = (
    data: Uint8ClampedArray,
    index: number,
    target: { r: number; g: number; b: number; a: number },
    tolerance: number
  ) => {
    return (
      Math.abs(data[index] - target.r) <= tolerance &&
      Math.abs(data[index + 1] - target.g) <= tolerance &&
      Math.abs(data[index + 2] - target.b) <= tolerance &&
      Math.abs(data[index + 3] - target.a) <= tolerance
    );
  };

  const createActionId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const runBucketFill = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string
  ) => {
    const width = HEADER_CANVAS.width;
    const height = HEADER_CANVAS.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const visited = new Uint8Array(width * height);
    const clampX = Math.min(width - 1, Math.max(0, Math.floor(x)));
    const clampY = Math.min(height - 1, Math.max(0, Math.floor(y)));
    const startIndex = (clampY * width + clampX) * 4;
    const target = {
      r: data[startIndex],
      g: data[startIndex + 1],
      b: data[startIndex + 2],
      a: data[startIndex + 3],
    };
    const fill = hexToRgba(color);
    if (
      target.r === fill.r &&
      target.g === fill.g &&
      target.b === fill.b &&
      target.a === fill.a
    ) {
      return false;
    }

    const stack: Array<[number, number]> = [[clampX, clampY]];
    const maxIterations = width * height * 4;
    let iterations = 0;
    while (stack.length) {
      if (iterations++ > maxIterations) break;
      const [cx, cy] = stack.pop() as [number, number];
      if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
      const index = cy * width + cx;
      if (visited[index]) continue;
      visited[index] = 1;
      const idx = index * 4;
      if (!colorsMatch(data, idx, target, FILL_TOLERANCE)) continue;
      data[idx] = fill.r;
      data[idx + 1] = fill.g;
      data[idx + 2] = fill.b;
      data[idx + 3] = fill.a;
      stack.push([cx + 1, cy]);
      stack.push([cx - 1, cy]);
      stack.push([cx, cy + 1]);
      stack.push([cx, cy - 1]);
    }
    ctx.putImageData(imageData, 0, 0);
    return true;
  };

  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: HeaderStroke) => {
    if (!stroke.points.length) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i += 1) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
    if (stroke.points.length === 1) {
      ctx.fillStyle = stroke.color;
      ctx.beginPath();
      ctx.arc(
        stroke.points[0].x,
        stroke.points[0].y,
        Math.max(1, stroke.width / 2),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  };

  const redrawFromActions = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, HEADER_CANVAS.width, HEADER_CANVAS.height);
    if (baseImageRef.current) {
      ctx.putImageData(baseImageRef.current, 0, 0);
    }
    actionsRef.current.forEach((action) => {
      if (action.type === "fill") {
        runBucketFill(ctx, action.x, action.y, action.color);
      } else {
        drawStroke(ctx, action);
      }
    });
  }, []);

  const distanceToSegment = (
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number
  ) => {
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) {
      return Math.hypot(px - ax, py - ay);
    }
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    const clamped = Math.max(0, Math.min(1, t));
    const cx = ax + clamped * dx;
    const cy = ay + clamped * dy;
    return Math.hypot(px - cx, py - cy);
  };

  const isPointNearStroke = (stroke: HeaderStroke, x: number, y: number) => {
    const tolerance = stroke.width / 2 + 6;
    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      return Math.hypot(x - point.x, y - point.y) <= tolerance;
    }
    for (let i = 0; i < stroke.points.length - 1; i += 1) {
      const a = stroke.points[i];
      const b = stroke.points[i + 1];
      if (distanceToSegment(x, y, a.x, a.y, b.x, b.y) <= tolerance) {
        return true;
      }
    }
    return false;
  };

  const handleBucketFill = useCallback(
    (x: number, y: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const didFill = runBucketFill(ctx, x, y, brushColor);
      if (!didFill) return;
      actionsRef.current.push({
        id: createActionId(),
        type: "fill",
        x,
        y,
        color: brushColor,
      });
      pushSnapshot();
    },
    [brushColor, pushSnapshot]
  );

  const loadHeaderToCanvas = useCallback(
    (image?: string | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = HEADER_CANVAS.width;
      canvas.height = HEADER_CANVAS.height;
      canvas.style.width = `${HEADER_CANVAS.width}px`;
      canvas.style.height = `${HEADER_CANVAS.height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, HEADER_CANVAS.width, HEADER_CANVAS.height);

      if (image) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, HEADER_CANVAS.width, HEADER_CANVAS.height);
          ctx.drawImage(img, 0, 0, HEADER_CANVAS.width, HEADER_CANVAS.height);
          const snapshot = ctx.getImageData(
            0,
            0,
            HEADER_CANVAS.width,
            HEADER_CANVAS.height
          );
          historyRef.current = [snapshot];
          updateHistoryIndex(0);
          baseImageRef.current = snapshot;
          actionsRef.current = [];
          currentStrokeRef.current = null;
        };
        img.src = image;
      } else {
        const snapshot = ctx.getImageData(
          0,
          0,
          HEADER_CANVAS.width,
          HEADER_CANVAS.height
        );
        historyRef.current = [snapshot];
        updateHistoryIndex(0);
        baseImageRef.current = snapshot;
        actionsRef.current = [];
        currentStrokeRef.current = null;
      }
    },
    [updateHistoryIndex]
  );

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handleEraseAt = useCallback(
    (x: number, y: number) => {
      const actions = actionsRef.current;
      for (let i = actions.length - 1; i >= 0; i -= 1) {
        const action = actions[i];
        if (action.type !== "stroke") continue;
        if (isPointNearStroke(action, x, y)) {
          actions.splice(i, 1);
          redrawFromActions();
          pushSnapshot();
          return;
        }
      }
    },
    [pushSnapshot, redrawFromActions]
  );

  const handleCanvasPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPoint(event);
    if (tool === "bucket") {
      handleBucketFill(x, y);
      canvas.releasePointerCapture?.(event.pointerId);
      return;
    }
    if (tool === "eraser") {
      handleEraseAt(x, y);
      canvas.releasePointerCapture?.(event.pointerId);
      return;
    }
    isDrawingRef.current = true;
    lastPointRef.current = { x, y };
    currentStrokeRef.current = {
      id: createActionId(),
      type: "stroke",
      points: [{ x, y }],
      color: brushColor,
      width: brushSize,
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleCanvasPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (tool !== "brush") return;
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPoint(event);
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    if (lastPointRef.current) {
      ctx.lineTo(x, y);
      ctx.stroke();
      lastPointRef.current = { x, y };
      currentStrokeRef.current?.points.push({ x, y });
    }
  };

  const finishDrawing = useCallback(() => {
    if (tool !== "brush") return;
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    const stroke = currentStrokeRef.current;
    if (stroke && stroke.points.length) {
      actionsRef.current.push(stroke);
    }
    currentStrokeRef.current = null;
    pushSnapshot();
  }, [pushSnapshot, tool]);

  useEffect(() => {
    if (!isEditingHeader) return;
    loadHeaderToCanvas(user?.profile_header);
  }, [isEditingHeader, loadHeaderToCanvas, user?.profile_header]);

  useEffect(() => {
    if (!isEditingHeader) return;
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleUndo, isEditingHeader]);

  const handleAddFriend = async () => {
    if (!token || !user) return;
    try {
      await api("/api/friends/request", {
        method: "POST",
        token,
        body: { nickname: user.nickname },
      });
      setRequestSent(true);
    } catch (err) {
      const apiError = err as ApiError;
      const code = apiError?.data?.error || apiError.message;
      if (code === "ALREADY_FRIENDS") {
        setIsFriend(true);
        setRequestSent(false);
      } else if (code === "REQUEST_EXISTS") {
        setRequestSent(true);
      }
    }
  };

  const handleRemoveFriend = async (friendId: number) => {
    if (!token) return;
    await api("/api/friends/remove", {
      method: "POST",
      token,
      body: { userId: friendId },
    });
    setFriends((prev) => prev.filter((f) => f.user_id !== friendId));
  };

  const handleMessageFriend = () => {
    if (!user) return;
    navigate(`/friends?userId=${user.id}`);
  };

  const handleLogout = () => {
    clearAuth();
    navigate("/");
  };

  const handleOpenProfile = () => {
    navigate("/profile");
  };

  const handleStartHeaderEdit = () => {
    if (!isSelf) return;
    setIsEditingHeader(true);
  };

  const handleCloseHeaderEdit = () => {
    setIsEditingHeader(false);
  };

  const exportHeaderImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    let dataUrl = canvas.toDataURL("image/webp", 0.92);
    if (!dataUrl.startsWith("data:image/")) {
      dataUrl = canvas.toDataURL("image/png");
    }
    return dataUrl;
  };

  const handleSaveHeader = async () => {
    if (!token || !user) return;
    const dataUrl = exportHeaderImage();
    if (!dataUrl) return;
    if (dataUrl.length > 780000) {
      setError("Шапка слишком большая. Уменьшите количество деталей или толщину кисти.");
      return;
    }
    try {
      setIsSavingHeader(true);
      const data = await api<{ user: ProfileUser }>("/api/profile", {
        method: "PATCH",
        token,
        body: { headerImage: dataUrl },
      });
      setUser((prev) => (prev ? { ...prev, profile_header: data.user.profile_header } : prev));
      setIsEditingHeader(false);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.data?.error || "Не удалось сохранить шапку");
    } finally {
      setIsSavingHeader(false);
    }
  };

  const handleSelectAvatar = async (emoji: string) => {
    if (!token || !user) return;
    if (emoji === user.avatar_emoji) {
      setShowAvatarPicker(false);
      return;
    }
    try {
      setIsSavingAvatar(true);
      const data = await api<{ user: ProfileUser }>("/api/profile", {
        method: "PATCH",
        token,
        body: { avatarEmoji: emoji },
      });
      setUser((prev) =>
        prev
          ? { ...prev, avatar_emoji: data.user.avatar_emoji }
          : prev
      );
      setCurrentUserAvatar(data.user.avatar_emoji);
      const auth = getAuth();
      if (auth) {
        saveAuth(auth.token, {
          ...auth.user,
          avatar_emoji: data.user.avatar_emoji,
          nickname: data.user.nickname || auth.user.nickname,
          email: data.user.email || auth.user.email,
        });
      }
      setShowAvatarPicker(false);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.data?.error || "Не удалось сменить аватар.");
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const handleSubmitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    const targetId = profileId ?? currentUserId;
    if (!targetId) return;
    const text = commentText.trim();
    if (!text) return;
    setCommentLoading(true);
    try {
      const data = await api<{ comment: ProfileComment }>("/api/profile/comments", {
        method: "POST",
        token,
        body: { targetUserId: targetId, content: text },
      });
      setComments((prev) => [data.comment, ...prev]);
      setCommentText("");
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.data?.error || "Не удалось отправить комментарий");
    } finally {
      setCommentLoading(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!token) return;
    try {
      await api(`/api/profile/comments/${commentId}`, {
        method: "DELETE",
        token,
      });
      setComments((prev) => prev.filter((item) => item.id !== commentId));
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.data?.error || "Не удалось удалить комментарий");
    }
  };

  const gamesCount = stats?.games || 0;
  const winsCount = stats?.wins || 0;
  const lossesCount = Math.max(0, gamesCount - winsCount);
  const winPercent = gamesCount > 0 ? Math.round((winsCount / gamesCount) * 100) : 0;
  const formatCommentDate = (value: number) =>
    new Date(value).toLocaleString("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-x-hidden"
      style={{ background: "var(--app-bg-gradient)" }}
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

        {currentUserId && (
          <button
            onClick={handleOpenProfile}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all absolute right-6"
            style={{ background: "rgba(255, 255, 255, 0.1)" }}
          >
            <span className="text-xl">{currentUserAvatar}</span>
          </button>
        )}
      </header>

      <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        {error && (
          <div className="text-center text-sm mb-4" style={{ color: "var(--app-danger)" }}>
            {error}
          </div>
        )}

        {user && (
          <div
            className="rounded-[28px] p-6"
            style={{
              background: "var(--app-surface-strong)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 25px 60px rgba(0,0,0,0.35)",
            }}
          >
          <div className="space-y-6">
            <div
              className="rounded-[24px] overflow-visible relative"
              style={{
                background: "var(--app-surface-strong)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                className="relative group rounded-t-[24px] overflow-hidden"
                style={{ height: `${HEADER_CANVAS.height}px` }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(120deg, color-mix(in srgb, var(--app-accent-strong) 42%, transparent) 0%, color-mix(in srgb, var(--app-success) 28%, transparent) 50%, color-mix(in srgb, var(--app-accent) 35%, transparent) 100%)",
                  }}
                />
                {user.profile_header && (
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `url(${user.profile_header})`,
                      backgroundSize: "100% 100%",
                      backgroundPosition: "center",
                      backgroundRepeat: "no-repeat",
                    }}
                  />
                )}
                {isSelf && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button
                      onClick={handleStartHeaderEdit}
                      className="px-4 py-2 rounded-[12px] text-xs font-bold transition-opacity opacity-0 group-hover:opacity-100"
                      style={{
                        background: "rgba(0,0,0,0.55)",
                        border: "1px solid rgba(255,255,255,0.3)",
                        color: "white",
                        backdropFilter: "blur(6px)",
                      }}
                    >
                      Редактировать шапку
                    </button>
                  </div>
                )}
              </div>

              <div className="px-6 pb-6 pt-4">
                <div className="relative group w-20 h-20">
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center text-5xl"
                    style={{
                      background: "var(--app-surface-strong)",
                      border: "3px solid rgba(255,255,255,0.22)",
                    }}
                  >
                    {user.avatar_emoji}
                  </div>
                  {isSelf && (
                    <button
                      onClick={() => setShowAvatarPicker((prev) => !prev)}
                      className="absolute inset-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto"
                      style={{
                        background: "rgba(0,0,0,0.55)",
                        border: "1px solid rgba(255,255,255,0.2)",
                      }}
                    >
                      Сменить
                    </button>
                  )}
                  {isSelf && showAvatarPicker && (
                    <div className="absolute left-1/2 top-full mt-3 -translate-x-1/2 w-[320px] z-20">
                      <div className="flex items-center justify-between mb-2 px-1">
                        <div className="text-[11px] text-white/70">Выберите аватар</div>
                        <button
                          onClick={() => setShowAvatarPicker(false)}
                          className="w-5 h-5 rounded-full text-[10px] text-white/70"
                          style={{ background: "rgba(255,255,255,0.12)" }}
                        >
                          ✕
                        </button>
                      </div>
                      <EmojiPicker
                        value={user.avatar_emoji}
                        onSelect={handleSelectAvatar}
                        onClose={() => setShowAvatarPicker(false)}
                        closeOnSelect
                        recentKey="avatar_recent"
                        className="shadow-[0_16px_30px_rgba(0,0,0,0.35)]"
                      />
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-2xl font-bold text-white">{user.nickname}</div>
                    {isSelf && user.email && (
                      <div className="text-xs text-white/60 mt-1">{user.email}</div>
                    )}
                    <div className="text-sm text-white/70 mt-3 max-w-3xl">
                      {user.about || "Пользователь пока не добавил информацию о себе."}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-3">
                    {isSelf && (
                      <div
                        className="rounded-[14px] px-4 py-3"
                        style={{
                          background: "var(--app-surface)",
                          border: "1px solid rgba(120, 180, 255, 0.25)",
                          boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
                        }}
                      >
                        <div className="text-xs text-white/55 mb-1">Аккаунт</div>
                        <div className="text-sm font-bold text-white mb-2">{user.nickname}</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => navigate("/settings")}
                            className="rounded-[10px] px-3 h-[32px] text-[11px] font-bold text-white"
                            style={{
                              background: "color-mix(in srgb, var(--app-accent) 22%, transparent)",
                            }}
                          >
                            Настройки
                          </button>
                          <button
                            onClick={handleLogout}
                            className="rounded-[10px] px-3 h-[32px] text-[11px] font-bold text-white"
                            style={{
                              background: "color-mix(in srgb, var(--app-danger) 30%, transparent)",
                            }}
                          >
                            Выйти
                          </button>
                        </div>
                      </div>
                    )}
                    {!isSelf && (
                      <div className="flex gap-2">
                        <button
                          onClick={handleMessageFriend}
                          className="rounded-[10px] h-[40px] px-4 font-bold text-white text-sm"
                          style={{ background: "var(--app-accent)" }}
                        >
                          Написать
                        </button>
                        <button
                          onClick={handleAddFriend}
                          disabled={isFriend || requestSent}
                          className="rounded-[10px] h-[40px] px-4 font-bold text-white text-sm"
                          style={{
                            background: isFriend || requestSent ? "rgba(255,255,255,0.1)" : "var(--app-success)",
                            opacity: isFriend || requestSent ? 0.7 : 1,
                          }}
                        >
                          {isFriend ? "Уже в друзьях" : requestSent ? "Запрос отправлен" : "В друзья"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-6">
              <div className="space-y-4">
                <div
                  className="rounded-[16px] p-4"
                  style={{ background: "var(--app-surface)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="text-sm font-bold text-white mb-3">Профильная статистика</div>
                  <div className="flex items-center gap-4 text-xs font-semibold">
                    <span style={{ color: "rgba(255,255,255,0.55)" }}>Игр {gamesCount}</span>
                    <span style={{ color: "var(--app-success)" }}>▲ {winsCount}</span>
                    <span style={{ color: "var(--app-danger)" }}>▼ {lossesCount}</span>
                  </div>
                  <div className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.65)" }}>
                    Процент побед: {winPercent}%
                  </div>
                  <div
                    className="mt-3 rounded-[12px] p-3 text-xs text-white/70"
                    style={{ background: "color-mix(in srgb, var(--app-warning) 18%, transparent)" }}
                  >
                    Очки
                    <div className="text-lg font-bold text-white">{stats?.totalScore || 0}</div>
                  </div>
                </div>

                <div
                  className="rounded-[16px] p-4"
                  style={{ background: "var(--app-surface)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-bold text-white">История матчей</div>
                    {isSelf && history.length > 5 && (
                      <button
                        onClick={() => setShowHistoryModal(true)}
                        className="text-xs text-white/60 hover:text-white"
                      >
                        Смотреть все
                      </button>
                    )}
                  </div>
                  {isSelf ? (
                    <div className="space-y-2 text-xs max-h-[320px] overflow-y-auto custom-scrollbar">
                      {history.length ? (
                        history.slice(0, 5).map((item, idx) => (
                          <div
                            key={`${item.lobby_id}-${idx}`}
                            className="rounded-[10px] p-3"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                          >
                            <div className="text-white font-semibold">{item.country_name || "Страна"}</div>
                            <div className="text-white/65 mt-1">
                              {item.result === "win" ? "Победа" : "Поражение"} • {item.score} очков
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-white/50">Истории пока нет.</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-white/50">История матчей доступна только владельцу профиля.</div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div
                  className="rounded-[16px] p-4"
                  style={{ background: "var(--app-surface)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-bold text-white">Друзья</div>
                    {isSelf && (
                      <Link to="/friends" className="text-xs text-white/60 hover:text-white">
                        Управление друзьями
                      </Link>
                    )}
                  </div>
                  {isSelf ? (
                    <div className="space-y-2">
                      {friends.length ? (
                        friends.slice(0, 10).map((friend) => (
                          <div
                            key={friend.user_id}
                            className="rounded-[10px] p-3 flex items-center justify-between text-xs"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-base"
                                style={{ background: "rgba(255,255,255,0.12)" }}
                              >
                                {friend.avatar_emoji}
                              </div>
                              <span className="text-white/80">{friend.nickname}</span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => navigate(`/profile/${friend.user_id}`)}
                                className="text-white/60 hover:text-white"
                              >
                                Профиль
                              </button>
                              <button
                                onClick={() => handleRemoveFriend(friend.user_id)}
                                className="text-red-400 hover:text-red-300"
                              >
                                Удалить
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-white/50">Пока нет друзей.</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-white/50">Список друзей этого пользователя скрыт.</div>
                  )}
                </div>
              </div>
            </div>

            <div
              className="rounded-[18px] p-5"
              style={{ background: "var(--app-surface-strong)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-white">Комментарии</div>
                <div className="text-xs text-white/50">
                  {comments.length} {comments.length === 1 ? "комментарий" : "комментариев"}
                </div>
              </div>
              <form onSubmit={handleSubmitComment} className="grid md:grid-cols-[1fr_auto] gap-3 mb-4">
                <textarea
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Оставьте комментарий..."
                  className="w-full rounded-[12px] p-3 text-white text-sm min-h-[90px]"
                  style={{
                    background: "var(--app-input)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={commentLoading || !commentText.trim()}
                  className="rounded-[12px] h-[42px] px-5 text-xs font-bold text-white self-start"
                  style={{
                    background: "var(--app-accent)",
                    opacity: commentLoading || !commentText.trim() ? 0.6 : 1,
                  }}
                >
                  {commentLoading ? "Отправка..." : "Отправить"}
                </button>
              </form>
              <div className="space-y-3 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                {comments.length ? (
                  comments.map((comment) => {
                    const canDelete =
                      currentUserId === comment.author_user_id ||
                      currentUserId === comment.profile_user_id;
                    return (
                      <div
                        key={comment.id}
                        className="rounded-[14px] p-4"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-lg">{comment.author_avatar || "👤"}</span>
                            <button
                              type="button"
                              onClick={() => navigate(`/profile/${comment.author_user_id}`)}
                              className="text-white/90 hover:text-white font-semibold"
                            >
                              {comment.author_nickname || "Игрок"}
                            </button>
                            <span className="text-[10px] text-white/45">
                              {formatCommentDate(comment.created_at)}
                            </span>
                          </div>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment.id)}
                              className="text-[10px] text-red-300 hover:text-red-200"
                            >
                              Удалить
                            </button>
                          )}
                        </div>
                        <div className="text-sm text-white/85 mt-3 whitespace-pre-wrap">
                          {comment.content}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-white/50">Комментариев пока нет.</div>
                )}
              </div>
            </div>
          </div>
          </div>
        )}
      </div>

      {isEditingHeader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(6, 10, 16, 0.72)" }}
            onClick={handleCloseHeaderEdit}
          />
          <div
            className="relative w-[min(980px,94vw)] rounded-[22px] p-6"
            style={{
              background: "var(--app-surface-strong)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 30px 70px rgba(0,0,0,0.45)",
              color: "var(--app-text)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-white">Шапка профиля</div>
                <div className="text-xs text-white/60">Рисуйте мышью или тачем. Ctrl+Z — отмена.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  className="rounded-[10px] h-[36px] px-4 text-xs font-bold"
                  style={{
                    background:
                      historyIndex <= 0
                        ? "rgba(255,255,255,0.08)"
                        : "color-mix(in srgb, var(--app-warning) 30%, transparent)",
                    color: "white",
                    opacity: historyIndex <= 0 ? 0.6 : 1,
                  }}
                >
                  Отменить
                </button>
                <button
                  onClick={handleSaveHeader}
                  disabled={isSavingHeader}
                  className="rounded-[10px] h-[36px] px-4 text-xs font-bold"
                  style={{
                    background: "var(--app-success)",
                    color: "white",
                    opacity: isSavingHeader ? 0.7 : 1,
                  }}
                >
                  {isSavingHeader ? "Сохранение..." : "Сохранить"}
                </button>
                <button
                  onClick={handleCloseHeaderEdit}
                  className="rounded-[10px] h-[36px] px-4 text-xs font-bold"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "white",
                  }}
                >
                  Закрыть
                </button>
              </div>
            </div>

            <div
              className="mt-4 rounded-[16px] overflow-hidden"
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.35)",
              }}
            >
              <canvas
                ref={canvasRef}
                className="w-full"
                style={{
                  touchAction: "none",
                  height: `${HEADER_CANVAS.height}px`,
                  cursor:
                    tool === "bucket" ? "cell" : tool === "eraser" ? "not-allowed" : "crosshair",
                }}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={finishDrawing}
                onPointerLeave={finishDrawing}
                onPointerCancel={finishDrawing}
              />
            </div>

            <div className="mt-4 grid md:grid-cols-[1fr_260px] gap-4">
              <div
                className="rounded-[14px] p-4"
                style={{
                  background: "var(--app-surface)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-white/60">Палитра</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTool("brush")}
                      className="rounded-[10px] px-3 h-[28px] text-[11px] font-bold"
                      style={{
                        background:
                          tool === "brush"
                            ? "color-mix(in srgb, var(--app-accent) 35%, transparent)"
                            : "rgba(255,255,255,0.08)",
                        color: "white",
                        border: "1px solid rgba(255,255,255,0.18)",
                      }}
                    >
                      Кисть
                    </button>
                    <button
                      onClick={() => setTool("bucket")}
                      className="rounded-[10px] px-3 h-[28px] text-[11px] font-bold"
                      style={{
                        background:
                          tool === "bucket"
                            ? "color-mix(in srgb, var(--app-warning) 35%, transparent)"
                            : "rgba(255,255,255,0.08)",
                        color: "white",
                        border: "1px solid rgba(255,255,255,0.18)",
                      }}
                    >
                      Заливка
                    </button>
                    <button
                      onClick={() => setTool("eraser")}
                      className="rounded-[10px] px-3 h-[28px] text-[11px] font-bold"
                      style={{
                        background:
                          tool === "eraser"
                            ? "color-mix(in srgb, var(--app-danger) 35%, transparent)"
                            : "rgba(255,255,255,0.08)",
                        color: "white",
                        border: "1px solid rgba(255,255,255,0.18)",
                      }}
                    >
                      Ластик
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {HEADER_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setBrushColor(color)}
                      className="w-7 h-7 rounded-full border transition-all"
                      style={{
                        background: color,
                        borderColor:
                          brushColor === color ? "white" : "rgba(255,255,255,0.2)",
                        boxShadow:
                          brushColor === color
                            ? "0 0 0 2px rgba(255,255,255,0.35)"
                            : "none",
                      }}
                    />
                  ))}
                  <label
                    className="w-7 h-7 rounded-full border flex items-center justify-center cursor-pointer"
                    style={{
                      borderColor: "rgba(255,255,255,0.35)",
                      background: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <input
                      type="color"
                      value={brushColor}
                      onChange={(event) => setBrushColor(event.target.value)}
                      className="absolute opacity-0"
                    />
                    <span
                      className="w-4 h-4 rounded-full"
                      style={{ background: brushColor }}
                    />
                  </label>
                </div>
              </div>

              <div
                className="rounded-[14px] p-4"
                style={{
                  background: "var(--app-surface)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="text-xs text-white/60 mb-2">Толщина кисти</div>
                <input
                  type="range"
                  min={2}
                  max={32}
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                  className="w-full"
                />
                <div className="mt-3 flex items-center gap-3 text-xs text-white/70">
                  <span>Размер: {brushSize}px</span>
                  <span
                    className="rounded-full"
                    style={{
                      width: `${Math.max(6, brushSize)}px`,
                      height: `${Math.max(6, brushSize)}px`,
                      background: brushColor,
                      boxShadow: "0 0 0 2px rgba(255,255,255,0.15)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(8px)" }}
          onClick={() => setShowHistoryModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl rounded-[20px] p-6"
            style={{
              background: "var(--app-surface)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-bold text-white">Вся история игр</div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar">
              {history.length ? (
                history.map((item, idx) => (
                  <div
                    key={`${item.lobby_id}-${idx}`}
                    className="rounded-[12px] p-3"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <div className="text-white font-semibold">{item.country_name || "Страна"}</div>
                    <div className="text-white/65 mt-1">
                      {item.result === "win" ? "Победа" : "Поражение"} • {item.score} очков
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-white/50">Истории пока нет.</div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
  );
}



