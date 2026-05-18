import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";

const COUNTRIES = [
  { code: 'RU', name: 'Россия', flag: '🇷🇺' },
  { code: 'US', name: 'США', flag: '🇺🇸' },
  { code: 'CN', name: 'Китай', flag: '🇨🇳' },
  { code: 'GB', name: 'Великобритания', flag: '🇬🇧' },
  { code: 'FR', name: 'Франция', flag: '🇫🇷' },
  { code: 'DE', name: 'Германия', flag: '🇩🇪' },
  { code: 'JP', name: 'Япония', flag: '🇯🇵' },
  { code: 'IT', name: 'Италия', flag: '🇮🇹' },
  { code: 'BR', name: 'Бразилия', flag: '🇧🇷' },
  { code: 'IN', name: 'Индия', flag: '🇮🇳' },
  { code: 'CA', name: 'Канада', flag: '🇨🇦' },
  { code: 'AU', name: 'Австралия', flag: '🇦🇺' },
];

interface Game {
  id: string;
  name: string;
  host: string;
  players: number;
  maxPlayers: number;
  hasPassword: boolean;
  status: 'open' | 'playing';
}

interface Player {
  username: string;
  avatar: string;
  country?: string;
}

interface ChatMessage {
  player: string;
  avatar: string;
  text: string;
}

const MOCK_GAMES: Game[] = [
  { id: 'ABCD123', name: 'Война за Европу', host: 'Игрок1', players: 2, maxPlayers: 6, hasPassword: true, status: 'open' },
  { id: 'EFGH456', name: 'Битва Империй', host: 'Игрок2', players: 5, maxPlayers: 6, hasPassword: false, status: 'playing' },
  { id: 'IJKL789', name: 'Мировая война', host: 'Игрок3', players: 1, maxPlayers: 4, hasPassword: true, status: 'open' },
];

const MOCK_CHAT: ChatMessage[] = [
  { player: 'Игрок1', avatar: '👑', text: 'Кто хочет сыграть?' },
  { player: 'Игрок2', avatar: '⚔️', text: 'Я готов!' },
  { player: 'Игрок3', avatar: '🛡️', text: 'Давайте с миром начнем!' },
];

