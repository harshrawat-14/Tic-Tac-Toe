import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { PlayerState } from '@/types/game';

interface PlayerBarProps {
  player: PlayerState | null;
  isCurrentTurn: boolean;
  isMe: boolean;
  position: 'top' | 'bottom';
}

export default function PlayerBar({ player, isCurrentTurn, isMe, position }: PlayerBarProps) {
  if (!player) {
    return (
      <div className={cn(
        'glass-card flex items-center gap-4 px-5 py-3',
        'animate-pulse',
      )}>
        <div className="w-10 h-10 rounded-full bg-game-bg-elevated" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 rounded bg-game-bg-elevated" />
          <div className="h-3 w-16 rounded bg-game-bg-elevated" />
        </div>
      </div>
    );
  }

  const isX = player.symbol === 'X';
  const symbolColor = isX ? 'text-game-x' : 'text-game-o';
  const glowClass = isCurrentTurn
    ? isX ? 'animate-pulse-x' : 'animate-pulse-o'
    : '';
  const borderColor = isCurrentTurn
    ? isX ? 'border-game-x/40' : 'border-game-o/40'
    : 'border-game-bg-border/50';

  return (
    <motion.div
      id={`player-bar-${position}`}
      className={cn(
        'glass-card flex items-center gap-4 px-5 py-3 transition-all duration-300',
        borderColor,
        glowClass,
      )}
      initial={{ opacity: 0, y: position === 'top' ? -16 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Symbol badge */}
      <div className={cn(
        'flex items-center justify-center w-10 h-10 rounded-full font-display font-bold text-lg',
        isX
          ? 'bg-game-x/15 text-game-x border border-game-x/30'
          : 'bg-game-o/15 text-game-o border border-game-o/30',
      )}>
        {player.symbol}
      </div>

      {/* Player info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate">
            {player.displayName}
          </span>
          {isMe && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/20">
              YOU
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-game-bg-muted">
          <span className="font-mono">{player.eloRating} ELO</span>
          <span className="flex items-center gap-1">
            <span className="text-green-400">{player.wins}W</span>
            <span className="text-game-x-light">{player.losses}L</span>
          </span>
        </div>
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-2">
        {isCurrentTurn && (
          <motion.span
            className={cn('text-xs font-medium', symbolColor)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            TURN
          </motion.span>
        )}
        <div className={cn(
          'w-2.5 h-2.5 rounded-full',
          player.connected
            ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]'
            : 'bg-game-bg-muted',
        )} />
      </div>
    </motion.div>
  );
}
