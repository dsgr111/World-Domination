import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { getAuth, saveAuth } from "../lib/auth";
import { EmojiPicker, DEFAULT_EMOJI } from "../components/EmojiPicker";

export function Register() {
  const navigate = useNavigate();
  const [selectedAvatar, setSelectedAvatar] = useState<string>(DEFAULT_EMOJI);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    if (auth) {
      navigate("/welcome");
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api<{ ok: boolean; email?: string; expiresAt?: number; skipVerification?: boolean; token?: string; user?: any }>(
        "/api/auth/register/request-code",
        {
          method: "POST",
          body: {
            email,
            password,
            nickname: username,
            avatarEmoji: selectedAvatar,
          },
        }
      );
      // When SMTP is not available, backend registers user directly
      if (data.skipVerification && data.token && data.user) {
        saveAuth({ token: data.token, user: data.user }, remember);
        navigate("/welcome");
        return;
      }
      sessionStorage.setItem(
        "wd_pending_verification",
        JSON.stringify({
          email: data.email,
          remember,
          expiresAt: data.expiresAt,
        })
      );
      navigate("/verify-email");
    } catch (err) {
      const apiError = err as ApiError;
      const code = apiError?.data?.error || apiError.message;
      if (code === "EMAIL_TAKEN") {
        setError("Этот email уже занят.");
      } else if (code === "NICKNAME_TAKEN") {
        setError("Этот ник уже занят.");
      } else if (code === "WEAK_PASSWORD") {
        setError("Пароль слишком короткий (минимум 6 символов).");
      } else if (code === "MISSING_FIELDS") {
        setError("Заполните все поля.");
      } else if (code === "EMAIL_NOT_CONFIGURED") {
        setError("На сервере не настроена отправка почты.");
      } else {
        setError("Не удалось зарегистрироваться.");
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden px-4"
      style={{ background: "var(--app-bg-gradient)" }}
    >
      <div className="bg-blob blob-1" />
      <div className="bg-blob blob-2" />
      <div className="bg-blob blob-3" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-[400px]"
      >
        <div
          className="rounded-[16px] p-8"
          style={{
            background: "var(--app-surface)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white mb-1">Регистрация</h1>
            <p className="text-sm" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
              Создайте новый аккаунт для игры
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-sm font-semibold text-white mb-3 block">Выберите аватар</label>
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-3xl"
                  style={{
                    background: "var(--app-input)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  {selectedAvatar}
                </div>
                <div className="text-xs text-white/60">Нажмите на эмодзи, чтобы выбрать.</div>
              </div>
              <EmojiPicker
                value={selectedAvatar}
                onSelect={setSelectedAvatar}
                recentKey="register_avatar_recent"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-white mb-2 block">Имя пользователя</label>
              <input
                type="text"
                placeholder="Введите имя"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full rounded-[10px] p-3 text-white text-sm"
                style={{
                  background: "var(--app-input)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-white mb-2 block">Email</label>
              <input
                type="email"
                placeholder="name@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-[10px] p-3 text-white text-sm"
                style={{
                  background: "var(--app-input)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-white mb-2 block">Пароль</label>
              <input
                type="password"
                placeholder="Придумайте пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-[10px] p-3 text-white text-sm"
                style={{
                  background: "var(--app-input)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  outline: "none",
                }}
              />
            </div>

            <label className="flex items-center gap-3 text-sm text-white/80 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4"
                style={{ accentColor: "var(--app-accent)" }}
              />
              <span>Запомнить на устройстве</span>
            </label>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full rounded-[10px] h-[44px] text-sm font-bold text-white mt-6 transition-all"
              style={{ background: "var(--app-accent)", opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Регистрация..." : "Зарегистрироваться"}
            </motion.button>

            {!remember && (
              <div className="text-xs text-center" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
                Без галки вход сохранится только до закрытия сайта.
              </div>
            )}

            {error && (
              <div className="text-xs mt-3 text-center" style={{ color: "var(--app-danger)" }}>
                {error}
              </div>
            )}
          </form>

          <p className="text-center mt-4 text-sm" style={{ color: "rgba(255, 255, 255, 0.6)" }}>
            Уже есть аккаунт?{" "}
            <Link
              to="/login"
              className="font-semibold hover:underline"
              style={{ color: "var(--app-accent)" }}
            >
              Войти
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
