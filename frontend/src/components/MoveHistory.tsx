import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';

// Row-major index → board label (A1=top-left, C3=bottom-right)
const COLUMN = ['A', 'B', 'C'];
function cellLabel(index: number): string {
  const row = Math.floor(index / 3) + 1; // 1,2,3
  const col = index % 3;                 // 0,1,2
  return `${COLUMN[col]}${row}`;
}

interface PillProps {
  move: number;
  turnIndex: number;
  symbol: 'X' | 'O';
}

function MovePill({ move, turnIndex, symbol }: PillProps) {
  const isX = symbol === 'X';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-mono font-semibold border ${
        isX
          ? 'bg-game-x/10 border-game-x/30 text-game-x'
          : 'bg-game-o/10 border-game-o/30 text-game-o'
      }`}
      title={`Move ${turnIndex + 1}: ${symbol} plays ${cellLabel(move)}`}
    >
      <span className="opacity-60">{turnIndex + 1}.</span>
      <span>{symbol}</span>
      <span className="opacity-80">{cellLabel(move)}</span>
    </motion.div>
  );
}

export default function MoveHistory() {
  const matchState = useGameStore((s) => s.matchState);

  if (!matchState || matchState.moveHistory.length === 0) {
    return null;
  }

  const { moveHistory, playerOrder, players } = matchState;

  // playerOrder[0] is always X, playerOrder[1] is always O
  const symbolForTurn = (turnIndex: number): 'X' | 'O' => {
    const userId = playerOrder[turnIndex % 2];
    return players[userId]?.symbol ?? (turnIndex % 2 === 0 ? 'X' : 'O');
  };

  return (
    <div id="move-history" className="w-full">
      <p className="text-[10px] font-medium uppercase tracking-widest text-game-bg-muted mb-1.5">
        Move History
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <AnimatePresence initial={false}>
          {moveHistory.map((move, i) => (
            <MovePill
              key={`${i}-${move}`}
              move={move}
              turnIndex={i}
              symbol={symbolForTurn(i)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
