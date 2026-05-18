import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { useState } from "react";

// Иконки аватаров как на скрине
const AVATARS = ['👑', '🏆', '⚔️', '🛡️', '🏰', '🎯', '⭐', '🔱'];

export function Register() {
  const navigate = useNavigate();
  const [selectedAvatar, setSelectedAvatar] = useState<string>('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('user', JSON.stringify({
      username,
      email,
      avatar: selectedAvatar || AVATARS[0]
    }));
    navigate('/lobby');
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-4"
         style={{
           background: 'linear-gradient(135deg, #0a1628 0%, #1a2332 50%, #0f1a2e 100%)'
         }}>
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-[400px]"
      >
        <div className="rounded-[16px] p-8"
             style={{
               background: '#1e2a3a',
               border: '1px solid rgba(255, 255, 255, 0.1)'
             }}>
          
          {/* Заголовок */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white mb-1">Регистрация</h1>
            <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              Создайте новый аккаунт для игры
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Выбор аватара */}
            <div>
              <label className="text-sm font-semibold text-white mb-3 block">
                Выберите аватар
              </label>
              <div className="grid grid-cols-4 gap-2">
                {AVATARS.map((avatar) => (
                  <motion.button
                    key={avatar}
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedAvatar(avatar)}
                    className="aspect-square rounded-[10px] flex items-center justify-center text-2xl transition-all"
                    style={{
                      background: selectedAvatar === avatar ? '#00bcd4' : '#293749',
                      border: selectedAvatar === avatar ? '2px solid #00bcd4' : '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: selectedAvatar === avatar ? '0 0 20px rgba(0, 188, 212, 0.5)' : 'none'
                    }}
                  >
                    {avatar}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Имя пользователя */}
            <div>
              <label className="text-sm font-semibold text-white mb-2 block">
                Имя пользователя
              </label>
              <input
                type="text"
                placeholder="Введите имя"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full rounded-[10px] p-3 text-white text-sm"
                style={{
                  background: '#293749',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  outline: 'none'
                }}
              />
            </div>

            {/* Email */}
            <div>
              <label className="text-sm font-semibold text-white mb-2 block">
                Email
              </label>
              <input
                type="email"
                placeholder="name@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-[10px] p-3 text-white text-sm"
                style={{
                  background: '#293749',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  outline: 'none'
                }}
              />
            </div>

            {/* Пароль */}
            <div>
              <label className="text-sm font-semibold text-white mb-2 block">
                Пароль
              </label>
              <input
                type="password"
                placeholder="Придумайте пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-[10px] p-3 text-white text-sm"
                style={{
                  background: '#293749',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  outline: 'none'
                }}
              />
            </div>

            {/* Кнопка регистрации */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              className="w-full rounded-[10px] h-[44px] text-sm font-bold text-white mt-6 transition-all"
              style={{ background: '#00bcd4' }}
            >
              Зарегистрироваться
            </motion.button>
          </form>

          {/* Ссылка на вход */}
          <p className="text-center mt-4 text-sm" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
            Уже есть аккаунт?{' '}
            <Link to="/login" className="font-semibold hover:underline" style={{ color: '#00bcd4' }}>
              Войти
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
