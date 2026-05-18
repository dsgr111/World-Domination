import { Link } from "react-router";
import { motion } from "motion/react";

export function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
         style={{
           background: 'linear-gradient(135deg, #0a1628 0%, #1a2332 50%, #0f1a2e 100%)'
         }}>
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 px-4"
      >
        <div className="rounded-[16px] p-8 w-full max-w-[380px]"
             style={{
               background: '#1e2a3a',
               border: '1px solid rgba(255, 255, 255, 0.1)'
             }}>
          
          {/* Логотип и заголовок */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-2xl">🌍</span>
              <h1 className="text-2xl font-bold text-white">
                Мировое<br/>Господство
              </h1>
            </div>
            <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              Стратегическая многопользовательская игра
            </p>
          </div>

          {/* Кнопки */}
          <div className="flex gap-3">
            <Link to="/login" className="flex-1">
              <button 
                className="w-full rounded-[10px] h-[44px] font-bold text-white text-sm transition-all hover:opacity-90"
                style={{ background: '#00bcd4' }}
              >
                Войти
              </button>
            </Link>
            <Link to="/register" className="flex-1">
              <button 
                className="w-full rounded-[10px] h-[44px] font-bold text-white text-sm transition-all hover:opacity-90"
                style={{ background: '#10b981' }}
              >
                Регистрация
              </button>
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
