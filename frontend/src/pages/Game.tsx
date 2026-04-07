import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flag } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import GameBoard from '@/components/GameBoard';
import PlayerBar from '@/components/PlayerBar';
import TurnIndicator from '@/components/TurnIndicator';
import TurnTimer from '@/components/TurnTimer';
import DisconnectionOverlay from '@/components/DisconnectionOverlay';

export default function Game() {
  const navigate = useNavigate();
  const matchState = useGameStore((s) => s.matchState);
  const matchId = useGameStore((s) => s.matchId);
  const myUserId = useGameStore((s) => s.myUserId);
  const isMyTurn = useGameStore((s) => s.isMyTurn);
  const leaveMatch = useGameStore((s) => s.leaveMatch);
  const sendForfeit = useGameStore((s) => s.sendForfeit);


  const gameOverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirect if no match
  useEffect(() => {
    if (!matchId && !matchState) {
      navigate('/lobby', { replace: true });
    }
  }, [matchId, matchState, navigate]);

  // Navigate to game-over after delay
  useEffect(() => {
    if (matchState?.status === 'GAME_OVER') {
      gameOverTimerRef.current = setTimeout(() => {
        navigate('/game-over');
      }, 1500);
    }
    return () => {
      if (gameOverTimerRef.current) {
        clearTimeout(gameOverTimerRef.current);
      }
    };
  }, [matchState?.status, navigate]);

  // Handle beforeunload
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      leaveMatch();
      e.preventDefault();
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [leaveMatch]);

  if (!matchState) return null;

  const isGameOver = matchState.status === 'GAME_OVER';
  const opponentId = Object.keys(matchState.players).find((id) => id !== myUserId) ?? '';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-6 bg-grid relative overflow-hidden">
      {/* Ambient glow based on whose turn */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
        isMyTurn ? 'opacity-100' : 'opacity-0'
      }`}>
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-3xl ${
          matchState.players[myUserId]?.symbol === 'X' ? 'bg-game-x/3' : 'bg-game-o/3'
        }`} />
      </div>

      <motion.div
        className="w-full max-w-md space-y-4 relative z-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Opponent bar (top) */}
        {opponentId && (
          <PlayerBar userId={opponentId} position="top" />
        )}

        {/* Turn indicator */}
        <TurnIndicator />

        {/* Game Board */}
        <div className="flex justify-center">
          <GameBoard interactive={!isGameOver} />
        </div>

        {/* Timer + Controls row */}
        <div className="flex items-center justify-between">
          <div className="flex-1" />
          {matchState.mode === 'timed' && (
            <TurnTimer />
          )}
          <div className="flex-1 flex justify-end">
            {!isGameOver && (
              <button
                id="forfeit-button"
                onClick={sendForfeit}
                className="btn-danger text-xs px-3 py-2"
                title="Forfeit match"
              >
                <Flag className="w-3.5 h-3.5" />
                Forfeit
              </button>
            )}
          </div>
        </div>

        {/* My player bar (bottom) */}
        <PlayerBar userId={myUserId} position="bottom" />
      </motion.div>

      {/* Disconnection overlay */}
      <DisconnectionOverlay />

      {/* Game Over flash */}
      {isGameOver && (
        <motion.div
          className="absolute inset-0 z-40 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.3, 0] }}
          transition={{ duration: 1 }}
        >
          <div className={`w-full h-full ${
            matchState.winner === myUserId
              ? 'bg-green-400'
              : matchState.isDraw
                ? 'bg-white'
                : 'bg-game-x'
          }`} />
        </motion.div>
      )}
    </div>
  );
}
