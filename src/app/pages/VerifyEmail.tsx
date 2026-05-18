import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, ApiError } from "../lib/api";
import { getAuth, saveAuth } from "../lib/auth";

type PendingVerification = {
  email: string;
  remember: boolean;
  expiresAt: number;
};

export function VerifyEmail() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<PendingVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const auth = getAuth();
    if (auth) {
      navigate("/welcome");
      return;
    }
    const raw = sessionStorage.getItem("wd_pending_verification");
    if (!raw) {
      navigate("/register");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PendingVerification;
      setPending(parsed);
    } catch {
      navigate("/register");
    }
  }, [navigate]);

  useEffect(() => {
    if (!pending) return;
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((pending.expiresAt - Date.now()) / 1000)));
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [pending]);

  const formattedTime = useMemo(() => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = String(secondsLeft % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  }, [secondsLeft]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    setError(null);
    setLoading(true);
    try {
      const data = await api<{ token: string; user: any }>("/api/auth/register/verify-code", {
        method: "POST",
        body: {
          email: pending.email,
          code,
        },
      });
      sessionStorage.removeItem("wd_pending_verification");
      saveAuth(data.token, data.user, pending.remember);
      navigate("/welcome");
    } catch (err) {
      const apiError = err as ApiError;
      const errorCode = apiError?.data?.error || apiError.message;
      if (errorCode === "INVALID_CODE") {
        setError("Неверный код.");
      } else if (errorCode === "CODE_EXPIRED") {
        setError("Срок действия кода истёк. Зарегистрируйтесь заново.");
      } else if (errorCode === "VERIFICATION_NOT_FOUND") {
        setError("Запрос на подтверждение не найден.");
      } else if (errorCode === "EMAIL_TAKEN") {
        setError("Эта почта уже зарегистрирована.");
      } else if (errorCode === "NICKNAME_TAKEN") {
        setError("Ник уже занят, начните регистрацию заново.");
      } else {
        setError("Не удалось подтвердить почту.");
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
            <h1 className="text-2xl font-bold text-white mb-1">Подтверждение почты</h1>
            <p className="text-sm" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
              Мы отправили 6-значный код на {pending?.email || "вашу почту"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-sm font-semibold text-white mb-2 block">Код из письма</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                className="w-full rounded-[10px] p-3 text-white text-sm tracking-[0.4em] text-center"
                style={{
                  background: "var(--app-input)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  outline: "none",
                }}
              />
            </div>

            <div className="text-xs text-center" style={{ color: "rgba(255,255,255,0.55)" }}>
              Код действует: {formattedTime}
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full rounded-[10px] h-[44px] text-sm font-bold text-white transition-all"
              style={{ background: "var(--app-accent)", opacity: loading || code.length !== 6 ? 0.7 : 1 }}
            >
              {loading ? "Проверка..." : "Подтвердить"}
            </motion.button>

            {error && (
              <div className="text-xs mt-3 text-center" style={{ color: "var(--app-danger)" }}>
                {error}
              </div>
            )}
          </form>

          <p className="text-center mt-4 text-sm" style={{ color: "rgba(255, 255, 255, 0.6)" }}>
            Не пришло письмо?{" "}
            <Link
              to="/register"
              className="font-semibold hover:underline"
              style={{ color: "var(--app-accent)" }}
            >
              Зарегистрироваться заново
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
