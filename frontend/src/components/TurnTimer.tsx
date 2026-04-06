import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { cn } from '@/lib/utils';

const FULL_DASH = 2 * Math.PI * 42; // circumference of circle with r=42
const TIMER_MAX = 30;

export default function TurnTimer() {
  const matchState = useGameStore((s) => s.matchState);
  const isMyTurn = useGameStore((s) => s.isMyTurn);

  if (!matchState || matchState.mode !== 'timed' || matchState.turnTimeLeft < 0) {
    return null;
  }

  const secondsLeft = matchState.turnTimeLeft;
  const fraction = secondsLeft / TIMER_MAX;
  const dashOffset = FULL_DASH * (1 - fraction);

  // Color transitions: brand (>15s) → yellow (5-15s) → red (<5s)
  let strokeColor = '#14b8a6'; // brand-500
  let textColor = 'text-brand-400';
  if (secondsLeft <= 5) {
    strokeColor = '#E24B4A'; // game-x
    textColor = 'text-game-x';
  } else if (secondsLeft <= 15) {
    strokeColor = '#eab308'; // yellow
    textColor = 'text-yellow-400';
  }

  return (
    <div id="turn-timer" className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg
          className="w-16 h-16 -rotate-90"
          viewBox="0 0 100 100"
        >
          {/* Background circle */}
          <circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke="rgba(51, 65, 85, 0.4)"
            strokeWidth="6"
          />
          {/* Progress circle */}
          <motion.circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke={strokeColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={FULL_DASH}
            strokeDashoffset={dashOffset}
            style={{ filter: secondsLeft <= 5 ? `drop-shadow(0 0 6px ${strokeColor})` : 'none' }}
            transition={{ duration: 0.5, ease: 'linear' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn(
            'font-mono font-bold text-lg',
            textColor,
            secondsLeft <= 5 && 'animate-pulse',
          )}>
            {secondsLeft}
          </span>
        </div>
      </div>
      <span className={cn(
        'text-[10px] font-medium uppercase tracking-wider',
        isMyTurn ? textColor : 'text-game-bg-muted',
      )}>
        {isMyTurn ? 'Your time' : 'Their time'}
      </span>
    </div>
  );
}
