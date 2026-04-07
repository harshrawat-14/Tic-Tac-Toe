import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { cn } from '@/lib/utils';
import type { PlayerState } from '@/types/game';

// ─── First-letter avatar ──────────────────────────────────────────────────────

function Avatar({ displayName, symbol }: { displayName: string; symbol: 'X' | 'O' }) {
  const initial = displayName ? displayName[0].toUpperCase() : '?';
  const isX = symbol === 'X';
  return (
    <div className={cn(
      'flex items-center justify-center w-10 h-10 rounded-full font-display font-bold text-base flex-shrink-0',
      isX
        ? 'bg-game-x/15 text-game-x border border-game-x/30'
        : 'bg-game-o/15 text-game-o border border-game-o/30',
    )}>
      {initial}
    </div>
  );
}

// ─── Connection dot ───────────────────────────────────────────────────────────

function ConnectionDot({
  connected,
  reconnecting,
}: {
  connected: boolean;
  reconnecting: boolean;
}) {
  if (reconnecting) {
    return (
      <motion.div
        className="w-2.5 h-2.5 rounded-full bg-yellow-400"
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ repeat: Infinity, duration: 1 }}
        title="Reconnecting…"
      />
    );
  }
  return (
    <div
      className={cn(
        'w-2.5 h-2.5 rounded-full',
        connected
          ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]'
          : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]',
      )}
      title={connected ? 'Connected' : 'Disconnected'}
    />
  );
}

// ─── PlayerBar ────────────────────────────────────────────────────────────────

interface PlayerBarProps {
  /** userId to display */
  userId: string;
  /** visual position — drives entrance animation direction */
  position: 'top' | 'bottom';
}

export default function PlayerBar({ userId, position }: PlayerBarProps) {
  const matchState = useGameStore((s) => s.matchState);
  const myUserId = useGameStore((s) => s.myUserId);
  const opponentReconnecting = useGameStore((s) => s.opponentReconnecting);

  const player: PlayerState | undefined = matchState?.players[userId];

  if (!player) {
    // Skeleton while waiting for the player to be known
    return (
      <div className="glass-card flex items-center gap-3 px-4 py-3 animate-pulse">
        <div className="w-10 h-10 rounded-full bg-game-bg-elevated flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-24 rounded bg-game-bg-elevated" />
          <div className="h-3 w-16 rounded bg-game-bg-elevated" />
        </div>
        <div className="w-2.5 h-2.5 rounded-full bg-game-bg-elevated" />
      </div>
    );
  }

  const isMe = userId === myUserId;
  const isTheirTurn = matchState?.currentTurn === userId && (
    matchState?.status === 'PLAYER_X_TURN' || matchState?.status === 'PLAYER_O_TURN'
  );
  const isX = player.symbol === 'X';
  const isReconnecting = !isMe && opponentReconnecting;

  const turnBorderClass = isTheirTurn
    ? isX
      ? 'border-game-x/50 shadow-[0_0_16px_rgba(226,75,74,0.2)]'
      : 'border-game-o/50 shadow-[0_0_16px_rgba(55,138,221,0.2)]'
    : 'border-game-bg-border/40';

  return (
    <motion.div
      id={`player-bar-${position}`}
      className={cn(
        'glass-card flex items-center gap-3 px-4 py-3 transition-all duration-300',
        turnBorderClass,
      )}
      initial={{ opacity: 0, y: position === 'top' ? -12 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Avatar */}
      <Avatar displayName={player.displayName} symbol={player.symbol} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-sm text-white truncate">
            {player.displayName}
          </span>
          {isMe && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/20 flex-shrink-0">
              YOU
            </span>
          )}
          {isTheirTurn && (
            <motion.span
              className={cn(
                'text-[10px] font-bold uppercase tracking-wide flex-shrink-0',
                isX ? 'text-game-x' : 'text-game-o',
              )}
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
            >
              TURN
            </motion.span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-game-bg-muted">
          <span className="font-mono">{player.eloRating} ELO</span>
          <span className="text-game-bg-border">·</span>
          <span className="text-green-400">{player.wins}W</span>
          <span className="text-game-x-light">{player.losses}L</span>
          <span>{player.draws}D</span>
          {player.winStreak > 1 && (
            <span className="text-yellow-400">🔥{player.winStreak}</span>
          )}
        </div>
      </div>

      {/* Connection dot */}
      <ConnectionDot connected={player.connected} reconnecting={isReconnecting} />
    </motion.div>
  );
}
