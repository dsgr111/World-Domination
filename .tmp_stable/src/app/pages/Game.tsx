import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useRef } from "react";

interface City {
  name: string;
  level: number;
  income: number;
  shields: number;
  destroyed: boolean;
}

interface Message {
  player: string;
  avatar: string;
  flag: string;
  country: string;
  text: string;
  destroyed?: boolean;
}

interface Country {
  flag: string;
  name: string;
  player: string;
  cities: number;
  totalCities: number;
  destroyed: boolean;
}

const MOCK_CITIES: City[] = [
  { name: 'Москва', level: 5, income: 130, shields: 0, destroyed: false },
  { name: 'Санкт-Петербург', level: 4, income: 110, shields: 1, destroyed: false },
  { name: 'Новосибирск', level: 3, income: 90, shields: 0, destroyed: false },
  { name: 'Екатеринбург', level: 3, income: 85, shields: 0, destroyed: false },
];

const MOCK_COUNTRIES: Country[] = [
  { flag: '🇺🇸', name: 'США', player: 'Игрок2', cities: 4, totalCities: 4, destroyed: false },
  { flag: '🇨🇳', name: 'Китай', player: 'Игрок3', cities: 3, totalCities: 4, destroyed: false },
  { flag: '🇬🇧', name: 'Великобритания', player: 'Игрок4', cities: 0, totalCities: 3, destroyed: true },
];

const MOCK_MESSAGES: Message[] = [
  { player: 'Игрок2', avatar: '😎', flag: '🇺🇸', country: 'США', text: 'Давайте заключим союз!' },
  { player: 'Игрок3', avatar: '🤖', flag: '🇨🇳', country: 'Китай', text: 'Я согласен' },
  { player: 'Игрок4', avatar: '👑', flag: '🇬🇧', country: 'Великобритания', text: 'Помогите!', destroyed: true },
];

