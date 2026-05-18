import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

interface CountryResult {
  flag: string;
  name: string;
  player: string;
  avatar: string;
  cities: number;
  score: number;
}

const MOCK_RESULTS: CountryResult[] = [
  { flag: '🇷🇺', name: 'Россия', player: 'Вы', avatar: '👑', cities: 4, score: 2450 },
  { flag: '🇺🇸', name: 'США', player: 'Игрок2', avatar: '⚔️', cities: 3, score: 2100 },
  { flag: '🇨🇳', name: 'Китай', player: 'Игрок3', avatar: '🛡️', cities: 2, score: 1800 },
  { flag: '🇬🇧', name: 'Великобритания', player: 'Игрок4', avatar: '⭐', cities: 0, score: 500 },
];

export function Victory() {
  const navigate = useNavigate();
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    setTimeout(() => setShowConfetti(false), 5000);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-4"
         style={{
           background: 'linear-gradient(135deg, #0a1628 0%, #1a2332 50%, #0f1a2e 100%)'
         }}>
      
      {/* Конфетти эффект */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(50)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ 
                x: Math.random() * window.innerWidth, 
                y: -20,
                rotate: 0 
              }}
              animate={{ 
                y: window.innerHeight + 20,
                rotate: 360,
                x: Math.random() * window.innerWidth
              }}
              transition={{ 
                duration: 3 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 2
              }}
              className="absolute text-2xl"
            >
              {['🎉', '🎊', '✨', '⭐', '🏆'][Math.floor(Math.random() * 5)]}
            </motion.div>
          ))}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-[700px] relative z-10"
      >
        <div className="rounded-[20px] p-10"
             style={{
               background: '#1e2a3a',
               border: '1px solid rgba(255, 255, 255, 0.1)',
               boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
             }}>
          
          {/* Заголовок победы */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center mb-8"
          >
            <div className="text-7xl mb-4">🏆</div>
            <h1 className="text-4xl font-bold mb-2" style={{ color: '#fbbf24' }}>
              ПОБЕДА!
            </h1>
            <p className="text-lg" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              Поздравляем с завоеванием мира!
            </p>
          </motion.div>

          {/* Информация победителя */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="rounded-[15px] p-6 mb-8 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(245, 158, 11, 0.2) 100%)',
              border: '2px solid #fbbf24'
            }}
          >
            <div className="flex items-center justify-center gap-4 mb-3">
              <span className="text-5xl">{MOCK_RESULTS[0].flag}</span>
              <div className="text-left">
                <div className="text-2xl font-bold text-white">{MOCK_RESULTS[0].name}</div>
                <div className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                  {MOCK_RESULTS[0].avatar} {MOCK_RESULTS[0].player}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-8 mt-4">
              <div>
                <div className="text-3xl font-bold" style={{ color: '#fbbf24' }}>
                  {MOCK_RESULTS[0].score}
                </div>
                <div className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                  Очков
                </div>
              </div>
              <div className="w-px h-12" style={{ background: 'rgba(255, 255, 255, 0.2)' }} />
              <div>
                <div className="text-3xl font-bold" style={{ color: '#fbbf24' }}>
                  {MOCK_RESULTS[0].cities}
                </div>
                <div className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                  Городов
                </div>
              </div>
            </div>
          </motion.div>

          {/* Итоговая таблица */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mb-6"
          >
            <h3 className="text-lg font-bold text-white mb-4">Итоговые результаты</h3>
            <div className="space-y-2">
              {MOCK_RESULTS.map((result, index) => (
                <motion.div
                  key={index}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.8 + index * 0.1 }}
                  className="rounded-[12px] p-4 flex items-center justify-between"
                  style={{
                    background: index === 0 
                      ? 'rgba(251, 191, 36, 0.1)' 
                      : '#293749',
                    border: index === 0 
                      ? '1px solid rgba(251, 191, 36, 0.3)' 
                      : '1px solid rgba(255, 255, 255, 0.1)'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold"
                      style={{
                        background: index === 0 ? '#fbbf24' : index === 1 ? '#9ca3af' : index === 2 ? '#d97706' : 'rgba(255, 255, 255, 0.1)',
                        color: index < 3 ? '#000' : '#fff'
                      }}
                    >
                      {index + 1}
                    </div>
                    <span className="text-3xl">{result.flag}</span>
                    <div>
                      <div className="text-sm font-bold text-white">{result.name}</div>
                      <div className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                        {result.avatar} {result.player}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold" style={{ color: '#00bcd4' }}>
                      {result.score}
                    </div>
                    <div className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                      Городов: {result.cities}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Кнопки */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="flex gap-3"
          >
            <button
              onClick={() => navigate('/lobby')}
              className="flex-1 rounded-[10px] h-[50px] font-bold text-white transition-all hover:opacity-90"
              style={{ background: '#10b981' }}
            >
              Новая игра
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex-1 rounded-[10px] h-[50px] font-bold text-white transition-all hover:opacity-90"
              style={{ background: 'rgba(255, 255, 255, 0.1)' }}
            >
              Главное меню
            </button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
