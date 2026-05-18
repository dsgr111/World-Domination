import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { useState } from "react";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const existingUser = localStorage.getItem('user');
    if (!existingUser) {
      localStorage.setItem('user', JSON.stringify({
        username: email.split('@')[0],
        email,
        avatar: '👑'
      }));
    }
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
            <h1 className="text-2xl font-bold text-white mb-1">Вход</h1>
            <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              Войдите в свой аккаунт
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
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
                placeholder="Введите пароль"
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
              <div className="text-right mt-2">
                <button 
                  type="button"
                  className="text-xs hover:underline"
                  style={{ color: 'rgba(255, 255, 255, 0.5)' }}
                >
                  Забыли пароль?
                </button>
              </div>
            </div>

            {/* Кнопка входа */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              className="w-full rounded-[10px] h-[44px] text-sm font-bold text-white transition-all"
              style={{ background: '#00bcd4' }}
            >
              Войти
            </motion.button>
          </form>

          {/* Ссылка на регистрацию */}
          <p className="text-center mt-4 text-sm" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
            Нет аккаунта?{' '}
            <Link to="/register" className="font-semibold hover:underline" style={{ color: '#00bcd4' }}>
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
