import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';

export default function DisconnectionOverlay() {
  const opponentReconnecting = useGameStore((s) => s.opponentReconnecting);
  const reconnectSecondsLeft = useGameStore((s) => s.reconnectSecondsLeft);

  const isExpired = reconnectSecondsLeft <= 0;

  return (
    <AnimatePresence>
      {opponentReconnecting && (
        <motion.div
          id="disconnection-overlay"
          className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-game-bg/75 backdrop-blur-sm" />

          {/* Card */}
          <motion.div
            className="relative z-10 glass-card p-6 text-center max-w-xs mx-4"
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.88, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* Icon with ring */}
            <div className="relative mx-auto w-14 h-14 mb-4">
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-yellow-400/30"
                animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-yellow-400/10 border border-yellow-400/25">
                <WifiOff className="w-6 h-6 text-yellow-400" />
              </div>
            </div>

            <h3 className="text-base font-semibold text-white mb-1">
              Opponent Disconnected
            </h3>

            <AnimatePresence mode="wait">
              {isExpired ? (
                <motion.p
                  key="expired"
                  className="text-sm font-semibold text-game-x"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  Match forfeited
                </motion.p>
              ) : (
                <motion.div
                  key="countdown"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <p className="text-xs text-game-bg-muted mb-3">
                    Waiting for reconnection…
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <motion.div
                      className="w-2 h-2 rounded-full bg-yellow-400"
                      animate={{ opacity: [1, 0.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    />
                    <span className="font-mono text-2xl font-bold text-yellow-400">
                      {reconnectSecondsLeft}s
                    </span>
                  </div>
                  <p className="text-[10px] text-game-bg-muted mt-2">
                    You win if they don't return
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
