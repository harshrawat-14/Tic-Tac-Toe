import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';

export default function Matchmaking() {
  const navigate = useNavigate();
  const matchId = useGameStore((s) => s.matchId);
  const matchmakingTicket = useGameStore((s) => s.matchmakingTicket);
  const cancelMatchmaking = useGameStore((s) => s.cancelMatchmaking);

  const [elapsed, setElapsed] = useState(0);

  // Redirect to lobby if no ticket
  useEffect(() => {
    if (!matchmakingTicket) {
      navigate('/lobby', { replace: true });
    }
  }, [matchmakingTicket, navigate]);

  // Redirect to game when matched
  useEffect(() => {
    if (matchId) {
      navigate('/game', { replace: true });
    }
  }, [matchId, navigate]);

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleCancel() {
    await cancelMatchmaking();
    navigate('/lobby');
  }

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = minutes > 0
    ? `${minutes}:${seconds.toString().padStart(2, '0')}`
    : `${seconds}s`;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-grid relative overflow-hidden">
      <motion.div
        className="flex flex-col items-center text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Pulsing rings */}
        <div className="relative w-40 h-40 mb-8">
          {/* Ring 1 */}
          <div className="absolute inset-0 rounded-full border-2 border-brand-500/30 matchmaking-ring" />
          {/* Ring 2 (delayed) */}
          <div
            className="absolute inset-0 rounded-full border-2 border-brand-500/20 matchmaking-ring"
            style={{ animationDelay: '0.6s' }}
          />
          {/* Ring 3 (delayed) */}
          <div
            className="absolute inset-0 rounded-full border-2 border-brand-500/10 matchmaking-ring"
            style={{ animationDelay: '1.2s' }}
          />
          {/* Center icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/25 flex items-center justify-center"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
            >
              <span className="text-3xl">⚔️</span>
            </motion.div>
          </div>
        </div>

        {/* Text */}
        <h2 className="font-display text-2xl font-bold text-white mb-2">
          Finding opponent
          <motion.span
            animate={{ opacity: [0, 1, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            …
          </motion.span>
        </h2>

        <p className="text-sm text-game-bg-muted mb-1">
          Usually takes 20–30 seconds
        </p>

        <p className="font-mono text-lg text-brand-400 mb-8">
          {timeStr}
        </p>

        {/* Cancel */}
        <button
          id="cancel-matchmaking-button"
          onClick={handleCancel}
          className="btn-ghost text-sm"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </motion.div>
    </div>
  );
}
