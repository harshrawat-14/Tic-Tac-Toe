import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { cn } from '@/lib/utils';

export default function TurnIndicator() {
  const isMyTurn = useGameStore((s) => s.isMyTurn);
  const matchState = useGameStore((s) => s.matchState);
  const mySymbol = useGameStore((s) => s.mySymbol);

  if (!matchState) return null;

  const isActive = matchState.status === 'PLAYER_X_TURN' || matchState.status === 'PLAYER_O_TURN';
  const isWaiting = matchState.status === 'WAITING' || matchState.status === 'READY';
  const isGameOver = matchState.status === 'GAME_OVER';

  return (
    <div id="turn-indicator" className="flex justify-center">
      <AnimatePresence mode="wait">
        {isGameOver && (
          <motion.span
            key="gameover"
            className="text-sm font-semibold text-game-bg-muted"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            Game over
          </motion.span>
        )}

        {isWaiting && !isGameOver && (
          <motion.div
            key="waiting"
            className="flex items-center gap-2 text-sm text-game-bg-muted"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            <motion.div
              className="w-2 h-2 rounded-full bg-game-bg-muted"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
            />
            Waiting for opponent…
          </motion.div>
        )}

        {isActive && isMyTurn && (
          <motion.div
            key="my-turn"
            className={cn(
              'flex items-center gap-2 text-sm font-semibold',
              mySymbol === 'X' ? 'text-game-x' : 'text-game-o',
            )}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className={cn(
                'w-2.5 h-2.5 rounded-full',
                mySymbol === 'X' ? 'bg-game-x' : 'bg-game-o',
              )}
              animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
            />
            Your turn
          </motion.div>
        )}

        {isActive && !isMyTurn && (
          <motion.div
            key="opp-turn"
            className="flex items-center gap-2 text-sm text-game-bg-muted"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-game-bg-muted/50" />
            Opponent's turn
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
