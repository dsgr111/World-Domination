import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { AppBrandLink } from "../components/AppBrandLink";
import { api, ApiError } from "../lib/api";
import { clearAuth, getAuth, saveAuth } from "../lib/auth";
import { ShaderPreview } from "../components/ShaderPreview";
import { shaderThemes, type ShaderThemeId } from "../components/shaderThemes";
import { THEMES, getTheme, setTheme } from "../lib/theme";

const SHADER_PREVIEWS = new Map<ShaderThemeId, string>(
  shaderThemes.map((theme) => [theme.id, theme.fragmentShader])
);

type ProfileUser = {
  id: number;
  email?: string;
  nickname: string;
  avatar_emoji: string;
  about?: string;
};

export function Settings() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string>("👤");
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [about, setAbout] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState(getTheme());
  const staticThemes = THEMES.filter((theme) => !theme.id.startsWith("shader-"));
  const dynamicThemes = THEMES.filter((theme) => theme.id.startsWith("shader-"));

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      navigate("/login");
      return;
    }
    setToken(auth.token);
    setCurrentUserAvatar(auth.user.avatar_emoji || "👤");
    const load = async () => {
      try {
        const data = await api<{ user: ProfileUser }>("/api/profile", {
          token: auth.token,
        });
        setUser(data.user);
        setEmail(data.user.email || "");
        setNickname(data.user.nickname || "");
        setAbout(data.user.about || "");
      } catch {
        setError("Не удалось загрузить настройки.");
      }
    };
    void load();
  }, [navigate]);

  useEffect(() => {
    setTheme(selectedTheme);
  }, [selectedTheme]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !user) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await api<{ user: ProfileUser }>("/api/profile", {
        method: "PATCH",
        token,
        body: {
          email,
          nickname,
          about,
          password: password || undefined,
        },
      });
      setUser(data.user);
      setPassword("");
      saveAuth(token, {
        id: data.user.id,
        email: data.user.email || "",
        nickname: data.user.nickname,
        avatar_emoji: data.user.avatar_emoji,
      });
      setSuccess("Изменения сохранены.");
    } catch (err) {
      const apiError = err as ApiError;
      const code = apiError?.data?.error || apiError.message;
      if (code === "EMAIL_TAKEN") {
        setError("Email уже занят.");
      } else if (code === "NICKNAME_TAKEN") {
        setError("Ник уже занят.");
      } else if (code === "WEAK_PASSWORD") {
        setError("Пароль слишком короткий.");
      } else {
        setError("Не удалось сохранить настройки.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate("/");
  };

  const handleOpenProfile = () => {
    navigate("/profile");
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
        className="h-16 px-6 flex items-center border-b relative"
        style={{
          background: "var(--app-header)",
          borderColor: "rgba(255, 255, 255, 0.1)",
          color: "var(--app-text)",
        }}
      >
        <AppBrandLink />

        {user && (
          <button
            onClick={handleOpenProfile}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all absolute right-6"
            style={{ background: "rgba(255, 255, 255, 0.1)" }}
          >
            <span className="text-xl">{currentUserAvatar}</span>
          </button>
        )}
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-8">
        <div
          className="rounded-[20px] p-6 mb-6"
          style={{ background: "var(--app-surface)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="text-xl font-bold text-white mb-1">Фон сайта</div>
          <div className="text-xs text-white/60 mb-5">
            Выберите статичный или динамический фон. Динамические темы используют анимацию.
          </div>

          <div className="mb-6">
            <div className="text-sm font-semibold text-white mb-2">Статичный фон</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {staticThemes.map((theme) => {
                const active = selectedTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setSelectedTheme(theme.id)}
                    className="rounded-[14px] p-3 text-left transition-all"
                    style={{
                      background: "rgba(12, 20, 34, 0.85)",
                      border: active
                        ? "1px solid rgba(87, 242, 211, 0.6)"
                        : "1px solid rgba(255,255,255,0.08)",
                      boxShadow: active ? "0 10px 24px rgba(87, 242, 211, 0.2)" : "none",
                    }}
                    >
                      <div
                        className="h-12 rounded-[10px] mb-2"
                      style={{
                        background: theme.preview,
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    />
                    <div className="text-sm font-bold text-white">{theme.name}</div>
                    <div className="text-xs text-white/60">{theme.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-white mb-2">Динамический фон</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {dynamicThemes.map((theme) => {
                const active = selectedTheme === theme.id;
                const shader = SHADER_PREVIEWS.get(theme.id as ShaderThemeId);
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setSelectedTheme(theme.id)}
                    className="rounded-[14px] p-3 text-left transition-all"
                    style={{
                      background: "rgba(12, 20, 34, 0.85)",
                      border: active
                        ? "1px solid rgba(87, 242, 211, 0.6)"
                        : "1px solid rgba(255,255,255,0.08)",
                      boxShadow: active ? "0 10px 24px rgba(87, 242, 211, 0.2)" : "none",
                    }}
                  >
                    <div
                      className="h-12 rounded-[10px] mb-2 overflow-hidden relative"
                      style={{
                        background: theme.preview,
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {shader && (
                        <ShaderPreview fragmentShader={shader} className="absolute inset-0" />
                      )}
                      <div
                        className="absolute bottom-1 right-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: "rgba(0,0,0,0.45)", color: "white" }}
                      >
                        Анимация
                      </div>
                    </div>
                    <div className="text-sm font-bold text-white">{theme.name}</div>
                    <div className="text-xs text-white/60">{theme.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div
          className="rounded-[20px] p-6"
          style={{ background: "var(--app-surface)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="text-xl font-bold text-white mb-1">Настройки профиля</div>
          <div className="text-xs text-white/60 mb-5">
            Изменение никнейма, email, пароля и информации о себе.
          </div>

          {error && <div className="text-sm mb-3" style={{ color: "var(--app-danger)" }}>{error}</div>}
          {success && <div className="text-sm mb-3" style={{ color: "var(--app-success)" }}>{success}</div>}

          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <div className="text-xs text-white/70 mb-1">Никнейм</div>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full rounded-[10px] p-3 text-sm text-white"
                style={{ background: "var(--app-input)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>

            <div>
              <div className="text-xs text-white/70 mb-1">Email</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[10px] p-3 text-sm text-white"
                style={{ background: "var(--app-input)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>

            <div>
              <div className="text-xs text-white/70 mb-1">Новый пароль</div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Оставьте пустым, если не нужно менять"
                className="w-full rounded-[10px] p-3 text-sm text-white"
                style={{ background: "var(--app-input)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>

            <div>
              <div className="text-xs text-white/70 mb-1">О себе</div>
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                className="w-full rounded-[10px] p-3 text-sm text-white min-h-[120px]"
                style={{ background: "var(--app-input)", border: "1px solid rgba(255,255,255,0.1)", resize: "vertical" }}
              />
            </div>

            <button
              type="submit"
              disabled={saving || !user}
              className="w-full rounded-[12px] h-[44px] font-bold text-white"
              style={{ background: "var(--app-success)", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Сохранение..." : "Сохранить изменения"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

