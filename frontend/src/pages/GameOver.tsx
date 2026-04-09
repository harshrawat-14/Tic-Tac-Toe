import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Trophy, ArrowRight, RotateCcw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { nakamaClient } from '@/lib/nakama';
import GameBoard from '@/components/GameBoard';
import { cn } from '@/lib/utils';
import type { GetLeaderboardResponse } from '@/types/game';

function AnimatedNumber({ value, prefix }: { value: number; prefix: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const duration = 800; // ms
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      current = Math.round(increment * step);
      if (step >= steps) {
        current = value;
        clearInterval(interval);
      }
      setDisplay(current);
    }, duration / steps);

    return () => clearInterval(interval);
  }, [value]);

  return (
    <span>
      {prefix}{Math.abs(display)}
    </span>
  );
}

export default function GameOver() {
  const navigate = useNavigate();
  const matchState = useGameStore((s) => s.matchState);
  const lastEloChange = useGameStore((s) => s.lastEloChange);
  const myUserId = useGameStore((s) => s.myUserId);
  const session = useGameStore((s) => s.session);
  const resetGame = useGameStore((s) => s.resetGame);

  // Redirect if no match state
  useEffect(() => {
    if (!matchState) {
      navigate('/lobby', { replace: true });
    }
  }, [matchState, navigate]);

  // Fetch top 3 leaderboard preview
  const leaderboardQuery = useQuery({
    queryKey: ['leaderboard-preview'],
    queryFn: async () => {
      if (!session) throw new Error('No session');
      const res = await nakamaClient.rpc(
        session,
        'get_leaderboard',
        { limit: 3 },
      );
      return (typeof res.payload === 'string'
        ? JSON.parse(res.payload)
        : res.payload) as GetLeaderboardResponse;
    },
    enabled: !!session,
  });

  if (!matchState) return null;

  const isWinner = matchState.winner === myUserId;
  const isDraw = matchState.isDraw;
  const winnerSymbol = matchState.winner
    ? matchState.players[matchState.winner]?.symbol
    : null;

  let heading = 'Draw!';
  let headingColor = 'text-game-bg-muted';
  let bgAccent = 'from-white/5 to-transparent';
  let icon = <Minus className="w-12 h-12 text-game-bg-muted" />;

  if (!isDraw) {
    if (isWinner) {
      heading = 'You Win!';
      headingColor = 'text-green-400';
      bgAccent = 'from-green-400/10 to-transparent';
      icon = <Trophy className="w-12 h-12 text-yellow-400" />;
    } else {
      heading = 'You Lose.';
      headingColor = 'text-game-x';
      bgAccent = 'from-game-x/10 to-transparent';
      icon = winnerSymbol === 'X'
        ? <span className="text-5xl font-display font-bold text-game-x">✕</span>
        : <span className="text-5xl font-display font-bold text-game-o">○</span>;
    }
  }

  const eloChange = lastEloChange ?? 0;

  function handlePlayAgain() {
    resetGame();
    navigate('/lobby');
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-grid relative overflow-hidden">
      {/* Background radial */}
      <div className={`absolute inset-0 bg-gradient-radial ${bgAccent} pointer-events-none`} />

      <motion.div
        className="w-full max-w-md space-y-6 relative z-10"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Result card */}
        <div className="glass-card p-8 text-center">
          {/* Icon */}
          <motion.div
            className="flex justify-center mb-4"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 12 }}
          >
            {icon}
          </motion.div>

          {/* Heading */}
          <motion.h1
            className={cn('font-display text-4xl font-bold mb-2', headingColor)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {heading}
          </motion.h1>

          {/* ELO change */}
          <motion.div
            className="flex items-center justify-center gap-2 mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {eloChange > 0 ? (
              <TrendingUp className="w-5 h-5 text-green-400" />
            ) : eloChange < 0 ? (
              <TrendingDown className="w-5 h-5 text-game-x" />
            ) : (
              <Minus className="w-5 h-5 text-game-bg-muted" />
            )}
            <span className={cn(
              'font-mono text-2xl font-bold',
              eloChange > 0 ? 'text-green-400' : eloChange < 0 ? 'text-game-x' : 'text-game-bg-muted',
            )}>
              <AnimatedNumber value={eloChange} prefix={eloChange >= 0 ? '+' : '-'} />
              <span className="text-sm font-normal ml-1 opacity-60">ELO</span>
            </span>
          </motion.div>

          {/* Final board (small, non-interactive) */}
          <motion.div
            className="flex justify-center mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <GameBoard interactive={false} />
          </motion.div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              id="play-again-button"
              onClick={handlePlayAgain}
              className="btn-brand flex-1"
            >
              <RotateCcw className="w-4 h-4" />
              Play Again
            </button>
            <button
              id="view-leaderboard-from-gameover"
              onClick={() => navigate('/leaderboard')}
              className="btn-ghost flex-1"
            >
              <Trophy className="w-4 h-4" />
              Leaderboard
            </button>
          </div>
        </div>

        {/* Top 3 Preview */}
        {leaderboardQuery.data && leaderboardQuery.data.entries.length > 0 && (
          <motion.div
            className="glass-card p-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                Top Players
              </h3>
              <button
                onClick={() => navigate('/leaderboard')}
                className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {leaderboardQuery.data.entries.map((entry, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <div
                    key={entry.userId}
                    className={cn(
                      'flex items-center gap-3 py-1.5 px-2 rounded-lg text-sm',
                      entry.userId === myUserId && 'bg-brand-500/10 border border-brand-500/15',
                    )}
                  >
                    <span className="text-base">{medals[index]}</span>
                    <span className="flex-1 truncate text-white/90">{entry.displayName}</span>
                    <span className="font-mono text-xs text-brand-400">{entry.eloRating}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
