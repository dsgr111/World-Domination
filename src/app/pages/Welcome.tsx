import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { getAuth } from "../lib/auth";
import { AppBrandLink } from "../components/AppBrandLink";

export function Welcome() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("👑");

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      navigate("/login");
      return;
    }
    setNickname(auth.user.nickname);
    setAvatar(auth.user.avatar_emoji);
  }, [navigate]);

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
        <button
          onClick={() => navigate("/profile")}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-all absolute right-6"
          style={{ background: "rgba(255, 255, 255, 0.1)" }}
        >
          <span className="text-xl">{avatar}</span>
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-5xl"
        >
        <div
          className="rounded-[20px] p-8 md:p-10"
          style={{
            background: "var(--app-surface)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
          }}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">🌍</span>
                <h1 className="text-3xl font-bold text-white">Мировое Господство</h1>
              </div>
              <div className="text-sm text-white/60">
                Добро пожаловать в стратегию глобального влияния
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{avatar}</span>
              <div>
                <div className="text-sm font-bold text-white">{nickname}</div>
                <div className="text-xs text-white/50">Лидер готов к игре</div>
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[16px] p-5"
                 style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="text-sm font-bold text-white mb-3">Краткие правила</div>
              <ul className="text-sm text-white/70 space-y-2">
                <li>Игра состоит из раундов: обсуждение → планирование → итог.</li>
                <li>В планировании ты развиваешь города, строишь щиты, переводишь деньги и готовишь ядерный арсенал.</li>
                <li>Каждый раунд начинается с вопроса по твоей стране (15 секунд на ответ).</li>
                <li>Цель — сохранить города, поднять уровень жизни и доминировать в рейтинге.</li>
              </ul>
            </div>

            <div className="rounded-[16px] p-5"
                 style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="text-sm font-bold text-white mb-3">Функционал</div>
              <ul className="text-sm text-white/70 space-y-2">
                <li>Лобби: создавай или присоединяйся по ID.</li>
                <li>Общий чат и личные сообщения по странам.</li>
                <li>Переговоры с другими лидерами.</li>
                <li>Статистика по странам и городам после раунда.</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/lobby")}
              className="rounded-[12px] h-[50px] px-10 font-bold text-white"
              style={{ background: "var(--app-success)" }}
            >
              Играть
            </motion.button>
            <div className="text-xs text-white/50">
              Нажмите, чтобы перейти к поиску лобби
            </div>
          </div>
        </div>
        </motion.div>
      </div>
    </div>
  );
}

