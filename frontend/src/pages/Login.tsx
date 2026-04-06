import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Gamepad2, Zap, Loader2 } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { cn } from '@/lib/utils';

export default function Login() {
  const navigate = useNavigate();
  const connect = useGameStore((s) => s.connect);
  const restoreAndConnect = useGameStore((s) => s.restoreAndConnect);
  const session = useGameStore((s) => s.session);
  const connectionError = useGameStore((s) => s.connectionError);

  const [nickname, setNickname] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Try to restore session on mount
  useEffect(() => {
    let cancelled = false;
    restoreAndConnect()
      .then((restored) => {
        if (!cancelled && restored) {
          navigate('/lobby', { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });
    return () => { cancelled = true; };
  }, [restoreAndConnect, navigate]);

  // Redirect if already connected
  useEffect(() => {
    if (session && !isRestoring) {
      navigate('/lobby', { replace: true });
    }
  }, [session, isRestoring, navigate]);

  async function handlePlay() {
    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      setError('Nickname must be 2–20 characters');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await connect(trimmed);
      navigate('/lobby');
    } catch (err) {
      setError(connectionError || 'Failed to connect. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handlePlay();
  }

  if (isRestoring) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-grid">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          <p className="text-sm text-game-bg-muted">Restoring session…</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-grid relative overflow-hidden">
      {/* Ambient light blobs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-brand-500/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full bg-game-o/5 blur-3xl pointer-events-none" />

      <motion.div
        className="glass-card w-full max-w-md p-8 sm:p-10 relative z-10"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <motion.div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 mb-4"
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          >
            <Gamepad2 className="w-8 h-8 text-brand-400" />
          </motion.div>

          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-2">
            <span className="text-gradient-brand">Tic</span>
            <span className="text-white">Tac</span>
            <span className="text-gradient-brand">Toe</span>
          </h1>

          <p className="text-sm text-game-bg-muted flex items-center justify-center gap-2">
            <span>Multiplayer</span>
            <span className="w-1 h-1 rounded-full bg-game-bg-muted" />
            <span>Real-time</span>
            <span className="w-1 h-1 rounded-full bg-game-bg-muted" />
            <span>Server-authoritative</span>
          </p>
        </div>

        {/* Nickname input */}
        <div className="space-y-4">
          <div>
            <label htmlFor="nickname-input" className="block text-xs font-medium text-game-bg-muted uppercase tracking-wider mb-2">
              Choose your name
            </label>
            <input
              id="nickname-input"
              type="text"
              placeholder="Enter nickname…"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={20}
              autoFocus
              className="input-field"
              disabled={isLoading}
            />
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-game-bg-muted">2–20 characters</span>
              <span className={cn(
                'text-[10px] font-mono',
                nickname.length < 2 ? 'text-game-bg-muted' : 'text-brand-400',
              )}>
                {nickname.length}/20
              </span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-game-x bg-game-x/10 border border-game-x/20 rounded-lg px-3 py-2"
            >
              {error}
            </motion.div>
          )}

          {/* Play button */}
          <button
            id="play-button"
            onClick={handlePlay}
            disabled={isLoading || nickname.trim().length < 2}
            className="btn-brand w-full text-base py-3.5"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Zap className="w-5 h-5" />
                Play
              </>
            )}
          </button>
        </div>

        {/* Footer decoration */}
        <div className="mt-8 flex items-center justify-center gap-4 text-game-bg-muted/50">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-sm bg-game-x/30"
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
              />
            ))}
          </div>
          <span className="text-[10px] uppercase tracking-widest">vs</span>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-game-o/30"
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
