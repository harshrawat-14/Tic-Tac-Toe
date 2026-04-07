import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { cn } from '@/lib/utils';

// ─── Win lines (mirrors server WIN_LINES) ──────────────────────────────────────

const WIN_LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
];

// SVG grid cell layout helpers (for winning line overlay)
// Cell coordinate helpers (for winning line SVG overlay)
const CELL_CENTERS: [number, number][] = [
  [50, 50],   [150, 50],  [250, 50],  // row 0
  [50, 150],  [150, 150], [250, 150], // row 1
  [50, 250],  [150, 250], [250, 250], // row 2
];

// ─── Winning Line SVG ─────────────────────────────────────────────────────────

function WinningLine({ line, symbol }: { line: [number, number, number]; symbol: string }) {
  const [a, , c] = line;
  const [x1, y1] = CELL_CENTERS[a];
  const [x2, y2] = CELL_CENTERS[c];
  const color = symbol === 'X' ? '#E24B4A' : '#378ADD';

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      viewBox="0 0 300 300"
      style={{ filter: `drop-shadow(0 0 8px ${color})` }}
    >
      <motion.line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </svg>
  );
}

// ─── X Symbol ─────────────────────────────────────────────────────────────────

function XSymbol({ pending }: { pending: boolean }) {
  return (
    <svg viewBox="0 0 60 60" className="w-full h-full p-3" style={{ opacity: pending ? 0.4 : 1 }}>
      <motion.line
        x1="12" y1="12" x2="48" y2="48"
        stroke="#E24B4A" strokeWidth={5} strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
      />
      <motion.line
        x1="48" y1="12" x2="12" y2="48"
        stroke="#E24B4A" strokeWidth={5} strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1], delay: 0.05 }}
      />
    </svg>
  );
}

// ─── O Symbol ─────────────────────────────────────────────────────────────────

function OSymbol({ pending }: { pending: boolean }) {
  return (
    <svg viewBox="0 0 60 60" className="w-full h-full p-3" style={{ opacity: pending ? 0.4 : 1 }}>
      <motion.circle
        cx="30" cy="30" r="18"
        stroke="#378ADD" strokeWidth={5} fill="none" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
      />
    </svg>
  );
}

// ─── Cell ─────────────────────────────────────────────────────────────────────

interface CellProps {
  index: number;
  value: string | null;
  isPending: boolean;
  isWinning: boolean;
  canClick: boolean;
  onClick: (i: number) => void;
}

function Cell({ index, value, isPending, isWinning, canClick, onClick }: CellProps) {
  const isEmpty = value === null;

  return (
    <motion.button
      id={`cell-${index}`}
      className={cn(
        'relative aspect-square rounded-xl border transition-colors duration-150 overflow-hidden select-none',
        isWinning
          ? value === 'X'
            ? 'border-game-x/60 bg-game-x/10'
            : 'border-game-o/60 bg-game-o/10'
          : 'border-game-bg-border/40 bg-game-bg-surface/30',
        canClick && isEmpty
          ? 'hover:bg-game-bg-elevated/70 hover:border-brand-500/40 cursor-pointer'
          : !isEmpty || !canClick
            ? 'cursor-not-allowed'
            : '',
      )}
      onClick={() => canClick && isEmpty && onClick(index)}
      whileTap={canClick && isEmpty ? { scale: 0.94 } : {}}
      disabled={!canClick || !isEmpty}
      aria-label={`Cell ${index}${value ? `, ${value}` : ', empty'}`}
    >
      <AnimatePresence mode="wait">
        {value === 'X' && (
          <motion.div
            key="x"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ duration: 0.2, type: 'spring', stiffness: 400, damping: 20 }}
          >
            <XSymbol pending={isPending} />
          </motion.div>
        )}
        {value === 'O' && (
          <motion.div
            key="o"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ duration: 0.2, type: 'spring', stiffness: 400, damping: 20 }}
          >
            <OSymbol pending={isPending} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hover hint */}
      {canClick && isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-150">
          <div className="w-2 h-2 rounded-full bg-brand-500/40" />
        </div>
      )}
    </motion.button>
  );
}

// ─── GameBoard ────────────────────────────────────────────────────────────────

interface GameBoardProps {
  interactive?: boolean;
}

export default function GameBoard({ interactive = true }: GameBoardProps) {
  const matchState = useGameStore((s) => s.matchState);
  const isMyTurn = useGameStore((s) => s.isMyTurn);
  const pendingCell = useGameStore((s) => s.pendingCell);
  const makeMove = useGameStore((s) => s.makeMove);

  if (!matchState) return null;

  const { board, status, winner } = matchState;
  const isGameOver = status === 'GAME_OVER';

  // Detect winning cells
  let winningCells = new Set<number>();
  let winningLine: [number, number, number] | null = null;
  let winningSymbol: string | null = null;
  if (winner && isGameOver) {
    winningSymbol = matchState.players[winner]?.symbol ?? null;
    if (winningSymbol) {
      for (const line of WIN_LINES) {
        if (line.every((i) => board[i] === winningSymbol)) {
          winningCells = new Set(line);
          winningLine = line;
          break;
        }
      }
    }
  }

  const canInteract = interactive && !isGameOver;

  return (
    <div id="game-board" className="relative">
      <div className="grid grid-cols-3 gap-2 w-72 sm:w-80 md:w-96">
        {board.map((cell, index) => (
          <Cell
            key={index}
            index={index}
            value={cell}
            isPending={pendingCell === index}
            isWinning={winningCells.has(index)}
            canClick={canInteract && isMyTurn}
            onClick={makeMove}
          />
        ))}
      </div>

      {/* Winning line overlay */}
      {winningLine && winningSymbol && (
        <div className="absolute inset-0 pointer-events-none">
          <WinningLine line={winningLine} symbol={winningSymbol} />
        </div>
      )}
    </div>
  );
}
