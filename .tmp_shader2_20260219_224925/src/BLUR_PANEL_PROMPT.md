# Glass Morphism Blur Panel - AI Prompt Guide

## Prompt for Creating a Glass Morphism Blur Panel (Like in the Screenshot)

### English Version:

```
Create a circular glass morphism panel with the following specifications:

Design Elements:
- Circular shape with smooth edges
- Frosted glass effect using backdrop-blur (strong blur, 3xl or higher)
- Semi-transparent dark background (black with 20-30% opacity)
- Subtle white border with low opacity (10-20%)
- Soft shadow for depth (shadow-2xl or custom box-shadow)

Content Layout:
- Large time display in the center (60-72px font size)
  - Format: HH:MM:SS AM/PM
  - Light font weight (300-400)
  - Wide letter spacing
  - White text with 90% opacity
  
- Date display below the time (18-24px font size)
  - Format: "Weekday, Month Day" (e.g., "Thursday, February 19")
  - Light font weight (300)
  - Wide letter spacing
  - White text with 60% opacity
  
Styling Properties (Tailwind CSS):
- backdrop-blur-3xl (or backdrop-blur-[80px] for stronger effect)
- bg-black/20
- border border-white/10
- shadow-2xl
- rounded-full
- Smooth animations on appearance (fade in + scale up)

Technical Requirements:
- Real-time clock updates every second
- Smooth transitions and animations
- Responsive sizing based on parent container
- Centered positioning (absolute positioning with transform centering)
- High z-index to appear above background elements
- Pointer-events: none to allow clicks to pass through (if needed)

Advanced Effects:
- Subtle gradient overlay (optional)
- Glow effect around the border (optional)
- Pulsing animation on seconds change (optional)
```

### Russian Version (Русская версия):

```
Создай круглую панель с эффектом матового стекла (glass morphism) со следующими характеристиками:

Элементы дизайна:
- Круглая форма с гладкими краями
- Эффект матового стекла с использованием backdrop-blur (сильное размытие, 3xl или выше)
- Полупрозрачный темный фон (черный с прозрачностью 20-30%)
- Тонкая белая рамка с низкой прозрачностью (10-20%)
- Мягкая тень для глубины (shadow-2xl или пользовательская box-shadow)

Расположение контента:
- Крупное отображение времени в центре (размер шрифта 60-72px)
  - Формат: HH:MM:SS AM/PM
  - Легкий вес шрифта (300-400)
  - Широкий межбуквенный интервал
  - Белый текст с прозрачностью 90%
  
- Отображение даты под временем (размер шрифта 18-24px)
  - Формат: "День недели, Месяц Число" (например, "Четверг, Февраль 19")
  - Легкий вес шрифта (300)
  - Широкий межбуквенный интервал
  - Белый текст с прозрачностью 60%
  
Свойства стилизации (Tailwind CSS):
- backdrop-blur-3xl (или backdrop-blur-[80px] для более сильного эффекта)
- bg-black/20
- border border-white/10
- shadow-2xl
- rounded-full
- Плавные анимации при появлении (fade in + scale up)

Технические требования:
- Обновление часов в реальном времени каждую секунду
- Плавные переходы и анимации
- Адаптивный размер в зависимости от родительского контейнера
- Центрированное позиционирование (absolute positioning с transform centering)
- Высокий z-index для отображения поверх фоновых элементов
- pointer-events: none для пропуска кликов сквозь панель (если необходимо)

Дополнительные эффекты (опционально):
- Тонкий градиентный оверлей
- Эффект свечения вокруг границы
- Пульсирующая анимация при смене секунд
```

## Implementation Example (React + Tailwind CSS):

```tsx
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export const ClockDisplay = ({ size }: { size: number }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <motion.div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
      style={{ width: size * 0.7, height: size * 0.7 }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8 }}
    >
      <div className="w-full h-full flex flex-col items-center justify-center rounded-full backdrop-blur-3xl bg-black/20 border border-white/10 shadow-2xl">
        <div className="text-6xl font-light tracking-wider text-white/90">
          {formatTime(time)}
        </div>
        <div className="mt-4 text-lg font-light tracking-wide text-white/60">
          {formatDate(time)}
        </div>
      </div>
    </motion.div>
  );
};
```

## Key CSS Properties Explained:

1. **backdrop-blur-3xl**: Creates a strong blur effect on elements behind the panel
2. **bg-black/20**: Semi-transparent black background (20% opacity)
3. **border-white/10**: Very subtle white border (10% opacity)
4. **shadow-2xl**: Large, soft shadow for depth
5. **rounded-full**: Makes the element perfectly circular
6. **font-light**: Light font weight (300) for elegant appearance
7. **tracking-wider/wide**: Increased letter spacing for better readability

## Tips for Customization:

- Adjust blur strength: Use `backdrop-blur-[40px]` to `backdrop-blur-[100px]` for custom blur amounts
- Change opacity: Modify `/20` to `/10`, `/30`, etc., for different transparency levels
- Add glow: Include `shadow-[0_0_40px_rgba(255,255,255,0.1)]` for a subtle glow effect
- Gradient overlay: Add `bg-gradient-to-br from-white/5 to-transparent` inside the panel
