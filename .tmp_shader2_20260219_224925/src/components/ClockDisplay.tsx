import { useState, useEffect } from "react";
import { motion } from "motion/react";

interface ClockDisplayProps {
  size: number;
}

export const ClockDisplay = ({ size }: ClockDisplayProps) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Format time as HH:MM:SS AM/PM
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  // Format date as "Weekday, Month Day"
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  const displaySize = size * 0.7;

  return (
    <motion.div
      className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20"
      style={{
        width: displaySize,
        height: displaySize
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.2 }}
    >
      <div className="w-full h-full flex flex-col items-center justify-center rounded-full backdrop-blur-3xl bg-black/20 border border-white/10 shadow-2xl">
        {/* Time Display */}
        <motion.div
          className="text-6xl font-light tracking-wider text-white/90"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          {formatTime(time)}
        </motion.div>

        {/* Date Display */}
        <motion.div
          className="mt-4 text-lg font-light tracking-wide text-white/60"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          {formatDate(time)}
        </motion.div>
      </div>
    </motion.div>
  );
};