export function Game() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ username: string; avatar: string } | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [phase, setPhase] = useState<'discussion' | 'decisions'>('discussion');
  const [round, setRound] = useState(1);
  const [timer, setTimer] = useState(120);
  const [budget, setBudget] = useState(1000);
  const [nuclearWeapons, setNuclearWeapons] = useState(0);
  const [cities, setCities] = useState<City[]>(MOCK_CITIES);
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES);
  const [newMessage, setNewMessage] = useState('');
  const [hasSanctions, setHasSanctions] = useState(false);
  const [lifeQuality, setLifeQuality] = useState(54);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    const country = localStorage.getItem('selectedCountry');
    if (userData) setUser(JSON.parse(userData));
    if (country) setSelectedCountry(country);

    // Таймер
    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          // Смена фазы
          setPhase(current => current === 'discussion' ? 'decisions' : 'discussion');
          return 120;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    
    const message: Message = {
      player: user.username,
      avatar: user.avatar,
      flag: '🇷🇺',
      country: selectedCountry,
      text: newMessage
    };
    
    setMessages([...messages, message]);
    setNewMessage('');
  };

  const handleUpgradeCity = (cityName: string) => {
    const city = cities.find(c => c.name === cityName);
    if (city && budget >= 90) {
      setBudget(budget - 90);
      setCities(cities.map(c => 
        c.name === cityName ? { ...c, level: c.level + 1, income: c.income + 20 } : c
      ));
    }
  };

  const handleAddShield = (cityName: string) => {
    if (budget >= 100) {
      setBudget(budget - 100);
      setCities(cities.map(c => 
        c.name === cityName ? { ...c, shields: c.shields + 1 } : c
      ));
    }
  };

  const handleDevelopNuclear = () => {
    if (budget >= 200) {
      setBudget(budget - 200);
      setNuclearWeapons(nuclearWeapons + 1);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0d1621' }}>
      {/* HEADER ИГРЫ */}
      <header className="h-16 px-6 flex items-center justify-between border-b"
              style={{
                background: '#0a1016',
                borderColor: 'rgba(255, 255, 255, 0.1)'
              }}>
        {/* Левая часть */}
        <div className="flex items-center gap-4">
          <div className="text-lg font-bold text-white">
            МИРОВОЕ ГОСПОДСТВО
          </div>
          <div className="px-3 py-1 rounded-[6px] text-xs font-bold" style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'rgba(255, 255, 255, 0.7)' }}>
            1 РАУНД
          </div>
        </div>

        {/* Центр */}
        <div className="text-center">
          <div className="text-xl font-bold mb-1" style={{ color: '#00bcd4' }}>
            {phase === 'discussion' ? 'ОБСУЖДЕНИЕ' : 'ПРИНЯТИЕ РЕШЕНИЙ'}
          </div>
          <div className={`text-sm font-bold ${timer < 30 ? 'animate-pulse' : ''}`}
               style={{ color: timer < 30 ? '#ef4444' : 'rgba(255, 255, 255, 0.7)' }}>
            ⏱️ {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')} сек
          </div>
        </div>

        {/* Правая часть */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Доступный бюджет:</div>
            <div className="text-lg font-bold" style={{ color: '#00bcd4' }}>{budget} $</div>
          </div>
          <div className="text-right">
            <div className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Ядерное оружие:</div>
            <div className="text-lg font-bold" style={{ color: '#fb923c' }}>{nuclearWeapons}</div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT - 3 колонки */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* ЛЕВАЯ ПАНЕЛЬ - Моя страна */}
        <div className="w-[350px] custom-scrollbar overflow-y-auto"
             style={{
               background: '#1a1f26',
               borderRight: '1px solid rgba(255, 255, 255, 0.05)'
             }}>
          
          {/* Заголовок страны */}
          <div className="p-6 text-center"
               style={{
                 background: 'rgba(0, 217, 255, 0.1)',
                 borderBottom: '2px solid rgba(0, 217, 255, 0.3)'
               }}>
            <div className="text-6xl mb-2">🇷🇺</div>
            <div className="text-2xl font-bold text-white">{selectedCountry || 'Россия'}</div>
          </div>

          {/* Статистика */}
          <div className="p-6">
            <div className="mb-4">
              <div className="text-sm mb-2" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                Средний уровень жизни в стране
              </div>
              <div className="relative h-8 rounded-full overflow-hidden"
                   style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${lifeQuality}%` }}
                  transition={{ duration: 1 }}
                  className="h-full"
                  style={{
                    background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                    boxShadow: '0 0 10px rgba(16, 185, 129, 0.5)'
                  }}
                />
              </div>
              <div className="text-right mt-1 text-xl font-bold" style={{ color: '#10b981' }}>
                {lifeQuality}%
              </div>
            </div>

            {/* Список городов */}
            <div className="space-y-3 mb-6">
              {cities.map((city) => (
                <div
                  key={city.name}
                  className={`rounded-[12px] p-4 ${city.destroyed ? 'animate-shake' : ''}`}
                  style={{
                    background: city.destroyed ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                    borderLeft: `4px solid ${city.destroyed ? '#ef4444' : '#00d9ff'}`,
                    filter: city.destroyed ? 'grayscale(100%)' : 'none',
                    opacity: city.destroyed ? 0.6 : 1
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white">{city.name}</span>
                    {city.destroyed && <span className="text-2xl">💥</span>}
                  </div>
                  <div className="text-sm space-y-1" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                    <div>Уровень: {city.level}/10</div>
                    <div>Доход: {city.income}$</div>
                    {city.shields > 0 && (
                      <div className="flex items-center gap-1" style={{ color: '#c084fc' }}>
                        <span>🛡️</span>
                        <span>Щиты: {city.shields}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Санкции */}
            <div className="rounded-[12px] p-4"
                 style={{
                   background: hasSanctions ? 'rgba(251, 191, 36, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                   border: `1px solid ${hasSanctions ? '#fbbf24' : '#10b981'}`
                 }}>
              <div className="font-bold mb-2" style={{ color: hasSanctions ? '#fbbf24' : '#10b981' }}>
                САНКЦИИ
              </div>
              <div className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                {hasSanctions
                  ? '⚠️ Страна США наложила на вас санкции!'
                  : 'Ни одна из стран не наложила на вас санкции'}
              </div>
            </div>
          </div>
        </div>

        {/* ЦЕНТРАЛЬНАЯ ПАНЕЛЬ - Чат или Действия */}
        <div className="flex-1 p-6 overflow-hidden">
          <AnimatePresence mode="wait">
            {phase === 'discussion' ? (
              /* ЧАТ */
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card-strong rounded-[20px] h-full flex flex-col"
              >
                {/* Сообщения */}
                <div className="flex-1 p-6 custom-scrollbar overflow-y-auto">
                  <div className="space-y-3">
                    {messages.map((msg, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: msg.destroyed ? 0.5 : 1, x: 0 }}
                        className="rounded-[12px] p-4"
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          borderLeft: '3px solid #00d9ff',
                          textDecoration: msg.destroyed ? 'line-through' : 'none'
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xl">{msg.avatar}</span>
                          <span className="text-2xl">{msg.flag}</span>
                          <span className="font-bold" style={{ color: '#00d9ff' }}>
                            {msg.country}
                          </span>
                        </div>
                        <div className="text-white ml-8">{msg.text}</div>
                      </motion.div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Поле ввода */}
                <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Введите сообщение..."
                      className="flex-1 rounded-[12px] p-3 text-white placeholder-white/40"
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        outline: 'none'
                      }}
                    />
                    <button type="submit" className="btn-primary rounded-[12px] px-8 font-bold text-white">
                      Отправить
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : (
              /* ПАНЕЛЬ ДЕЙСТВИЙ */
              <motion.div
                key="actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="custom-scrollbar overflow-y-auto h-full"
              >
                <div className="space-y-6 max-w-4xl mx-auto">
                  <h2 className="text-3xl font-bold text-center mb-8" style={{ color: '#00d9ff' }}>
                    ⚙️ Действия
                  </h2>

                  {/* Развитие городов */}
                  <div className="glass-card-strong rounded-[15px] p-6">
                    <h3 className="text-xl font-bold mb-4" style={{ color: '#10b981' }}>
                      🏙️ Развитие городов
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {cities.filter(c => !c.destroyed).map(city => (
                        <button
                          key={city.name}
                          onClick={() => handleUpgradeCity(city.name)}
                          disabled={budget < 90}
                          className="rounded-[10px] p-3 font-bold text-white transition-all"
                          style={{
                            background: budget >= 90 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(16, 185, 129, 0.5)',
                            opacity: budget >= 90 ? 1 : 0.5,
                            cursor: budget >= 90 ? 'pointer' : 'not-allowed'
                          }}
                        >
                          {city.name}: Улучшить (90$)
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Защита городов */}
                  <div className="glass-card-strong rounded-[15px] p-6">
                    <h3 className="text-xl font-bold mb-4" style={{ color: '#c084fc' }}>
                      🛡️ Защита городов
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {cities.filter(c => !c.destroyed).map(city => (
                        <button
                          key={city.name}
                          onClick={() => handleAddShield(city.name)}
                          disabled={budget < 100}
                          className="rounded-[10px] p-3 font-bold text-white transition-all"
                          style={{
                            background: budget >= 100 ? 'rgba(192, 132, 252, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(192, 132, 252, 0.5)',
                            opacity: budget >= 100 ? 1 : 0.5,
                            cursor: budget >= 100 ? 'pointer' : 'not-allowed'
                          }}
                        >
                          {city.name}: +Щит (100$)
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ядерное оружие */}
                  <div className="glass-card-strong rounded-[15px] p-6">
                    <h3 className="text-xl font-bold mb-4" style={{ color: '#fb923c' }}>
                      💣 Ядерное оружие
                    </h3>
                    <button
                      onClick={handleDevelopNuclear}
                      disabled={budget < 200}
                      className="rounded-[10px] p-3 font-bold text-white transition-all mb-3"
                      style={{
                        background: budget >= 200 ? 'rgba(251, 146, 60, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(251, 146, 60, 0.5)',
                        opacity: budget >= 200 ? 1 : 0.5,
                        cursor: budget >= 200 ? 'pointer' : 'not-allowed'
                      }}
                    >
                      Разработать ядерное оружие (200$)
                    </button>
                    <div className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                      Строится: 1, Готово: {nuclearWeapons}
                    </div>
                  </div>

                  {/* Санкции */}
                  <div className="glass-card-strong rounded-[15px] p-6">
                    <h3 className="text-xl font-bold mb-4" style={{ color: '#fbbf24' }}>
                      📜 Санкции
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      {MOCK_COUNTRIES.filter(c => !c.destroyed).map(country => (
                        <button
                          key={country.name}
                          className="rounded-[10px] p-3 font-bold text-white transition-all"
                          style={{
                            background: 'rgba(251, 191, 36, 0.2)',
                            border: '1px solid rgba(251, 191, 36, 0.5)'
                          }}
                        >
                          {country.flag} {country.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Применить решения */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="btn-success w-full rounded-[15px] h-[60px] text-xl font-bold text-white"
                  >
                    ✅ ПРИМЕНИТЬ РЕШЕНИЯ
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ПРАВАЯ ПАНЕЛЬ - Другие страны */}
        <div className="w-[350px] custom-scrollbar overflow-y-auto"
             style={{
               background: '#1a1f26',
               borderLeft: '1px solid rgba(255, 255, 255, 0.05)'
             }}>
          
          <div className="p-6">
            <h3 className="text-2xl font-bold mb-6 text-center" style={{ color: '#00d9ff' }}>
              🌍 Другие страны
            </h3>

            <div className="space-y-4">
              {MOCK_COUNTRIES.map((country) => (
                <div
                  key={country.name}
                  className="rounded-[12px] p-4"
                  style={{
                    background: country.destroyed ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                    borderLeft: `4px solid ${country.destroyed ? '#ef4444' : '#00d9ff'}`,
                    filter: country.destroyed ? 'grayscale(100%)' : 'none',
                    opacity: country.destroyed ? 0.6 : 1
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">{country.flag}</span>
                    <span className="font-bold text-white text-lg">{country.name}</span>
                    {country.destroyed && <span className="text-2xl">💀</span>}
                  </div>
                  <div className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                    {country.player} | Города: {country.cities}/{country.totalCities}
                  </div>
                </div>
              ))}
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn-primary w-full rounded-[12px] h-[50px] font-bold text-white mt-6"
            >
              📊 Статистика
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/victory')}
              className="w-full rounded-[12px] h-[50px] font-bold text-white mt-3"
              style={{ background: 'rgba(251, 191, 36, 0.3)', border: '1px solid #fbbf24' }}
            >
              👑 Завершить игру
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}