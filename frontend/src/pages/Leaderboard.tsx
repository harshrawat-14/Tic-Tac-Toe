import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Trophy, ChevronDown } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { nakamaClient } from '@/lib/nakama';
import { cn } from '@/lib/utils';
import type { GetLeaderboardResponse } from '@/types/game';

const PAGE_SIZE = 10;

export default function Leaderboard() {
  const navigate = useNavigate();
  const session = useGameStore((s) => s.session);
  const myUserId = useGameStore((s) => s.myUserId);

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allPages, setAllPages] = useState<GetLeaderboardResponse['entries']>([]);

  const leaderboardQuery = useQuery({
    queryKey: ['leaderboard', cursor],
    queryFn: async () => {
      if (!session) throw new Error('No session');
      const payload: Record<string, unknown> = { limit: PAGE_SIZE };
      if (cursor) payload.cursor = cursor;
      const res = await nakamaClient.rpc(
        session,
        'get_leaderboard',
        payload,
      );
      return (typeof res.payload === 'string'
        ? JSON.parse(res.payload)
        : res.payload) as GetLeaderboardResponse;
    },
    enabled: !!session,
  });

  // Merge pages when data arrives
  const entries = leaderboardQuery.data
    ? [...allPages, ...leaderboardQuery.data.entries]
    : allPages;

  function handleLoadMore() {
    if (leaderboardQuery.data?.nextCursor) {
      setAllPages(entries);
      setCursor(leaderboardQuery.data.nextCursor);
    }
  }

  const hasMore = !!leaderboardQuery.data?.nextCursor;

  return (
    <div className="min-h-screen px-4 py-8 bg-grid relative overflow-hidden">
      <div className="max-w-2xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          className="flex items-center gap-4 mb-6"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            id="leaderboard-back-button"
            onClick={() => navigate('/lobby')}
            className="flex items-center justify-center w-9 h-9 rounded-xl border border-game-bg-border hover:bg-game-bg-elevated transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-game-bg-muted" />
          </button>
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <h1 className="font-display text-2xl font-bold text-white">Leaderboard</h1>
          </div>
        </motion.div>

        {/* Table */}
        <motion.div
          className="glass-card overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {/* Table header */}
          <div className="grid grid-cols-[3rem_1fr_4rem_3rem_3rem_3rem_3.5rem] gap-2 px-4 py-3 border-b border-game-bg-border/50 text-xs font-medium text-game-bg-muted uppercase tracking-wider">
            <span>Rank</span>
            <span>Player</span>
            <span className="text-right">ELO</span>
            <span className="text-center">W</span>
            <span className="text-center">L</span>
            <span className="text-center">D</span>
            <span className="text-center">🔥</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-game-bg-border/30">
            {entries.map((entry, index) => {
              const isMe = entry.userId === myUserId;
              const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
              const medal = medals[entry.rank];

              return (
                <motion.div
                  key={entry.userId}
                  className={cn(
                    'grid grid-cols-[3rem_1fr_4rem_3rem_3rem_3rem_3.5rem] gap-2 px-4 py-3 items-center text-sm transition-colors',
                    isMe
                      ? 'bg-brand-500/8 border-l-2 border-l-brand-500'
                      : 'hover:bg-game-bg-surface/40',
                  )}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <span className="font-mono text-game-bg-muted">
                    {medal || `#${entry.rank}`}
                  </span>
                  <span className={cn(
                    'truncate font-medium',
                    isMe ? 'text-brand-400' : 'text-white/90',
                  )}>
                    {entry.displayName}
                    {isMe && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/20">
                        YOU
                      </span>
                    )}
                  </span>
                  <span className="text-right font-mono font-semibold text-brand-400">
                    {entry.eloRating}
                  </span>
                  <span className="text-center text-green-400">
                    {entry.wins}
                  </span>
                  <span className="text-center text-game-x-light">
                    {entry.losses}
                  </span>
                  <span className="text-center text-game-bg-muted">
                    {entry.draws}
                  </span>
                  <span className={cn(
                    'text-center font-mono text-sm',
                    entry.winStreak > 0 ? 'text-yellow-400' : 'text-game-bg-muted/50',
                  )}>
                    {entry.winStreak > 0 ? entry.winStreak : '–'}
                  </span>
                </motion.div>
              );
            })}

            {/* Loading skeletons */}
            {leaderboardQuery.isLoading && entries.length === 0 && (
              Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className="grid grid-cols-[3rem_1fr_4rem_3rem_3rem_3rem_3.5rem] gap-2 px-4 py-3 items-center"
                >
                  <div className="skeleton h-4 w-8 rounded" />
                  <div className="skeleton h-4 w-32 rounded" />
                  <div className="skeleton h-4 w-10 rounded ml-auto" />
                  <div className="skeleton h-4 w-6 rounded mx-auto" />
                  <div className="skeleton h-4 w-6 rounded mx-auto" />
                  <div className="skeleton h-4 w-6 rounded mx-auto" />
                  <div className="skeleton h-4 w-6 rounded mx-auto" />
                </div>
              ))
            )}
          </div>

          {/* Empty state */}
          {!leaderboardQuery.isLoading && entries.length === 0 && (
            <div className="text-center py-12 text-game-bg-muted">
              <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No players yet. Be the first!</p>
            </div>
          )}

          {/* Load more */}
          {hasMore && (
            <div className="px-4 py-3 border-t border-game-bg-border/50">
              <button
                id="load-more-button"
                onClick={handleLoadMore}
                disabled={leaderboardQuery.isFetching}
                className="btn-ghost w-full text-sm py-2"
              >
                {leaderboardQuery.isFetching ? (
                  <span className="animate-pulse">Loading…</span>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Load More
                  </>
                )}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
