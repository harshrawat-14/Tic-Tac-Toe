import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { WifiOff } from 'lucide-react';

export default function DisconnectionOverlay() {
  const opponentReconnecting = useGameStore((s) => s.opponentReconnecting);
  const reconnectSecondsLeft = useGameStore((s) => s.reconnectSecondsLeft);

  return (
    <AnimatePresence>
      {opponentReconnecting && (
        <motion.div
          id="disconnection-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-game-bg/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="glass-card p-8 text-center max-w-sm mx-4"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Pulsing icon */}
            <div className="relative mx-auto w-16 h-16 mb-5">
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-yellow-400/40"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.6, 0, 0.6],
                }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-yellow-400/10 border border-yellow-400/30">
                <WifiOff className="w-7 h-7 text-yellow-400" />
              </div>
            </div>

            <h3 className="text-lg font-semibold text-white mb-1">
              Opponent Disconnected
            </h3>
            <p className="text-sm text-game-bg-muted mb-4">
              Waiting for them to reconnect…
            </p>

            {/* Countdown */}
            {reconnectSecondsLeft > 0 && (
              <div className="flex items-center justify-center gap-2">
                <motion.div
                  className="w-2 h-2 rounded-full bg-yellow-400"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                />
                <span className="font-mono text-2xl font-bold text-yellow-400">
                  {reconnectSecondsLeft}s
                </span>
              </div>
            )}

            <p className="text-xs text-game-bg-muted mt-3">
              You win if they don't return in time
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
