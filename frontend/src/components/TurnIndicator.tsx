import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { cn } from '@/lib/utils';

export default function TurnIndicator() {
  const isMyTurn = useGameStore((s) => s.isMyTurn);
  const matchState = useGameStore((s) => s.matchState);
  const mySymbol = useGameStore((s) => s.mySymbol);

  if (!matchState || matchState.status === 'GAME_OVER') return null;

  const isWaiting = matchState.status === 'WAITING' || matchState.status === 'READY';

  return (
    <div id="turn-indicator" className="text-center">
      <AnimatePresence mode="wait">
        {isWaiting ? (
          <motion.div
            key="waiting"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="text-game-bg-muted text-sm font-medium"
          >
            Waiting for opponent…
          </motion.div>
        ) : (
          <motion.div
            key={isMyTurn ? 'my-turn' : 'opp-turn'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-center gap-2"
          >
            <motion.div
              className={cn(
                'w-3 h-3 rounded-full',
                isMyTurn
                  ? mySymbol === 'X' ? 'bg-game-x' : 'bg-game-o'
                  : 'bg-game-bg-muted',
              )}
              animate={isMyTurn ? {
                scale: [1, 1.3, 1],
                opacity: [1, 0.7, 1],
              } : {}}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
            <span className={cn(
              'text-sm font-semibold',
              isMyTurn
                ? mySymbol === 'X' ? 'text-game-x' : 'text-game-o'
                : 'text-game-bg-muted',
            )}>
              {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