export function Lobby() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ username: string; avatar: string } | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedGameForJoin, setSelectedGameForJoin] = useState<Game | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [currentLobby, setCurrentLobby] = useState<Game | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [newGameName, setNewGameName] = useState('');
  const [newGamePassword, setNewGamePassword] = useState('');
  const [newGameRegion, setNewGameRegion] = useState('6');
  const [newGameRounds, setNewGameRounds] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(MOCK_CHAT);
  const [newMessage, setNewMessage] = useState('');
  
  const [lobbyPlayers] = useState<Player[]>([
    { username: 'Игрок1', avatar: '👑', country: 'Россия' },
    { username: 'Игрок2', avatar: '⚔️' },
    { username: 'Вы', avatar: '⭐' },
  ]);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  const handleCreateGame = (e: React.FormEvent) => {
    e.preventDefault();
    const newGame: Game = {
      id: Math.random().toString(36).substr(2, 7).toUpperCase(),
      name: newGameName,
      host: user?.username || 'Вы',
      players: 1,
      maxPlayers: 6,
      hasPassword: !!newGamePassword,
      status: 'open'
    };
    setCurrentLobby(newGame);
    setShowCreateForm(false);
    setNewGameName('');
    setNewGamePassword('');
  };

  const handleJoinGame = (game: Game) => {
    if (game.hasPassword) {
      setSelectedGameForJoin(game);
      setShowPasswordModal(true);
    } else {
      setCurrentLobby(game);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedGameForJoin) {
      setCurrentLobby(selectedGameForJoin);
      setShowPasswordModal(false);
      setPasswordInput('');
      setSelectedGameForJoin(null);
    }
  };

  const handleStartGame = () => {
    if (selectedCountry) {
      localStorage.setItem('selectedCountry', selectedCountry);
      navigate('/game');
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && user) {
      setChatMessages([...chatMessages, {
        player: user.username,
        avatar: user.avatar,
        text: newMessage
      }]);
      setNewMessage('');
    }
  };

  const takenCountries = lobbyPlayers.filter(p => p.country).map(p => p.country);

  return (
    <div className="min-h-screen flex flex-col" 
         style={{ background: 'linear-gradient(135deg, #0a1628 0%, #1a2332 50%, #0f1a2e 100%)' }}>
      
      {/* HEADER */}
      <header className="h-16 px-6 flex items-center justify-between border-b"
              style={{ 
                background: '#0d1621',
                borderColor: 'rgba(255, 255, 255, 0.1)'
              }}>
        <div className="flex items-center gap-2">
          <span className="text-xl">🌍</span>
          <span className="text-lg font-bold text-white">Мировое Господство</span>
        </div>
        
        {user && (
          <button
            onClick={handleLogout}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
            style={{ background: 'rgba(255, 255, 255, 0.1)' }}
          >
            <span className="text-xl">{user.avatar}</span>
          </button>
        )}
      </header>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ЛЕВАЯ ПАНЕЛЬ */}
        <div className="w-[400px] p-6 custom-scrollbar overflow-y-auto"
             style={{ 
               background: '#0d1621',
               borderRight: '1px solid rgba(255, 255, 255, 0.1)'
             }}>
          
          {!currentLobby ? (
            <>
              {/* Кнопки создать и ID */}
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="flex-1 rounded-[10px] h-[44px] font-bold text-white text-sm transition-all hover:opacity-90"
                  style={{ background: '#10b981' }}
                >
                  ➕ Создать
                </button>
                <button
                  className="flex-1 rounded-[10px] h-[44px] font-bold text-white text-sm transition-all hover:opacity-90"
                  style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                >
                  🆔 Ты ID
                </button>
              </div>

              {/* Форма создания игры */}
              <AnimatePresence>
                {showCreateForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-6"
                  >
                    <div className="rounded-[12px] p-5"
                         style={{ background: '#1e2a3a', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <h3 className="text-lg font-bold text-white mb-4">Новая игра</h3>
                      <form onSubmit={handleCreateGame} className="space-y-3">
                        <input
                          type="text"
                          placeholder="Введите название"
                          value={newGameName}
                          onChange={(e) => setNewGameName(e.target.value)}
                          required
                          className="w-full rounded-[8px] p-3 text-white text-sm"
                          style={{
                            background: '#293749',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            outline: 'none'
                          }}
                        />
                        <input
                          type="number"
                          placeholder="6"
                          value={newGameRegion}
                          onChange={(e) => setNewGameRegion(e.target.value)}
                          className="w-full rounded-[8px] p-3 text-white text-sm"
                          style={{
                            background: '#293749',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            outline: 'none'
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Раунды"
                          value={newGameRounds}
                          onChange={(e) => setNewGameRounds(e.target.value)}
                          className="w-full rounded-[8px] p-3 text-white text-sm"
                          style={{
                            background: '#293749',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            outline: 'none'
                          }}
                        />
                        <input
                          type="password"
                          placeholder="Пароль необязательно"
                          value={newGamePassword}
                          onChange={(e) => setNewGamePassword(e.target.value)}
                          className="w-full rounded-[8px] p-3 text-white text-sm"
                          style={{
                            background: '#293749',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            outline: 'none'
                          }}
                        />
                        <div className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                          Автоматически будет создан уникальный ID.
                        </div>
                        <div className="flex gap-2">
                          <button 
                            type="submit" 
                            className="flex-1 rounded-[8px] py-2 font-bold text-white text-sm"
                            style={{ background: '#10b981' }}
                          >
                            Создать
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCreateForm(false)}
                            className="rounded-[8px] px-4 py-2 font-bold text-white text-sm"
                            style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                          >
                            Отмена
                          </button>
                        </div>
                      </form>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Список игр */}
              <div>
                <h3 className="text-sm font-bold mb-3" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                  Доступные игры
                </h3>
                <div className="space-y-2">
                  {MOCK_GAMES.map((game) => (
                    <motion.div
                      key={game.id}
                      whileHover={{ x: 3 }}
                      onClick={() => handleJoinGame(game)}
                      className="rounded-[10px] p-4 cursor-pointer transition-all"
                      style={{
                        background: '#1e2a3a',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-white text-sm">{game.name}</span>
                        <span 
                          className="text-xs px-2 py-1 rounded"
                          style={{ 
                            background: game.status === 'playing' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                            color: game.status === 'playing' ? '#fbbf24' : '#10b981'
                          }}
                        >
                          {game.status === 'playing' ? 'Играют' : 'Открыто'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                        <span>ID: {game.id}</span>
                        <div className="flex items-center gap-2">
                          <span>👥 {game.players}/{game.maxPlayers} игроков</span>
                          {game.hasPassword && <span>🔒</span>}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            // Информация о текущем лобби
            <div>
              <button
                onClick={() => setCurrentLobby(null)}
                className="text-sm mb-4 hover:underline"
                style={{ color: '#00bcd4' }}
              >
                ← Назад к списку игр
              </button>
              
              <div className="rounded-[12px] p-5 mb-4"
                   style={{ background: '#1e2a3a', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <h2 className="text-xl font-bold text-center mb-2" style={{ color: '#00bcd4' }}>
                  Лобби: {currentLobby.name}
                </h2>
                <div className="text-center text-sm mb-4" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                  ID лобби: {currentLobby.id}
                </div>

                {/* Список игроков */}
                <div className="mb-6">
                  <h3 className="text-sm font-bold mb-3" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                    Игроки ({lobbyPlayers.length}/{currentLobby.maxPlayers})
                  </h3>
                  <div className="space-y-2">
                    {lobbyPlayers.map((player, index) => (
                      <div
                        key={index}
                        className="rounded-[8px] p-3 flex items-center justify-between"
                        style={{ background: '#293749' }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{player.avatar}</span>
                          <span className="text-sm text-white">{player.username}</span>
                        </div>
                        <span className="text-xs" style={{ color: player.country ? '#10b981' : 'rgba(255, 255, 255, 0.5)' }}>
                          {player.country || 'Выбирает...'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Выбор страны */}
                <div className="mb-6">
                  <h3 className="text-sm font-bold mb-3" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                    Выбери свою страну:
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {COUNTRIES.map((country) => {
                      const isTaken = takenCountries.includes(country.name);
                      const isSelected = selectedCountry === country.name;
                      
                      return (
                        <motion.button
                          key={country.code}
                          whileHover={!isTaken ? { scale: 1.05 } : {}}
                          whileTap={!isTaken ? { scale: 0.95 } : {}}
                          onClick={() => !isTaken && setSelectedCountry(country.name)}
                          disabled={isTaken}
                          className="aspect-square rounded-[10px] flex flex-col items-center justify-center text-center p-2 transition-all"
                          style={{
                            background: isSelected ? '#00bcd4' : '#293749',
                            border: isSelected ? '2px solid #00bcd4' : '1px solid rgba(255, 255, 255, 0.1)',
                            boxShadow: isSelected ? '0 0 20px rgba(0, 188, 212, 0.5)' : 'none',
                            opacity: isTaken ? 0.4 : 1,
                            cursor: isTaken ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <div className="text-2xl mb-1">{country.flag}</div>
                          <div className="text-[10px] font-bold text-white">{country.code}</div>
                          <div className="text-[9px]" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                            {country.name}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Кнопки */}
                <div className="flex gap-2">
                  <button
                    onClick={handleStartGame}
                    disabled={!selectedCountry}
                    className="flex-1 rounded-[10px] h-[44px] font-bold text-white text-sm transition-all"
                    style={{
                      background: selectedCountry ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                      opacity: selectedCountry ? 1 : 0.5,
                      cursor: selectedCountry ? 'pointer' : 'not-allowed'
                    }}
                  >
                    🚀 Начать игру
                  </button>
                  <button
                    onClick={() => setCurrentLobby(null)}
                    className="rounded-[10px] px-4 h-[44px] font-bold text-white text-sm"
                    style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  >
                    Выйти из лобби
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ПРАВАЯ ПАНЕЛЬ - ЧАТ */}
        <div className="flex-1 flex flex-col">
          <div className="p-6">
            <h3 className="text-lg font-bold text-white mb-4">Общий чат</h3>
            
            <div className="rounded-[12px] overflow-hidden"
                 style={{ background: '#1e2a3a', border: '1px solid rgba(255, 255, 255, 0.1)', height: 'calc(100vh - 200px)' }}>
              
              {/* Сообщения */}
              <div className="p-4 h-[calc(100%-80px)] custom-scrollbar overflow-y-auto">
                <div className="space-y-3">
                  {chatMessages.map((msg, index) => (
                    <div key={index} className="flex gap-3">
                      <span className="text-2xl">{msg.avatar}</span>
                      <div>
                        <div className="text-sm font-bold" style={{ color: '#00bcd4' }}>
                          {msg.player}
                        </div>
                        <div className="text-sm text-white">{msg.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Поле ввода */}
              <form onSubmit={handleSendMessage} className="p-4 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Введите сообщение..."
                    className="flex-1 rounded-[8px] p-3 text-white text-sm"
                    style={{
                      background: '#293749',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      outline: 'none'
                    }}
                  />
                  <button 
                    type="submit"
                    className="w-10 h-10 rounded-[8px] flex items-center justify-center text-white transition-all"
                    style={{ background: '#00bcd4' }}
                  >
                    ➤
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* МОДАЛЬНОЕ ОКНО ПАРОЛЯ */}
      <AnimatePresence>
        {showPasswordModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 px-4"
            style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowPasswordModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-[16px] p-6 w-full max-w-[400px]"
              style={{
                background: '#1e2a3a',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Защищённое лобби</h3>
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                  style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                >
                  ✕
                </button>
              </div>
              
              <p className="text-sm mb-4" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                Введите пароль для входа
              </p>

              <form onSubmit={handlePasswordSubmit}>
                <input
                  type="password"
                  placeholder="Пароль"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-[10px] p-3 text-white text-sm mb-4"
                  style={{
                    background: '#293749',
                    border: '2px solid #00bcd4',
                    outline: 'none'
                  }}
                />
                
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 rounded-[10px] h-[44px] font-bold text-white text-sm"
                    style={{ background: '#00bcd4' }}
                  >
                    Войти
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="rounded-[10px] px-4 h-[44px] font-bold text-white text-sm"
                    style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
