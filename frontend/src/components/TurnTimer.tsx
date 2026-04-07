import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { cn } from '@/lib/utils';

// Total seconds per turn in timed mode
const TIMER_MAX = 30;
const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function timerColor(seconds: number): string {
  if (seconds > 15) return '#14b8a6'; // brand (green-teal)
  if (seconds > 10) return '#f59e0b'; // amber
  return '#E24B4A';                   // red
}

export default function TurnTimer() {
  const matchState = useGameStore((s) => s.matchState);
  const isMyTurn = useGameStore((s) => s.isMyTurn);

  // Only shown for timed mode
  if (!matchState || matchState.mode !== 'timed' || matchState.turnTimeLeft < 0) {
    return null;
  }

  const secondsLeft = Math.max(0, matchState.turnTimeLeft);
  const fraction = secondsLeft / TIMER_MAX;
  const dashOffset = CIRCUMFERENCE * (1 - fraction);
  const color = timerColor(secondsLeft);

  return (
    <motion.div
      id="turn-timer"
      className="flex flex-col items-center gap-2"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Ring */}
      <div className="relative w-24 h-24">
        <svg
          className="w-24 h-24 -rotate-90"
          viewBox="0 0 100 100"
          aria-label={`${secondsLeft} seconds remaining`}
        >
          {/* Track */}
          <circle
            cx="50" cy="50" r={RADIUS}
            fill="none"
            stroke="rgba(51,65,85,0.5)"
            strokeWidth="7"
          />
          {/* Progress */}
          <motion.circle
            cx="50" cy="50" r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{
              transition: 'stroke-dashoffset 0.9s linear, stroke 0.5s ease',
              filter: secondsLeft <= 5 ? `drop-shadow(0 0 6px ${color})` : 'none',
            }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={secondsLeft}
              className={cn(
                'font-mono font-bold text-2xl',
                secondsLeft <= 5
                  ? 'text-game-x animate-pulse'
                  : secondsLeft <= 10
                    ? 'text-yellow-400'
                    : 'text-brand-400',
              )}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              transition={{ duration: 0.15 }}
            >
              {secondsLeft}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      {/* Label */}
      <span className={cn(
        'text-xs font-semibold uppercase tracking-wider',
        isMyTurn ? 'text-brand-400' : 'text-game-bg-muted',
      )}>
        {isMyTurn ? 'Your time' : 'Their time'}
      </span>
    </motion.div>
  );
}
