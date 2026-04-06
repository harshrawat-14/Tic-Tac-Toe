import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { cn } from '@/lib/utils';

// ─── X Piece ──────────────────────────────────────────────────────────────────

function XPiece({ size = 48 }: { size?: number }) {
  const pad = size * 0.2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <motion.line
        x1={pad} y1={pad} x2={size - pad} y2={size - pad}
        stroke="#E24B4A" strokeWidth={4} strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
      <motion.line
        x1={size - pad} y1={pad} x2={pad} y2={size - pad}
        stroke="#E24B4A" strokeWidth={4} strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut', delay: 0.1 }}
      />
    </svg>
  );
}

// ─── O Piece ──────────────────────────────────────────────────────────────────

function OPiece({ size = 48 }: { size?: number }) {
  const half = size / 2;
  const radius = half - size * 0.2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <motion.circle
        cx={half} cy={half} r={radius}
        stroke="#378ADD" strokeWidth={4} fill="none" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </svg>
  );
}

// ─── Cell ─────────────────────────────────────────────────────────────────────

interface CellProps {
  index: number;
  value: string | null;
  isPending: boolean;
  isMyTurn: boolean;
  isGameOver: boolean;
  isWinningCell: boolean;
  onCellClick: (index: number) => void;
}

function Cell({ index, value, isPending, isMyTurn, isGameOver, isWinningCell, onCellClick }: CellProps) {
  const canClick = !value && isMyTurn && !isGameOver;

  return (
    <motion.button
      id={`cell-${index}`}
      className={cn(
        'relative flex items-center justify-center',
        'aspect-square rounded-xl border transition-all duration-200',
        value
          ? 'border-game-bg-border/30 bg-game-bg-surface/40'
          : canClick
            ? 'border-game-bg-border/50 bg-game-bg-surface/20 hover:bg-game-bg-elevated/60 hover:border-brand-500/30 cursor-pointer'
            : 'border-game-bg-border/20 bg-game-bg-surface/10 cursor-default',
        isPending && 'ring-2 ring-brand-500/40 animate-pulse',
        isWinningCell && value === 'X' && 'shadow-x-glow border-game-x/50',
        isWinningCell && value === 'O' && 'shadow-o-glow border-game-o/50',
      )}
      onClick={() => canClick && onCellClick(index)}
      whileHover={canClick ? { scale: 1.03 } : {}}
      whileTap={canClick ? { scale: 0.97 } : {}}
      disabled={!canClick}
      aria-label={`Cell ${index}, ${value || 'empty'}`}
    >
      <AnimatePresence mode="wait">
        {value === 'X' && (
          <motion.div
            key="x"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
          >
            <XPiece size={52} />
          </motion.div>
        )}
        {value === 'O' && (
          <motion.div
            key="o"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
          >
            <OPiece size={52} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hover hint for empty cells */}
      {canClick && !value && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-20 transition-opacity">
          <div className="w-3 h-3 rounded-full bg-brand-500" />
        </div>
      )}
    </motion.button>
  );
}

// ─── Game Board ───────────────────────────────────────────────────────────────

interface GameBoardProps {
  interactive?: boolean;
  compact?: boolean;
}

const WIN_LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
];

export default function GameBoard({ interactive = true, compact = false }: GameBoardProps) {
  const matchState = useGameStore((s) => s.matchState);
  const isMyTurn = useGameStore((s) => s.isMyTurn);
  const pendingCell = useGameStore((s) => s.pendingCell);
  const makeMove = useGameStore((s) => s.makeMove);

  if (!matchState) return null;

  const { board, winner, status } = matchState;
  const isGameOver = status === 'GAME_OVER';

  // Find winning cells
  let winningCells: Set<number> = new Set();
  if (winner && isGameOver) {
    const winnerSymbol = matchState.players[winner]?.symbol;
    if (winnerSymbol) {
      for (const line of WIN_LINES) {
        if (line.every((i) => board[i] === winnerSymbol)) {
          line.forEach((i) => winningCells.add(i));
        }
      }
    }
  }

  return (
    <div
      id="game-board"
      className={cn(
        'grid grid-cols-3 gap-2',
        compact ? 'w-48 sm:w-56' : 'w-72 sm:w-80 md:w-96',
      )}
    >
      {board.map((cell, index) => (
        <Cell
          key={index}
          index={index}
          value={cell}
          isPending={pendingCell === index}
          isMyTurn={interactive && isMyTurn}
          isGameOver={isGameOver}
          isWinningCell={winningCells.has(index)}
          onCellClick={interactive ? makeMove : () => {}}
        />
      ))}
    </div>
  );
}
