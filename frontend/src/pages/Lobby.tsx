import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Clock, Infinity as InfinityIcon, Swords, Plus, LogIn,
  Trophy, LogOut, Loader2, Users,
} from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { nakamaClient } from '@/lib/nakama';

import type { GameMode, PlayerStatsResponse, CreateRoomResponse } from '@/types/game';

export default function Lobby() {
  const navigate = useNavigate();
  const session = useGameStore((s) => s.session);
  const myDisplayName = useGameStore((s) => s.myDisplayName);
  const joinMatchmaking = useGameStore((s) => s.joinMatchmaking);
  const joinMatch = useGameStore((s) => s.joinMatch);
  const disconnect = useGameStore((s) => s.disconnect);

  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Fetch player stats
  const statsQuery = useQuery({
    queryKey: ['playerStats', session?.user_id],
    queryFn: async () => {
      if (!session) throw new Error('No session');
      const res = await nakamaClient.rpc(session, 'get_player_stats', {});
      return (typeof res.payload === 'string' 
        ? JSON.parse(res.payload) 
        : res.payload) as PlayerStatsResponse;
    },
    enabled: !!session,
  });

  async function handleQuickMatch(mode: GameMode) {
    try {
      await joinMatchmaking(mode);
      navigate('/matchmaking');
    } catch (err) {
      console.error('Failed to join matchmaking:', err);
    }
  }

  async function handleCreateRoom() {
    if (!session) return;
    setIsCreating(true);
    try {
      const res = await nakamaClient.rpc(session, 'create_room', JSON.stringify({ mode: 'classic' }));
      const data = (typeof res.payload === 'string'
        ? JSON.parse(res.payload)
        : res.payload) as CreateRoomResponse;
      await joinMatch(data.matchId);
      navigate('/game');
    } catch (err) {
      console.error('Failed to create room:', err);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleJoinRoom() {
    const code = joinCode.trim();
    if (!code) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      await joinMatch(code);
      navigate('/game');
    } catch {
      setJoinError('Invalid match code or room is full');
    } finally {
      setIsJoining(false);
    }
  }

  function handleSignOut() {
    disconnect();
    navigate('/', { replace: true });
  }

  const stats = statsQuery.data;

  return (
    <div className="min-h-screen px-4 py-8 bg-grid relative overflow-hidden">
      {/* Ambient */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-brand-500/3 blur-3xl pointer-events-none" />

      <div className="max-w-2xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <motion.div
          className="flex items-center justify-between"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div>
            <h1 className="font-display text-2xl font-bold text-white">
              Welcome, <span className="text-gradient-brand">{myDisplayName || 'Player'}</span>
            </h1>
            {stats && (
              <p className="text-sm text-game-bg-muted mt-0.5">
                <span className="font-mono text-brand-400">{stats.eloRating}</span> ELO
                <span className="mx-2 text-game-bg-border">·</span>
                <span className="text-green-400">{stats.wins}W</span>
                <span className="mx-1 text-game-bg-border">/</span>
                <span className="text-game-x-light">{stats.losses}L</span>
                <span className="mx-1 text-game-bg-border">/</span>
                <span className="text-game-bg-muted">{stats.draws}D</span>
                {stats.winStreak > 0 && (
                  <span className="ml-2 text-yellow-400">🔥 {stats.winStreak} streak</span>
                )}
              </p>
            )}
            {statsQuery.isLoading && (
              <div className="h-5 w-48 skeleton mt-1 rounded" />
            )}
          </div>
          <button
            id="sign-out-button"
            onClick={handleSignOut}
            className="btn-ghost px-3 py-2 text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </motion.div>

        {/* Mode Cards */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {/* Classic Mode */}
          <div className="glass-card p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20">
                <InfinityIcon className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <h2 className="font-semibold text-white">Classic</h2>
                <p className="text-xs text-game-bg-muted">No timer</p>
              </div>
            </div>
            <p className="text-sm text-game-bg-muted mb-4 flex-1">
              Unlimited thinking time. Take your turn at your own pace — pure strategy.
            </p>
            <button
              id="quick-match-classic"
              onClick={() => handleQuickMatch('classic')}
              className="btn-brand w-full text-sm py-2.5"
            >
              <Swords className="w-4 h-4" />
              Quick Match
            </button>
          </div>

          {/* Timed Mode */}
          <div className="glass-card p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-yellow-400/10 border border-yellow-400/20">
                <Clock className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <h2 className="font-semibold text-white">Timed</h2>
                <p className="text-xs text-game-bg-muted">30s per move</p>
              </div>
            </div>
            <p className="text-sm text-game-bg-muted mb-4 flex-1">
              30 seconds per move. Auto-forfeit after 3 timeouts — think fast!
            </p>
            <button
              id="quick-match-timed"
              onClick={() => handleQuickMatch('timed')}
              className="btn-brand w-full text-sm py-2.5"
            >
              <Swords className="w-4 h-4" />
              Quick Match
            </button>
          </div>
        </motion.div>

        {/* Private Room */}
        <motion.div
          className="glass-card p-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-game-bg-muted" />
            <h2 className="font-semibold text-white text-sm uppercase tracking-wider">Private Room</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Create Room */}
            <div>
              <button
                id="create-room-button"
                onClick={handleCreateRoom}
                disabled={isCreating}
                className="btn-ghost w-full text-sm py-2.5 mb-3"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create Room
              </button>
            </div>

            {/* Join by Code */}
            <div>
              <div className="flex gap-2">
                <input
                  id="join-code-input"
                  type="text"
                  placeholder="Enter match code…"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                  className="input-field text-sm flex-1 py-2.5"
                />
                <button
                  id="join-room-button"
                  onClick={handleJoinRoom}
                  disabled={!joinCode.trim() || isJoining}
                  className="btn-brand px-4 py-2.5 text-sm"
                >
                  {isJoining ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                </button>
              </div>
              {joinError && (
                <p className="text-xs text-game-x mt-1.5">{joinError}</p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Leaderboard link */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <button
            id="view-leaderboard-button"
            onClick={() => navigate('/leaderboard')}
            className="inline-flex items-center gap-2 text-sm text-brand-400 hover:text-brand-300 transition-colors"
          >
            <Trophy className="w-4 h-4" />
            View Leaderboard
          </button>
        </motion.div>
      </div>
    </div>
  );
}
